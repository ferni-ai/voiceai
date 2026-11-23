/**
 * A guest's invite through the context's entry (index.ts) and the Firestore
 * adapters, on an in-memory Firestore: guest_invites/{sha256(token)} (stored
 * as task 9c will mint it) is gone once answered; her yes lands in
 * bogle_users/{owner}/guest_consents/{phoneHash}; her forget deletes that record;
 * an owner being erased gets no consent written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFirestoreDb } from '../../../../../utils/firestore-utils.js';
import { pathFirestore } from '../../../../outreach/proactive-channels/__tests__/path-firestore.js';
import { firestoreSingleUseStore, sha256Hex } from '../../../../stores/single-use-records.js';
import { erasingMark } from '../../../../../utils/erasing-mark.js';
import { answerGuestInvite, viewGuestInvite } from '../../index.js';
import { hasGuestConsent as check } from '../../use-cases/check-guest-consent.js';
import { firestoreGuestConsentStore } from '../firestore-guest-consent-store.js';
import { phoneHash } from '../../../../outreach/checkin-replies.js';
import { newInvite } from '../../__tests__/memory-guest-invite.js';

const OWNER = 'u-fictional-owner';
const GUEST = '+15555550123'; // fictional (555-01xx)
const KEY = 'test-only-key';
const docs = new Map<string, Record<string, unknown>>();

/** An invite stored through the real single-use store, as task 9c will mint it; its token. */
async function mint(): Promise<string> {
  const { token, key, invite } = newInvite(OWNER, GUEST, { LOG_HASH_SECRET: KEY }, Date.now());
  expect(await firestoreSingleUseStore('guest_invites').put(key, invite)).toBe(true);
  return token;
}

beforeEach(() => {
  docs.clear();
  vi.mocked(getFirestoreDb).mockReturnValue(pathFirestore(docs) as never);
  vi.stubEnv('LOG_HASH_SECRET', KEY);
  docs.set(`bogle_users/${OWNER}`, { displayName: 'Rowan Ellery' });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const hasGuestConsent = async (owner: string, e164: string) =>
  check(owner, e164, {
    store: firestoreGuestConsentStore(getFirestoreDb()),
    env: { LOG_HASH_SECRET: KEY },
    now: () => new Date(),
  });

const consentPath = () =>
  `bogle_users/${OWNER}/guest_consents/${phoneHash(GUEST, { LOG_HASH_SECRET: KEY })}`;

describe('guest invites on Firestore, through the entry', () => {
  it('stores only hashes, shows the wording, takes her yes once and is then gone', async () => {
    const token = await mint();
    const invitePath = `guest_invites/${sha256Hex(token)}`;
    const stored = docs.get(invitePath);
    expect(stored).toMatchObject({
      uid: OWNER,
      phoneHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(stored?.ttlAt).toBeInstanceOf(Date);
    const all = JSON.stringify([...docs]);
    for (const secret of [token, '5555550123', '555-0123']) expect(all).not.toContain(secret);

    expect((await viewGuestInvite(token))?.ownerFirstName).toBe('Rowan');
    expect(await answerGuestInvite(token, 'yes')).toBe(true);
    expect(docs.has(invitePath)).toBe(false);
    expect(docs.get(consentPath())).toMatchObject({ wordingVersion: 1 });
    expect(await hasGuestConsent(OWNER, GUEST)).toBe(true);
    expect(await answerGuestInvite(token, 'yes')).toBe(false);
    const kept = JSON.stringify([...docs]);
    for (const secret of [token, '5555550123', '555-0123']) expect(kept).not.toContain(secret);
  });

  it('forget deletes her consent record', async () => {
    await answerGuestInvite(await mint(), 'yes');
    expect(docs.has(consentPath())).toBe(true);
    expect(await answerGuestInvite(await mint(), 'forget')).toBe(true);
    expect(docs.has(consentPath())).toBe(false);
    expect(await hasGuestConsent(OWNER, GUEST)).toBe(false);
  });

  it('an owner being erased gets no consent from her yes', async () => {
    const token = await mint();
    docs.set(`bogle_users/${OWNER}`, erasingMark());
    expect(await answerGuestInvite(token, 'yes')).toBe(true);
    expect([...docs.keys()].filter((path) => path.includes('/guest_consents/'))).toEqual([]);
  });
});
