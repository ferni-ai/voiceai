/**
 * Approving an action with a passkey, through the real @simplewebauthn/server
 * verifier and a software authenticator, in Firestore-like optimistic
 * transactions (a commit over changed reads is retried).
 */
import type { Firestore, Transaction } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_CHALLENGE_TTL_MS,
  startApprovalAssertion,
  verifyApprovalAssertion,
} from '../passkey-approval.js';
import { finishRegistration, startRegistration } from '../passkeys.js';
import { fakePasskeysDb } from './passkeys-fake-db.js';
import { SoftAuthenticator } from './soft-authenticator.js';

beforeEach(() => {
  vi.stubEnv('WEBAUTHN_ORIGINS', 'https://app.ferni.ai');
  vi.stubEnv('WEBAUTHN_RP_ID', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('approving an action with a passkey', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);

  async function enrolled(uid = 'alice', fake = fakePasskeysDb()) {
    const device = new SoftAuthenticator();
    const options = await startRegistration(uid, `${uid}@example.com`, fake.db);
    if (options === 'has_passkey') throw new Error('unexpected');
    expect(await finishRegistration(uid, device.register(options), Date.now(), fake.db)).toBe(true);
    return { ...fake, device };
  }

  /** The shape decidePendingAction uses: state check, passkey check, decision, one transaction. */
  function approve(
    db: Firestore,
    actionId: string,
    actionHash: string,
    response: unknown,
    now = Date.now()
  ): Promise<string> {
    return db.runTransaction(async (tx: Transaction) => {
      const ref = db.collection('pending_actions').doc(actionId);
      const action = (await tx.get(ref)).data() as { status: string; actionHash: string };
      if (action.status !== 'pending') return 'already_decided';
      if (action.actionHash !== actionHash) return 'hash_mismatch';
      const ok = await verifyApprovalAssertion(
        tx,
        { uid: 'alice', actionId, actionHash, response: response as never },
        now,
        db
      );
      if (!ok) return 'passkey_failed';
      tx.update(ref, { status: 'approved' });
      return 'approved';
    });
  }

  async function pending(db: Firestore, id: string, actionHash: string) {
    await db.collection('pending_actions').doc(id).set({ status: 'pending', actionHash });
  }

  it('approves with an assertion for this action, and updates the counter', async () => {
    const { db, docs, device } = await enrolled();
    await pending(db, 'A', HASH_A);
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    expect(options?.userVerification).toBe('required');
    expect(options?.allowCredentials?.map((c) => c.id)).toEqual([device.id]);
    expect(await approve(db, 'A', HASH_A, device.assert(options!))).toBe('approved');
    expect(docs.get(`bogle_users/alice/passkeys/${device.id}`)).toMatchObject({ counter: 1 });
    expect(docs.has('webauthn_challenges/alice_approve')).toBe(false);
  });

  it('two concurrent approvals with one challenge succeed once', async () => {
    const { db, docs, device } = await enrolled();
    await pending(db, 'A', HASH_A);
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    const response = device.assert(options!);
    const results = await Promise.all([
      approve(db, 'A', HASH_A, response),
      approve(db, 'A', HASH_A, response),
    ]);
    expect(results.filter((r) => r === 'approved')).toHaveLength(1);
    expect(docs.get('pending_actions/A')).toMatchObject({ status: 'approved' });
  });

  it('two concurrent uses of one challenge verify once, even across different actions', async () => {
    const { db, device } = await enrolled();
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    const response = device.assert(options!);
    const verify = () =>
      db.runTransaction((tx: Transaction) =>
        verifyApprovalAssertion(
          tx,
          { uid: 'alice', actionId: 'A', actionHash: HASH_A, response },
          Date.now(),
          db
        )
      );
    expect((await Promise.all([verify(), verify()])).filter(Boolean)).toHaveLength(1);
  });

  it("a challenge issued for action A can't approve B, and is spent by trying", async () => {
    const { db, device } = await enrolled();
    await pending(db, 'A', HASH_A);
    await pending(db, 'B', HASH_B);
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    const response = device.assert(options!);
    expect(await approve(db, 'B', HASH_B, response)).toBe('passkey_failed');
    expect(await approve(db, 'A', HASH_A, response)).toBe('passkey_failed');
  });

  it('is bound to the action id: twin actions with the same hash stay separate', async () => {
    // Two identical texts to the same person hash the same; one approval still covers one.
    const { db, device } = await enrolled();
    await pending(db, 'A', HASH_A);
    await pending(db, 'A2', HASH_A);
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    expect(await approve(db, 'A2', HASH_A, device.assert(options!))).toBe('passkey_failed');
  });

  it("is bound to the action's hash: the same id with a changed hash fails", async () => {
    const { db, device } = await enrolled();
    await pending(db, 'A', HASH_B);
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    expect(await approve(db, 'A', HASH_B, device.assert(options!))).toBe('passkey_failed');
  });

  it('is good for 2 minutes and no longer', async () => {
    const TWO_MINUTES = 2 * 60 * 1000;
    expect(APPROVAL_CHALLENGE_TTL_MS).toBe(TWO_MINUTES);
    const { db, device } = await enrolled();
    await pending(db, 'A', HASH_A);
    const t0 = Date.now();
    let options = await startApprovalAssertion('alice', 'A', HASH_A, t0, db);
    const late = t0 + TWO_MINUTES + 1;
    expect(await approve(db, 'A', HASH_A, device.assert(options!), late)).toBe('passkey_failed');
    options = await startApprovalAssertion('alice', 'A', HASH_A, t0, db);
    const justInTime = t0 + TWO_MINUTES;
    expect(await approve(db, 'A', HASH_A, device.assert(options!), justInTime)).toBe('approved');
  });

  it('two passkeys answering one challenge at the same moment verify once', async () => {
    const { db, docs, device } = await enrolled();
    // A second passkey on the same account (registered elsewhere, copied in).
    const other = await enrolled('carol');
    for (const [path, data] of other.docs) {
      if (path.startsWith('bogle_users/carol/passkeys/')) {
        await db
          .collection('bogle_users')
          .doc('alice')
          .collection('passkeys')
          .doc(other.device.id)
          .set(data);
      }
    }
    const options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db);
    expect(options?.allowCredentials).toHaveLength(2);
    const verify = (response: unknown) =>
      db.runTransaction((tx: Transaction) =>
        verifyApprovalAssertion(
          tx,
          { uid: 'alice', actionId: 'A', actionHash: HASH_A, response: response as never },
          Date.now(),
          db
        )
      );
    const results = await Promise.all([
      verify(device.assert(options!)),
      verify(other.device.assert(options!)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(docs.has('webauthn_challenges/alice_approve')).toBe(false);
  });

  it("refuses someone else's passkey and an assertion without user verification", async () => {
    const fake = fakePasskeysDb();
    const bob = await enrolled('bob', fake);
    const alice = await enrolled('alice', fake);
    await pending(fake.db, 'A', HASH_A);
    let options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), fake.db);
    expect(await approve(fake.db, 'A', HASH_A, bob.device.assert(options!))).toBe('passkey_failed');
    options = await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), fake.db);
    const noUv = alice.device.assert(options!, { userVerified: false });
    expect(await approve(fake.db, 'A', HASH_A, noUv)).toBe('passkey_failed');
  });

  it('offers nothing to an account without a passkey', async () => {
    const { db } = fakePasskeysDb();
    expect(await startApprovalAssertion('alice', 'A', HASH_A, Date.now(), db)).toBeNull();
  });
});
