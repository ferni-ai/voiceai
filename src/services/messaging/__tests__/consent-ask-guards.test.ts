/**
 * The consent ask's own guards, each pinned on its own: only to someone the owner
 * knows (their contacts or relationships), never while the owner or the number is
 * held by a minor-care call, never to a number that opted out (refused before the
 * ask is claimed), and a YES never grants an owner whose account is gone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';

const saved = vi.hoisted(() => ({
  contacts: new Map<string, string[]>(),
  told: new Map<string, string[]>(),
  unreadable: false,
  held: new Set<string>(),
  accounts: new Set<string>(),
}));
vi.mock('../../identity/contacts/contacts-management.js', () => ({
  loadUserContacts: async (uid: string) =>
    saved.unreadable
      ? { ok: false, error: 'down' }
      : {
          ok: true,
          contacts: [{ phones: (saved.contacts.get(uid) ?? []).map((number) => ({ number })) }],
        },
}));
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  loadContacts: async (uid: string) =>
    saved.unreadable
      ? { ok: false, error: 'down' }
      : { ok: true, contacts: (saved.told.get(uid) ?? []).map((phone) => ({ phone })) },
}));
vi.mock('../../outreach/minor-care-shared-hold.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outreach/minor-care-shared-hold.js')>()),
  sharedHeld: async (id: string | undefined) => id !== undefined && saved.held.has(id),
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({ get: async () => ({ exists: saved.accounts.has(`${c}/${id}`) }) }),
    }),
  }),
}));

import { claimConsentAsk, hasGrant, recordContactYes } from '../consent-grants.js';
import { sendConsentAsk } from '../consent-ask.js';
import { writeOptOut, type ConsentDeps } from '../consent.js';
import { phoneHash, phoneHoldId, type StoredCheckin } from '../../outreach/checkin-replies.js';
import type { TextDeps, TextStore } from '../../outreach/guarded-text.js';

const PAT = '+12025550188';
const STRANGER = '+12025550177';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash(PAT, env) as string;
const now = new Date('2026-10-18T16:00:00Z'); // noon in Washington: not quiet hours

let m: ReturnType<typeof memoryConsentStore>;
let deps: ConsentDeps;
let texts: StoredCheckin[];
const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
const userDoc = vi.fn(async () => ({ displayName: 'Seth Example' }));
const text = (): TextDeps => {
  const store: TextStore = {
    forUser: async () => [],
    forPhoneHash: async (h) => texts.filter((t) => t.phoneHash === h),
    add: async (r) => (texts.push({ ...r, id: r.refId ?? 'x' }), 'id'),
    lock: async () => true,
    lockedAt: async () => undefined,
    unlock: async () => undefined,
    sponsoredPhone: async () => undefined,
    isOptedOut: async () => false,
    consentDoc: async (h: string) => m.store.read(h),
    userDoc,
    legacySmsChannels: async () => undefined,
  };
  return { env, store, authPhone: async () => '+12025550100', send, now: () => now };
};
const ask = (toPhone = PAT) => ({
  senderUserId: 'owner-1',
  toPhone,
  refId: 'ask-1',
  zone: 'America/New_York',
  ownerConfirmed: true,
});

beforeEach(() => {
  m = memoryConsentStore();
  deps = { env, store: m.store, now: () => now };
  texts = [];
  send.mockClear();
  userDoc.mockClear();
  saved.contacts = new Map([['owner-1', [PAT]]]);
  saved.told = new Map();
  saved.unreadable = false;
  saved.held = new Set();
  saved.accounts = new Set(['bogle_users/owner-1']);
});

describe('sendConsentAsk: only to someone the owner knows', () => {
  it('an arbitrary number is refused, unclaimed and unsent', async () => {
    const out = await sendConsentAsk(ask(STRANGER), { text: text(), consent: deps });
    expect(out).toEqual({ sent: false, reason: 'not-a-contact' });
    expect(m.docs.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('a saved contact, or a person the owner told Ferni about, may be asked', async () => {
    expect(await sendConsentAsk(ask(), { text: text(), consent: deps })).toEqual({ sent: true });
    saved.told = new Map([['owner-1', ['(202) 555-0177']]]);
    expect(await sendConsentAsk(ask(STRANGER), { text: text(), consent: deps })).toEqual({
      sent: true,
    });
  });

  it("another owner's contact is not this owner's", async () => {
    saved.contacts = new Map([['owner-2', [PAT]]]);
    const out = await sendConsentAsk(ask(), { text: text(), consent: deps });
    expect(out).toEqual({ sent: false, reason: 'not-a-contact' });
  });

  it('contacts that cannot be read: refused', async () => {
    saved.unreadable = true;
    const out = await sendConsentAsk(ask(), { text: text(), consent: deps });
    expect(out).toEqual({ sent: false, reason: 'not-a-contact' });
  });
});

describe('sendConsentAsk: MINOR_CARE_SHARED_HOLD', () => {
  it('refused while the owner is held', async () => {
    saved.held.add('owner-1');
    expect(await sendConsentAsk(ask(), { text: text(), consent: deps })).toEqual({
      sent: false,
      reason: 'held',
    });
    expect(m.docs.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('refused while the number is held', async () => {
    saved.held.add(phoneHoldId(PAT, env) as string);
    expect(await sendConsentAsk(ask(), { text: text(), consent: deps })).toEqual({
      sent: false,
      reason: 'held',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sendConsentAsk: an opted-out number', () => {
  it('is refused before the ask is claimed or the owner looked up', async () => {
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    const before = structuredClone(m.docs.get(HASH));
    const apply = vi.spyOn(m.store, 'apply');
    const out = await sendConsentAsk(ask(), { text: text(), consent: deps });
    expect(out).toEqual({ sent: false, reason: 'opted-out' });
    expect(apply).not.toHaveBeenCalled();
    expect(userDoc).not.toHaveBeenCalled();
    expect(m.docs.get(HASH)).toEqual(before);
  });
});

describe('recordContactYes: an owner whose account is gone', () => {
  const askBy = async (owner: string): Promise<void> => {
    await claimConsentAsk(HASH, owner, deps, `ask-${owner}`);
    texts.push({
      id: `ask-${owner}`,
      userId: owner,
      sessionId: `ask-${owner}`,
      refId: `ask-${owner}`,
      sentAt: now.toISOString(),
      question: 'q',
      status: 'sent',
      phoneLast4: '0188',
      phoneHash: HASH,
      kind: 'on-behalf',
    });
  };

  it("a YES to a deleted owner's ask grants nothing (default account check)", async () => {
    await askBy('erased-owner');
    expect(await recordContactYes(PAT, 'yes', 'SMerased00001', deps, async () => texts)).toEqual(
      []
    );
    expect(await hasGrant(HASH, 'erased-owner', 'sms', deps)).toBe(false);
  });

  it('the same YES to a live owner grants (the check reads the account)', async () => {
    await askBy('owner-1');
    expect(await recordContactYes(PAT, 'yes', 'SMlive0000001', deps, async () => texts)).toEqual([
      'sms',
    ]);
    expect(await hasGrant(HASH, 'owner-1', 'sms', deps)).toBe(true);
  });
});
