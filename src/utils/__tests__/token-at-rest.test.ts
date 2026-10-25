import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import {
  isPlaintextTokenRecord,
  openTokens,
  sealTokens,
  sealTokensForMerge,
  tokenKeyId,
  tokenKeyIdLine,
} from '../token-at-rest.js';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

const RAW = {
  access_token: 'fixture-access-abc123',
  refresh_token: 'fixture-refresh-xyz789',
  expires_at: 42,
};

describe('token-at-rest', () => {
  const saved = process.env.OAUTH_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.OAUTH_ENCRYPTION_KEY = 'test-key-for-token-at-rest';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = saved;
  });

  it('seals to ciphertext that never contains the raw token', () => {
    const sealed = sealTokens(RAW);
    expect(Object.keys(sealed)).toEqual(['encrypted']);
    expect(JSON.parse(sealed.encrypted)).toMatchObject({ encrypted: true });
    expect(sealed.encrypted).not.toContain(RAW.access_token);
    expect(sealed.encrypted).not.toContain(RAW.refresh_token);
    expect(isPlaintextTokenRecord(sealed)).toBe(false);
  });

  it('opens both a sealed record and a legacy plaintext record', () => {
    expect(openTokens(sealTokens(RAW), 'test_store')).toEqual(RAW);
    expect(openTokens({ ...RAW, updatedAt: 'x' }, 'test_store')).toMatchObject(RAW);
    expect(isPlaintextTokenRecord(RAW)).toBe(true);
  });

  it('returns null for absent, empty or undecryptable records', () => {
    const sealed = sealTokens(RAW);
    expect(openTokens(undefined, 'test_store')).toBeNull();
    expect(openTokens({ updatedAt: 'x' }, 'test_store')).toBeNull();
    process.env.OAUTH_ENCRYPTION_KEY = 'a-different-key';
    expect(openTokens(sealed, 'test_store')).toBeNull();
  });

  it('a merge-write payload deletes every legacy plaintext key', () => {
    const payload = sealTokensForMerge(RAW);
    for (const k of ['access_token', 'refresh_token', 'accessToken', 'refreshToken']) {
      expect((payload[k] as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    }
    expect(openTokens({ encrypted: payload.encrypted }, 'test_store')).toEqual(RAW);
  });
});

describe('token key id (kid)', () => {
  const saved = { o: process.env.OAUTH_ENCRYPTION_KEY, l: process.env.LOG_HASH_SECRET };
  const set = (o?: string, l?: string) => {
    if (o === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = o;
    if (l === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = l;
  };
  afterEach(() => set(saved.o, saved.l));

  it('is 8 hex of HMAC-SHA256(key, "ferni-token-kid"), stable across calls', () => {
    set('fixture-key-one');
    const expected = createHmac('sha256', 'fixture-key-one')
      .update('ferni-token-kid')
      .digest('hex')
      .slice(0, 8);
    expect(tokenKeyId()).toBe(expected);
    expect(tokenKeyId()).toBe(expected);
  });

  it('differs for different keys', () => {
    set('fixture-key-one');
    const one = tokenKeyId();
    set('fixture-key-two');
    expect(tokenKeyId()).not.toBe(one);
  });

  it('follows the encryption resolution: OAUTH_ENCRYPTION_KEY, else LOG_HASH_SECRET', () => {
    set(undefined, 'fixture-key-one');
    const kid = tokenKeyId();
    expect(tokenKeyIdLine()).toBe(`token_at_rest_kid=${kid} source=LOG_HASH_SECRET`);
    set('fixture-key-one', 'fixture-key-two');
    expect(tokenKeyIdLine()).toBe(`token_at_rest_kid=${kid} source=OAUTH_ENCRYPTION_KEY`);
  });

  it('stamps every new envelope with the kid of the key that sealed it', () => {
    set('fixture-key-one');
    const sealed = sealTokens(RAW);
    expect(JSON.parse(sealed.encrypted)).toMatchObject({ encrypted: true, kid: tokenKeyId() });
    set(undefined, 'fixture-key-one');
    expect(openTokens(sealed, 'test_store')).toEqual(RAW);
  });

  it('reports "none" when no key is set, and never prints the key', () => {
    set();
    expect(tokenKeyId()).toBe('none');
    expect(tokenKeyIdLine()).toBe('token_at_rest_kid=none source=none');
    set('fixture-key-one');
    expect(tokenKeyIdLine()).not.toContain('fixture-key-one');
  });

  it('warns with the store and the reason when an envelope does not open', () => {
    set('fixture-key-one');
    const sealed = sealTokens(RAW);
    const sealedKid = tokenKeyId();
    set('fixture-key-two');
    warn.mockClear();
    expect(openTokens(sealed, 'oura_tokens')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({
      store: 'oura_tokens',
      reason: 'kid-mismatch',
      envelopeKid: sealedKid,
      kid: tokenKeyId(),
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(RAW.access_token);

    // An envelope from before kids, under the wrong key: decrypt-failed.
    const legacy = JSON.parse(sealed.encrypted) as Record<string, unknown>;
    delete legacy.kid;
    warn.mockClear();
    expect(openTokens({ encrypted: JSON.stringify(legacy) }, 'spotify_tokens')).toBeNull();
    expect(warn.mock.calls[0][0]).toMatchObject({
      store: 'spotify_tokens',
      reason: 'decrypt-failed',
    });
  });
});
