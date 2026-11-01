/**
 * TOKEN_SEALING_KEY: a dedicated sealing key with key ids, so LOG_HASH_SECRET can
 * rotate. Sealed blobs carry the id of the key that sealed them; legacy blobs
 * (sealed by LOG_HASH_SECRET) still open and are re-sealed on read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { envelopeFailure, envelopeIsStale, keyIdOf, openEnvelope } from '../token-encryption.js';
import {
  openTokens,
  resealCountsSnapshot,
  resealStale,
  sealTokens,
  tokenKeyIdLine,
  type SealedTokens,
} from '../token-at-rest.js';

vi.mock('../safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

const b64 = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const SEAL = b64(1);
const OTHER = b64(2);
const LEGACY = 'fixture-log-hash-secret';
const RAW = { access_token: 'fixture-access', refresh_token: 'fixture-refresh' };

const NAMES = [
  'TOKEN_SEALING_KEY',
  'TOKEN_SEALING_KEY_PREVIOUS',
  'OAUTH_ENCRYPTION_KEY',
  'LOG_HASH_SECRET',
] as const;
const saved = { ...process.env };
function env(vars: Partial<Record<(typeof NAMES)[number], string>>) {
  for (const name of NAMES) {
    const v = vars[name];
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
}
const kidOf = (s: { encrypted: string }) => (JSON.parse(s.encrypted) as { kid?: string }).kid;

/** An in-memory record, standing in for the Firestore doc a store keeps its envelope in. */
function record(initial: SealedTokens) {
  const doc = { encrypted: initial.encrypted };
  const swap = vi.fn(async (sealed: string) => {
    doc.encrypted = sealed;
    return 'updated' as 'updated' | 'missing' | 'changed';
  });
  return { doc, swap };
}

