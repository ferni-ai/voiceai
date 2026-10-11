import { describe, expect, it } from 'vitest';
import {
  APPROVAL_USE_MS,
  PENDING_ACTION_TTL_MS,
  assertStorablePayload,
  consumePageApproval,
  createPendingAction,
  decidePendingAction,
  getPendingActionForUser,
  hashAction,
  voiceMayConfirm,
} from '../pending-actions.js';
import { fakeFirestore } from './fake-firestore.js';

const T0 = 1_760_000_000_000;
const TEXT = { to: '+15551230000', body: 'Running 10 min late, sorry!' };

async function setup(
  kind: 'send_text' | 'purchase' = 'send_text',
  payload: Record<string, string | number> = TEXT
) {
  const { db, docs } = fakeFirestore();
  const created = await createPendingAction('alice', kind, payload, T0, db);
  return { db, docs, ...created };
}

function approve(
  db: ReturnType<typeof fakeFirestore>['db'],
  id: string,
  actionHash: string,
  now = T0 + 1000
) {
  return decidePendingAction(
    { id, userId: 'alice', decision: 'approve', actionHash, authTime: T0, passkeyVerified: false },
    now,
    db
  );
}

describe('createPendingAction', () => {
  it('stores the exact payload with a 256-bit id, its hash and a 5-minute expiry', async () => {
    const { db, id, actionHash, expiresAt, url } = await setup();
    expect(Buffer.from(id, 'base64url')).toHaveLength(32);
    expect(url.endsWith(`/p/${id}`)).toBe(true);
    expect(expiresAt).toBe(T0 + PENDING_ACTION_TTL_MS);
    const stored = await getPendingActionForUser(id, 'alice', db);
    expect(stored).toMatchObject({
      payload: TEXT,
      actionHash,
      status: 'pending',
      moneyMoving: false,
    });
    expect(await getPendingActionForUser(id, 'bob', db)).toBeNull();
  });
});

describe('hash binding', () => {
  it('changes with any field, the kind or the owner, and not with key order', () => {
    const base = hashAction('send_text', 'alice', TEXT);
    expect(hashAction('send_text', 'alice', { body: TEXT.body, to: TEXT.to })).toBe(base);
    expect(hashAction('send_text', 'alice', { ...TEXT, to: '+15559999999' })).not.toBe(base);
    expect(hashAction('place_call', 'alice', TEXT)).not.toBe(base);
    expect(hashAction('send_text', 'bob', TEXT)).not.toBe(base);
  });

  it('an approval for action A never satisfies action B', async () => {
    const { db } = fakeFirestore();
    const a = await createPendingAction('alice', 'send_text', TEXT, T0, db);
    const B = { ...TEXT, body: 'Send me $500' };
    const b = await createPendingAction('alice', 'send_text', B, T0, db);
    expect(await approve(db, b.id, a.actionHash)).toBe('hash_mismatch');
    expect(await approve(db, a.id, a.actionHash)).toBe('approved');
    // The executor names what it is about to run; A's approval never runs B.
    expect(await consumePageApproval(a.id, 'alice', 'send_text', B, T0 + 2000, db)).toBe(false);
    expect(await consumePageApproval(a.id, 'alice', 'place_call', TEXT, T0 + 2000, db)).toBe(false);
    expect(await consumePageApproval(b.id, 'alice', 'send_text', B, T0 + 2000, db)).toBe(false);
    expect(await consumePageApproval(a.id, 'alice', 'send_text', TEXT, T0 + 2000, db)).toBe(true);
  });

  it('refuses an action whose stored payload was edited after it was hashed', async () => {
    const { db, docs, id, actionHash } = await setup();
    const key = `pending_actions/${id}`;
    docs.set(key, { ...docs.get(key), payload: { ...TEXT, to: '+15559999999' } });
    expect(await approve(db, id, actionHash)).toBe('hash_mismatch');
  });
});

