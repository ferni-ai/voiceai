import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import {
  isPlaintextTokenRecord,
  keyFingerprint,
  openTokens,
  sealTokens,
  sealTokensForMerge,
  tokenKeyFingerprintLine,
} from '../token-at-rest.js';

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
    expect(openTokens(sealTokens(RAW))).toEqual(RAW);
    expect(openTokens({ ...RAW, updatedAt: 'x' })).toMatchObject(RAW);
    expect(isPlaintextTokenRecord(RAW)).toBe(true);
  });

  it('returns null for absent, empty or undecryptable records', () => {
    const sealed = sealTokens(RAW);
    expect(openTokens(undefined)).toBeNull();
    expect(openTokens({ updatedAt: 'x' })).toBeNull();
    process.env.OAUTH_ENCRYPTION_KEY = 'a-different-key';
    expect(openTokens(sealed)).toBeNull();
  });

  it('a merge-write payload deletes every legacy plaintext key', () => {
    const payload = sealTokensForMerge(RAW);
    for (const k of ['access_token', 'refresh_token', 'accessToken', 'refreshToken']) {
      expect((payload[k] as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    }
    expect(openTokens({ encrypted: payload.encrypted })).toEqual(RAW);
  });
});

describe('keyFingerprint', () => {
  const saved = { o: process.env.OAUTH_ENCRYPTION_KEY, l: process.env.LOG_HASH_SECRET };
  const set = (o?: string, l?: string) => {
    if (o === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = o;
    if (l === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = l;
  };
  afterEach(() => set(saved.o, saved.l));

  it('is 8 hex of sha256("ferni-token-key-fp:" + key), stable across calls', () => {
    set('fixture-key-one');
    const expected = createHash('sha256')
      .update('ferni-token-key-fp:fixture-key-one')
      .digest('hex')
      .slice(0, 8);
    expect(keyFingerprint()).toBe(expected);
    expect(keyFingerprint()).toBe(expected);
    expect(keyFingerprint()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs for different keys', () => {
    set('fixture-key-one');
    const one = keyFingerprint();
    set('fixture-key-two');
    expect(keyFingerprint()).not.toBe(one);
  });

  it('follows the encryption resolution: OAUTH_ENCRYPTION_KEY, else LOG_HASH_SECRET', () => {
    set(undefined, 'fixture-key-one');
    const viaHash = keyFingerprint();
    expect(tokenKeyFingerprintLine()).toBe(
      `token_at_rest_key_fp=${viaHash} source=LOG_HASH_SECRET`
    );
    set('fixture-key-one', 'fixture-key-two');
    expect(keyFingerprint()).toBe(viaHash);
    expect(tokenKeyFingerprintLine()).toBe(
      `token_at_rest_key_fp=${viaHash} source=OAUTH_ENCRYPTION_KEY`
    );
    // The key that seals is the key the fingerprint names.
    const sealed = sealTokens(RAW);
    set(undefined, 'fixture-key-one');
    expect(openTokens(sealed)).toEqual(RAW);
  });

  it('reports "none" when no key is set, and never prints the key', () => {
    set();
    expect(keyFingerprint()).toBe('none');
    expect(tokenKeyFingerprintLine()).toBe('token_at_rest_key_fp=none source=none');
    set('fixture-key-one');
    expect(tokenKeyFingerprintLine()).not.toContain('fixture-key-one');
  });
});