describe('TOKEN_SEALING_KEY', () => {
  afterEach(() => env(saved));

  it('seals under the sealing key, stamps its id, and round-trips', () => {
    env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
    const sealed = sealTokens(RAW);
    expect(kidOf(sealed)).toBe(keyIdOf(SEAL));
    expect(sealed.encrypted).not.toContain('fixture-refresh');
    env({ TOKEN_SEALING_KEY: SEAL }); // opens without the log secret
    expect(openTokens(sealed, 't')).toEqual(RAW);
  });

  it('opens a legacy blob and re-seals it, so the log secret can then go', async () => {
    env({ LOG_HASH_SECRET: LEGACY });
    const legacy = sealTokens(RAW);
    env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
    expect(openTokens(legacy, 't')).toEqual(RAW);
    expect(envelopeIsStale(legacy.encrypted)).toBe(true);

    const rec = record(legacy);
    const outcome = await resealStale({ store: 't', stored: legacy.encrypted, value: RAW, ...rec });
    expect(outcome).toBe('resealed');
    expect(rec.swap).toHaveBeenCalledTimes(1);
    expect(kidOf(rec.doc)).toBe(keyIdOf(SEAL));

    env({ TOKEN_SEALING_KEY: SEAL }); // log secret rotated away
    expect(openTokens(rec.doc, 't')).toEqual(RAW);
    expect(envelopeIsStale(rec.doc.encrypted)).toBe(false);
    expect(await resealStale({ store: 't', stored: rec.doc.encrypted, value: RAW, ...rec })).toBe(
      'current'
    );
  });

  it('re-seals a blob from before key ids existed', async () => {
    env({ LOG_HASH_SECRET: LEGACY });
    const envelope = JSON.parse(sealTokens(RAW).encrypted) as Record<string, unknown>;
    delete envelope.kid;
    const preKid = { encrypted: JSON.stringify(envelope) };
    env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
    const rec = record(preKid);
    await resealStale({ store: 't', stored: preKid.encrypted, value: RAW, ...rec });
    expect(kidOf(rec.doc)).toBe(keyIdOf(SEAL));
  });

  it.each(['changed', 'missing'] as const)(
    'reports a record that is %s since the read, and counts it',
    async (answer) => {
      env({ LOG_HASH_SECRET: LEGACY });
      const legacy = sealTokens(RAW);
      env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
      const rec = record(legacy);
      rec.swap.mockResolvedValueOnce(answer);
      const before = resealCountsSnapshot().changed;
      const outcome = await resealStale({
        store: 't',
        stored: legacy.encrypted,
        value: RAW,
        ...rec,
      });
      expect(outcome).toBe('changed');
      expect(resealCountsSnapshot().changed).toBe(before + 1);
    }
  );

  it('a failed write is reported, not thrown, and the old blob stays', async () => {
    env({ LOG_HASH_SECRET: LEGACY });
    const legacy = sealTokens(RAW);
    env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
    const rec = record(legacy);
    rec.swap.mockRejectedValueOnce(new Error('firestore down'));
    const outcome = await resealStale({ store: 't', stored: legacy.encrypted, value: RAW, ...rec });
    expect(outcome).toBe('failed');
    expect(openTokens(rec.doc, 't')).toEqual(RAW);
  });

  it('a wrong key fails closed: no throw, no value, a reason without key material', () => {
    env({ TOKEN_SEALING_KEY: OTHER });
    const foreign = sealTokens(RAW);
    env({ TOKEN_SEALING_KEY: SEAL, LOG_HASH_SECRET: LEGACY });
    expect(openTokens(foreign, 't')).toBeNull();
    const failure = envelopeFailure(foreign.encrypted);
    expect(failure).toEqual({ reason: 'kid-mismatch', envelopeKid: keyIdOf(OTHER) });
    expect(JSON.stringify(failure)).not.toContain(OTHER);
  });

  it('honours the key id: an id that names no key on the ring does not open', () => {
    env({ TOKEN_SEALING_KEY: SEAL });
    const sealed = JSON.parse(sealTokens(RAW).encrypted) as Record<string, unknown>;
    sealed.kid = 'deadbeef'; // the right key is on the ring, but the id does not name it
    expect(openEnvelope(JSON.stringify(sealed))).toBeNull();
    sealed.kid = keyIdOf(SEAL);
    expect(openEnvelope(JSON.stringify(sealed))?.kid).toBe(keyIdOf(SEAL));
  });

  it('rotates through TOKEN_SEALING_KEY_PREVIOUS', async () => {
    env({ TOKEN_SEALING_KEY: OTHER });
    const old = sealTokens(RAW); // sealed under the key that is about to become "previous"
    env({ TOKEN_SEALING_KEY: SEAL });
    expect(openTokens(old, 't')).toBeNull(); // no previous key yet: closed
    env({ TOKEN_SEALING_KEY: SEAL, TOKEN_SEALING_KEY_PREVIOUS: OTHER });
    expect(openTokens(old, 't')).toEqual(RAW);

    const rec = record(old);
    await resealStale({ store: 't', stored: old.encrypted, value: RAW, ...rec });
    expect(kidOf(rec.doc)).toBe(keyIdOf(SEAL));
    env({ TOKEN_SEALING_KEY: SEAL }); // previous retired
    expect(openTokens(rec.doc, 't')).toEqual(RAW);
  });

  it('unset: sealing, ring and boot line are what main has, and nothing is re-sealed', async () => {
    env({ LOG_HASH_SECRET: LEGACY });
    const sealed = sealTokens(RAW);
    expect(kidOf(sealed)).toBe(keyIdOf(LEGACY));
    expect(tokenKeyIdLine()).toBe(`token_at_rest_kid=${keyIdOf(LEGACY)} source=LOG_HASH_SECRET`);
    expect(envelopeIsStale(sealed.encrypted)).toBe(false);
    const rec = record(sealed);
    expect(await resealStale({ store: 't', stored: sealed.encrypted, value: RAW, ...rec })).toBe(
      'current'
    );
    expect(rec.swap).not.toHaveBeenCalled();
  });

  it('a malformed value is ignored (the old key still seals), never used', () => {
    env({ TOKEN_SEALING_KEY: 'too-short', LOG_HASH_SECRET: LEGACY });
    expect(kidOf(sealTokens(RAW))).toBe(keyIdOf(LEGACY));
    expect(tokenKeyIdLine()).toContain('source=LOG_HASH_SECRET');
  });

  it('the boot line lists key ids, never a key', () => {
    env({ TOKEN_SEALING_KEY: SEAL, TOKEN_SEALING_KEY_PREVIOUS: OTHER, LOG_HASH_SECRET: LEGACY });
    const line = tokenKeyIdLine();
    expect(line).toBe(
      `token_at_rest_kid=${keyIdOf(SEAL)} source=TOKEN_SEALING_KEY ` +
        `ring=${keyIdOf(SEAL)},${keyIdOf(OTHER)},${keyIdOf(LEGACY)}`
    );
    for (const secret of [SEAL, OTHER, LEGACY]) expect(line).not.toContain(secret);
  });
});
