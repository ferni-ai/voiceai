/**
 * A guest's yes to being called into an owner's calls: only a standing yes to
 * the current wording counts, a revoke ends it but keeps the record, and the
 * guest's number is kept only as a keyed hash. On an in-memory store.
 *
 * The wording version in force is 2 here (the real constant, raised for this
 * file), so a yes to version 1 is a yes to an older wording. A yes is recorded
 * by key (as a guest's invite does); checks and revokes go by her number.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_CONSENT_WORDING_VERSION } from '../domain/guest-consent.js';
import { phoneHash, toE164 } from '../../../outreach/checkin-replies.js';
import { hasGuestConsent, revokeGuestConsent } from '../use-cases/check-guest-consent.js';
import { recordGuestConsentByKey, type GuestConsentDeps } from '../use-cases/guest-consent.js';
import { memoryGuestConsentStore } from './memory-guest-consent-store.js';

vi.mock('../domain/guest-consent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../domain/guest-consent.js')>()),
  GUEST_CONSENT_WORDING_VERSION: 2,
}));

const OWNER = 'u-fictional-owner';
const OTHER_OWNER = 'u-fictional-other';
const GUEST = '+15555550123'; // fictional (555-01xx)
const KEY_A = 'test-only-key-a';
const KEY_B = 'test-only-key-b';
const V = GUEST_CONSENT_WORDING_VERSION;

let m: ReturnType<typeof memoryGuestConsentStore>;
let clock: number;
const depsWith = (over: Partial<GuestConsentDeps> = {}): GuestConsentDeps => ({
  store: m.store,
  env: { LOG_HASH_SECRET: KEY_A },
  now: () => new Date((clock += 60_000)),
  ...over,
});

beforeEach(() => {
  m = memoryGuestConsentStore();
  clock = Date.parse('2026-11-16T15:00:00Z');
});

/** Her yes by key: the number keyed as the invite keeps it ('' when it can't be). */
const yes = async (owner: string, e164: string, v: number, deps: GuestConsentDeps, saidAt?: Date) =>
  recordGuestConsentByKey(owner, phoneHash(toE164(e164) ?? '', deps.env) ?? '', v, deps, saidAt);

const only = (): [string, Record<string, unknown>] => {
  expect(m.docs.size).toBe(1);
  const [entry] = [...m.docs];
  if (!entry) throw new Error('no record');
  return [entry[0], { ...entry[1] }];
};

describe('hasGuestConsent', () => {
  it('no record means no consent', async () => {
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
  });

  it('a yes to the current wording means consent', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(true);
  });

  it('a yes, then a revoke, means no consent, and the record stays with both times', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
    const [, doc] = only();
    expect(doc.wordingVersion).toBe(V);
    expect(doc.consentedAt).toBe('2026-11-16T15:01:00.000Z');
    expect(doc.revokedAt).toBe('2026-11-16T15:02:00.000Z');
    expect(doc.history).toEqual([
      `2026-11-16T15:01:00.000Z yes v${V}`,
      '2026-11-16T15:02:00.000Z revoked',
    ]);
  });

  it('a revoke followed by a new yes means consent, with the new wording and no revokedAt', async () => {
    await yes(OWNER, GUEST, 1, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith());
    await yes(OWNER, GUEST, V, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(true);
    const [, doc] = only();
    expect(doc.wordingVersion).toBe(V);
    expect(doc.consentedAt).toBe('2026-11-16T15:03:00.000Z');
    expect('revokedAt' in doc).toBe(false);
    expect(doc.history).toHaveLength(3);
  });

  it('a revoke followed by a stale yes (said before the revoke) still means no consent', async () => {
    const saidAt = new Date('2026-11-16T15:01:30Z'); // the guest tapped yes again
    await yes(OWNER, GUEST, V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith()); // 15:02: then she said stop
    await yes(OWNER, GUEST, V, depsWith(), saidAt); // a retried yes lands late
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
    const [, doc] = only();
    expect(doc.revokedAt).toBe('2026-11-16T15:02:00.000Z');
    expect(doc.history).toHaveLength(2);
  });

  it('a yes stamped at the very time of the revoke leaves the revoke standing', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith()); // 15:02
    await yes(OWNER, GUEST, V, depsWith(), new Date('2026-11-16T15:02:00Z'));
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
    expect(only()[1].revokedAt).toBe('2026-11-16T15:02:00.000Z');
  });

  it('a yes said after the revoke, stamped with that time, clears it', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith()); // 15:02
    await yes(OWNER, GUEST, V, depsWith(), new Date('2026-11-16T15:02:30Z'));
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(true);
    expect(only()[1].consentedAt).toBe('2026-11-16T15:02:30.000Z');
  });

  it('a yes to an older wording means no consent; the current one counts', async () => {
    expect(V).toBe(2);
    await yes(OWNER, GUEST, 1, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
    await yes(OWNER, GUEST, V, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(true);
  });

  it('no caller can lower the bar: an extra wordingVersion in deps is ignored', async () => {
    await yes(OWNER, GUEST, 1, depsWith());
    const lowered = { ...depsWith(), wordingVersion: 1 };
    expect(await hasGuestConsent(OWNER, GUEST, lowered)).toBe(false);
  });

  it("is one owner's: a yes for one owner gives another nothing", async () => {
    await yes(OWNER, GUEST, V, depsWith());
    expect(await hasGuestConsent(OTHER_OWNER, GUEST, depsWith())).toBe(false);
  });

  it('normalises the number first: any spelling of it finds the same record', async () => {
    await yes(OWNER, '(555) 555-0123', V, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(true);
    expect(await hasGuestConsent(OWNER, '555.555.0123', depsWith())).toBe(true);
  });

  it('fails closed: no hash key, a number that is not one, or an unreadable store is no', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    expect(await hasGuestConsent(OWNER, GUEST, depsWith({ env: {} }))).toBe(false);
    expect(await hasGuestConsent(OWNER, 'call me maybe', depsWith())).toBe(false);
    expect(await hasGuestConsent('  ', GUEST, depsWith())).toBe(false);
    m.state.failReads = true;
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
  });

  it('when keying the number throws, a check is no, and a yes or revoke throws', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    const env = {
      get LOG_HASH_SECRET(): string {
        throw new Error('secret unavailable');
      },
    };
    expect(await hasGuestConsent(OWNER, GUEST, depsWith({ env }))).toBe(false);
    await expect(yes(OWNER, GUEST, V, depsWith({ env }))).rejects.toThrow(/secret unavailable/);
    await expect(revokeGuestConsent(OWNER, GUEST, depsWith({ env }))).rejects.toThrow(
      /secret unavailable/
    );
    expect(only()[1].revokedAt).toBeUndefined();
  });
});