describe('expiry and single use', () => {
  it('cannot be approved after 5 minutes', async () => {
    const { db, id, actionHash } = await setup();
    expect(await approve(db, id, actionHash, T0 + PENDING_ACTION_TTL_MS + 1)).toBe('expired');
  });

  it('an approval is usable for 2 minutes after it was given, then not', async () => {
    const lateApproval = T0 + PENDING_ACTION_TTL_MS - 1000;
    const first = await setup();
    expect(await approve(first.db, first.id, first.actionHash, lateApproval)).toBe('approved');
    const inWindow = lateApproval + APPROVAL_USE_MS;
    expect(
      await consumePageApproval(first.id, 'alice', 'send_text', TEXT, inWindow, first.db)
    ).toBe(true);
    const second = await setup();
    expect(await approve(second.db, second.id, second.actionHash, lateApproval)).toBe('approved');
    const after = lateApproval + APPROVAL_USE_MS + 1;
    expect(await consumePageApproval(second.id, 'alice', 'send_text', TEXT, after, second.db)).toBe(
      false
    );
  });

  it('is used once, and only by its owner', async () => {
    const { db, id, actionHash } = await setup();
    const use = (who: string, now: number) =>
      consumePageApproval(id, who, 'send_text', TEXT, now, db);
    expect(await use('alice', T0 + 500)).toBe(false); // not approved yet
    expect(await approve(db, id, actionHash)).toBe('approved');
    expect(await use('bob', T0 + 2000)).toBe(false);
    expect(await use('alice', T0 + 2000)).toBe(true);
    expect(await use('alice', T0 + 3000)).toBe(false);
  });

  it("can't be decided twice, or by someone else", async () => {
    const { db, id, actionHash } = await setup();
    const bob = await decidePendingAction(
      { id, userId: 'bob', decision: 'approve', actionHash, authTime: T0, passkeyVerified: false },
      T0 + 1000,
      db
    );
    expect(bob).toBe('not_found');
    expect(await approve(db, id, actionHash)).toBe('approved');
    expect(await approve(db, id, actionHash)).toBe('already_decided');
  });

  it('a decline is recorded and never usable', async () => {
    const { db, id, actionHash } = await setup();
    const out = await decidePendingAction(
      {
        id,
        userId: 'alice',
        decision: 'decline',
        actionHash,
        authTime: T0,
        passkeyVerified: false,
      },
      T0 + 1000,
      db
    );
    expect(out).toBe('declined');
    expect(await consumePageApproval(id, 'alice', 'send_text', TEXT, T0 + 2000, db)).toBe(false);
  });
});

describe('money-moving actions', () => {
  const PURCHASE = {
    item: 'Running shoes',
    amountCents: 12999,
    currency: 'USD',
    merchant: 'Example Shoes',
  };

  it('are never confirmable by voice', () => {
    expect(voiceMayConfirm('purchase')).toBe(false);
    expect(voiceMayConfirm('send_text')).toBe(true);
    expect(voiceMayConfirm('place_call')).toBe(true);
  });

  it('need a passkey on the page; without one they cannot be approved', async () => {
    const { db, id, actionHash } = await setup('purchase', PURCHASE);
    expect(await approve(db, id, actionHash)).toBe('passkey_required');
    const withPasskey = await decidePendingAction(
      { id, userId: 'alice', decision: 'approve', actionHash, authTime: T0, passkeyVerified: true },
      T0 + 1000,
      db
    );
    expect(withPasskey).toBe('approved');
  });
});

describe('assertStorablePayload', () => {
  it('refuses card numbers and secret-named fields', () => {
    expect(() => assertStorablePayload({ note: 'pay with 4242 4242 4242 4242' })).toThrow(
      /card number/
    );
    expect(() => assertStorablePayload({ cardNumber: 'x' })).toThrow(/secret/);
    expect(() => assertStorablePayload({ card_cvc: '123' })).toThrow(/secret/);
    expect(() => assertStorablePayload({ accountNumber: '1' })).toThrow(/secret/);
    for (const key of ['cardnumber', 'ccnum', 'pin', 'ssn', 'apiKey', 'passcode', 'routing']) {
      expect(() => assertStorablePayload({ [key]: 'x' })).toThrow(/secret/);
    }
    expect(() => assertStorablePayload({ ref: 4111111111111111 })).toThrow(/card number/);
    expect(() => assertStorablePayload({ note: '4111.1111.1111.1111' })).toThrow(/card number/);
    expect(() => assertStorablePayload({ note: '4111/1111/1111/1111' })).toThrow(/card number/);
  });

  it('allows ordinary fields whose names only contain those letters', () => {
    expect(() =>
      assertStorablePayload({ company: 'Acme', discard: 'no', to: '+15551230000' })
    ).not.toThrow();
    expect(() => assertStorablePayload({ orderRef: '1234567890123' })).not.toThrow(); // fails Luhn
    // Two phone numbers in one text are separate runs, not one long number.
    const twoNumbers = 'call 555-123-4567 or 555-765-4321, or 555 222 3333, 555 444 5555';
    expect(() => assertStorablePayload({ body: twoNumbers })).not.toThrow();
  });

  it('refuses empty, nested or oversized payloads', () => {
    expect(() => assertStorablePayload({})).toThrow();
    expect(() => assertStorablePayload({ a: { b: 1 } as unknown as string })).toThrow(/flat/);
    expect(() => assertStorablePayload({ body: 'x'.repeat(1001) })).toThrow(/too long/);
    expect(() => assertStorablePayload({ amount: Number.NaN })).toThrow(/flat/);
    expect(() => assertStorablePayload({ amount: Number.POSITIVE_INFINITY })).toThrow(/flat/);
  });
});
