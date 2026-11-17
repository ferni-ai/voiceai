/**
 * bogle_users/{uid}/guest_consents/{phoneHash} through the Firestore adapter, on
 * an in-memory Firestore keyed by document path: where the record lives, what
 * it holds (never the number), that a revoke keeps it and a new yes clears the
 * revoke, that a malformed or missing database never reads as a yes, and that
 * an owner whose account is gone or being erased gets no consent written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erasingMark } from '../../../../../utils/erasing-mark.js';
import { getFirestoreDb } from '../../../../../utils/firestore-utils.js';
import { pathFirestore } from '../../../../outreach/proactive-channels/__tests__/path-firestore.js';
import { GUEST_CONSENT_WORDING_VERSION } from '../../domain/guest-consent.js';
import { phoneHash } from '../../../../outreach/checkin-replies.js';
import { hasGuestConsent, revokeGuestConsent } from '../../use-cases/check-guest-consent.js';
import { recordGuestConsentByKey, type GuestConsentDeps } from '../../use-cases/guest-consent.js';
import { firestoreGuestConsentStore } from '../firestore-guest-consent-store.js';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => state.db,
}));

const OWNER = 'u-fictional-owner';
const GUEST = '+15555550123'; // fictional (555-01xx)
const V = GUEST_CONSENT_WORDING_VERSION;
const PREFIX = `bogle_users/${OWNER}/guest_consents/`;

let docs: Map<string, Record<string, unknown>>;
let deps: GuestConsentDeps;
let clock: number;

beforeEach(() => {
  docs = new Map();
  clock = Date.parse('2026-11-16T15:00:00Z');
  state.db = pathFirestore(docs);
  docs.set(`bogle_users/${OWNER}`, { displayName: 'Rowan Ellery' });
  deps = {
    store: firestoreGuestConsentStore(getFirestoreDb()),
    env: { LOG_HASH_SECRET: 'test-only-key' },
    now: () => new Date((clock += 60_000)),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Her yes by key, as a guest's invite records it. */
const yes = async (owner: string, e164: string, v: number, d: GuestConsentDeps) =>
  recordGuestConsentByKey(owner, phoneHash(e164, d.env) ?? '', v, d);

const stored = (): [string, Record<string, unknown>] => {
  const entries = [...docs].filter(([path]) => path.startsWith(PREFIX));
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  if (!entry) throw new Error('no record');
  return entry;
};

describe('the Firestore guest consent store', () => {
  it("keeps the yes under the owner's record, keyed by the phone hash", async () => {
    await yes(OWNER, GUEST, V, deps);
    const [path, doc] = stored();
    expect(path.slice(PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
    expect(doc).toEqual({
      wordingVersion: V,
      consentedAt: '2026-11-16T15:01:00.000Z',
      keyVersion: expect.stringMatching(/^after-call-checkin\/phone\/v1:[0-9a-f]{8}$/),
      history: [`2026-11-16T15:01:00.000Z yes v${V}`],
    });
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(true);
  });

  it('a revoke keeps the record and sets revokedAt; a new yes clears it', async () => {
    await yes(OWNER, GUEST, V, deps);
    await revokeGuestConsent(OWNER, GUEST, deps);
    expect(stored()[1]).toMatchObject({
      wordingVersion: V,
      consentedAt: '2026-11-16T15:01:00.000Z',
      revokedAt: '2026-11-16T15:02:00.000Z',
    });
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);

    await yes(OWNER, GUEST, V, deps);
    const doc = stored()[1];
    expect('revokedAt' in doc).toBe(false);
    expect(doc.consentedAt).toBe('2026-11-16T15:03:00.000Z');
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(true);
  });

  it('never stores the number, in the path or any field', async () => {
    await yes(OWNER, '(555) 555-0123', V, deps);
    await revokeGuestConsent(OWNER, GUEST, deps);
    const all = JSON.stringify([...docs]);
    expect(all).toContain('guest_consents');
    for (const part of ['5555550123', '555-0123', '5550123']) expect(all).not.toContain(part);
  });

  it('reads a malformed record as no yes', async () => {
    await yes(OWNER, GUEST, V, deps);
    const [path] = stored();
    docs.set(path, { wordingVersion: 'one', consentedAt: 7 });
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);
  });

  it('writes nothing for an owner whose account is being erased, or gone', async () => {
    docs.set(`bogle_users/${OWNER}`, erasingMark());
    await yes(OWNER, GUEST, V, deps);
    expect([...docs.keys()].filter((path) => path.startsWith(PREFIX))).toEqual([]);
    docs.delete(`bogle_users/${OWNER}`);
    await yes(OWNER, GUEST, V, deps);
    expect([...docs.keys()].filter((path) => path.startsWith(PREFIX))).toEqual([]);
  });

  it('a revoke for an owner being erased deletes the record: no doc, no consent', async () => {
    await yes(OWNER, GUEST, V, deps);
    docs.set(`bogle_users/${OWNER}`, erasingMark());
    await revokeGuestConsent(OWNER, GUEST, deps);
    expect([...docs.keys()].filter((path) => path.startsWith(PREFIX))).toEqual([]);
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);
  });

  it('a revoke for an owner whose account is gone deletes the record too', async () => {
    await yes(OWNER, GUEST, V, deps);
    docs.delete(`bogle_users/${OWNER}`);
    await revokeGuestConsent(OWNER, GUEST, deps);
    expect([...docs.keys()].filter((path) => path.startsWith(PREFIX))).toEqual([]);
  });

  it('a yes on record reads as no once the owner is being erased, or gone', async () => {
    await yes(OWNER, GUEST, V, deps);
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(true);
    docs.set(`bogle_users/${OWNER}`, erasingMark());
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);
    docs.delete(`bogle_users/${OWNER}`);
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);
    expect(stored()[1].revokedAt).toBeUndefined(); // the read says no; the record is unchanged
  });

  it('without a database: reads are no, writes throw', async () => {
    const none = { ...deps, store: firestoreGuestConsentStore(null) };
    expect(await hasGuestConsent(OWNER, GUEST, none)).toBe(false);
    await expect(yes(OWNER, GUEST, V, none)).rejects.toThrow(/Firestore/);
  });
});