describe('the stored record', () => {
  it('is keyed by a keyed hash: another key gives another id, and it is not a plain SHA-256', async () => {
    await yes(OWNER, GUEST, V, depsWith());
    const [idA] = only();
    m.docs.clear();
    await yes(OWNER, GUEST, V, depsWith({ env: { LOG_HASH_SECRET: KEY_B } }));
    const [idB] = only();
    const hashA = idA.split('/')[1] ?? '';
    const hashB = idB.split('/')[1] ?? '';
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).not.toBe(hashA);
    const plain = (s: string) => createHash('sha256').update(s).digest('hex');
    for (const spelling of [GUEST, '15555550123', '5555550123']) {
      expect(hashA).not.toBe(plain(spelling));
    }
    // a yes under one key is not found under another
    expect(await hasGuestConsent(OWNER, GUEST, depsWith())).toBe(false);
  });

  it('never holds the number: not in the id, not in any field', async () => {
    await yes(OWNER, '(555) 555-0123', V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith());
    await yes(OWNER, GUEST, V, depsWith());
    const stored = JSON.stringify([...m.docs]);
    expect(stored).toContain(OWNER); // the check reads the real record
    for (const part of ['5555550123', '555-0123', '5550123']) expect(stored).not.toContain(part);
  });

  it('a revoke with no yes on record writes nothing; a second revoke keeps the first time', async () => {
    await revokeGuestConsent(OWNER, GUEST, depsWith());
    expect(m.docs.size).toBe(0);
    await yes(OWNER, GUEST, V, depsWith());
    await revokeGuestConsent(OWNER, GUEST, depsWith()); // 15:03, the first revoke of the yes
    await revokeGuestConsent(OWNER, GUEST, depsWith()); // 15:04, changes nothing
    const [, doc] = only();
    expect(doc.revokedAt).toBe('2026-11-16T15:03:00.000Z');
  });

  it('a yes or revoke that cannot be keyed is refused, not dropped', async () => {
    await expect(yes(OWNER, GUEST, V, depsWith({ env: {} }))).rejects.toThrow(/owner and a key/);
    await expect(yes(OWNER, 'not a number', V, depsWith())).rejects.toThrow(/owner and a key/);
    await expect(yes('  ', GUEST, V, depsWith())).rejects.toThrow(/owner and a key/);
    await expect(revokeGuestConsent(OWNER, GUEST, depsWith({ env: {} }))).rejects.toThrow(
      /cannot be keyed/
    );
    await expect(yes(OWNER, GUEST, 0, depsWith())).rejects.toThrow(/wording/);
    await expect(yes(OWNER, GUEST, 1.5, depsWith())).rejects.toThrow(/wording/);
    expect(m.docs.size).toBe(0);
  });

  it('a yes to a wording that does not exist yet is refused and nothing is stored', async () => {
    await expect(yes(OWNER, GUEST, V + 1, depsWith())).rejects.toThrow(/wording/);
    await expect(yes(OWNER, GUEST, 999, depsWith())).rejects.toThrow(/wording/);
    expect(m.docs.size).toBe(0);
  });

  it('a yes stamped later than now is refused: a retry could otherwise outrank a later revoke', async () => {
    const later = new Date('2026-11-16T18:00:00Z');
    await expect(yes(OWNER, GUEST, V, depsWith(), later)).rejects.toThrow(/time the yes was said/);
    await expect(yes(OWNER, GUEST, V, depsWith(), new Date('not a time'))).rejects.toThrow(
      /time the yes was said/
    );
    expect(m.docs.size).toBe(0);
  });
});
