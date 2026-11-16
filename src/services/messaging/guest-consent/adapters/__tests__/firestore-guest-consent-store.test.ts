/**
 * bogle_users/{uid}/guest_consents/{phoneHash} through the Firestore adapter, on
 * an in-memory Firestore keyed by document path: where the record lives, what
 * it holds (never the number), that a revoke keeps it and a new yes clears the
 * revoke, and that a malformed or missing database never reads as a yes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFirestoreDb } from '../../../../../utils/firestore-utils.js';
import { pathFirestore } from '../../../../outreach/proactive-channels/__tests__/path-firestore.js';
import { GUEST_CONSENT_WORDING_VERSION } from '../../domain/guest-consent.js';
import {
  hasGuestConsent,
  recordGuestConsent,
  revokeGuestConsent,
  type GuestConsentDeps,
} from '../../use-cases/guest-consent.js';
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
  deps = {
    store: firestoreGuestConsentStore(getFirestoreDb()),
    env: { LOG_HASH_SECRET: 'test-only-key' },
    now: () => new Date((clock += 60_000)),
  };
});

const stored = (): [string, Record<string, unknown>] => {
  const entries = [...docs].filter(([path]) => path.startsWith(PREFIX));
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  if (!entry) throw new Error('no record');
  return entry;
};

describe('the Firestore guest consent store', () => {
  it("keeps the yes under the owner's record, keyed by the phone hash", async () => {
    await recordGuestConsent(OWNER, GUEST, V, deps);
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
    await recordGuestConsent(OWNER, GUEST, V, deps);
    await revokeGuestConsent(OWNER, GUEST, deps);
    expect(stored()[1]).toMatchObject({
      wordingVersion: V,
      consentedAt: '2026-11-16T15:01:00.000Z',
      revokedAt: '2026-11-16T15:02:00.000Z',
    });
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);

    await recordGuestConsent(OWNER, GUEST, V, deps);
    const doc = stored()[1];
    expect('revokedAt' in doc).toBe(false);
    expect(doc.consentedAt).toBe('2026-11-16T15:03:00.000Z');
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(true);
  });

  it('never stores the number, in the path or any field', async () => {
    await recordGuestConsent(OWNER, '(555) 555-0123', V, deps);
    await revokeGuestConsent(OWNER, GUEST, deps);
    const all = JSON.stringify([...docs]);
    expect(all).toContain('guest_consents');
    for (const part of ['5555550123', '555-0123', '5550123']) expect(all).not.toContain(part);
  });

  it('reads a malformed record as no yes', async () => {
    await recordGuestConsent(OWNER, GUEST, V, deps);
    const [path] = stored();
    docs.set(path, { wordingVersion: 'one', consentedAt: 7 });
    expect(await hasGuestConsent(OWNER, GUEST, deps)).toBe(false);
  });

  it("the context's entry wires this store, keyed from LOG_HASH_SECRET", async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-only-key');
    const entry = await import('../../index.js');
    expect(await entry.hasGuestConsent(OWNER, GUEST)).toBe(false);
    await entry.recordGuestConsent(OWNER, GUEST, entry.GUEST_CONSENT_WORDING_VERSION);
    expect(stored()[1].wordingVersion).toBe(V);
    expect(await entry.hasGuestConsent(OWNER, GUEST)).toBe(true);
    await entry.revokeGuestConsent(OWNER, GUEST);
    expect(await entry.hasGuestConsent(OWNER, GUEST)).toBe(false);
    vi.unstubAllEnvs();
  });

  it('without a database: reads are no, writes throw', async () => {
    const none = { ...deps, store: firestoreGuestConsentStore(null) };
    expect(await hasGuestConsent(OWNER, GUEST, none)).toBe(false);
    await expect(recordGuestConsent(OWNER, GUEST, V, none)).rejects.toThrow(/Firestore/);
  });
});
