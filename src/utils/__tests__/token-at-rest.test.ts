import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FieldValue } from '@google-cloud/firestore';
import {
  isPlaintextTokenRecord,
  openTokens,
  sealTokens,
  sealTokensForMerge,
} from '../token-at-rest.js';

const RAW = { access_token: 'fixture-access-abc123', refresh_token: 'fixture-refresh-xyz789', expires_at: 42 };

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
