import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const crypto = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  crypto.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: crypto.timingSafeEqual };
});

const { MAX_TTL_SECONDS, mintPhoneAttestation, verifyPhoneAttestation } =
  await import('../phone-attestation.js');

const SECRET = 'test-attest-secret';
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const CALL = {
  callSid: 'CA0123',
  from: '+15551234567',
  to: '+18885983952',
  verstat: 'TN-Validation-Passed-A',
};
const mint = (ttlSeconds?: number): string =>
  mintPhoneAttestation(CALL, SECRET, { nowMs: NOW, ttlSeconds });
const verify = (token: string | undefined, over: Record<string, unknown> = {}) =>
  verifyPhoneAttestation(token, { secret: SECRET, phoneNumber: CALL.from, nowMs: NOW, ...over });

/** Re-sign a body with the real secret, to show a field change is caught by checks other than the HMAC. */
const signed = (claims: object): string => {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};

describe('verifyPhoneAttestation', () => {
  it('accepts a fresh token for the number it names and returns the claims', () => {
    expect(verify(mint())).toEqual({
      status: 'signed',
      claims: { ...CALL, exp: NOW / 1000 + 60 },
    });
  });

  it('matches the number by digits, whatever the formatting', () => {
    expect(verify(mint(), { phoneNumber: '+1 (555) 123-4567' }).status).toBe('signed');
  });

  it('rejects a tampered payload (from changed, old signature kept)', () => {
    const [, sig] = mint().split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...CALL, from: '+15550000000', exp: NOW / 1000 + 60 })
    ).toString('base64url');
    expect(verify(`${forged}.${sig}`, { phoneNumber: '+15550000000' })).toEqual({
      status: 'invalid',
      reason: 'bad-signature',
    });
  });

  it('rejects a tampered signature, and one signed with another secret', () => {
    const [body, sig] = mint().split('.');
    // Change the first character: the last one carries padding bits.
    const flipped = `${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`;
    expect(verify(`${body}.${flipped}`)).toEqual({ status: 'invalid', reason: 'bad-signature' });
    const other = mintPhoneAttestation(CALL, 'another-secret', { nowMs: NOW });
    expect(verify(other)).toEqual({ status: 'invalid', reason: 'bad-signature' });
    expect(verify(`${body}.${sig.slice(0, 10)}`)).toEqual({
      status: 'invalid',
      reason: 'bad-signature',
    });
  });

  it('rejects an expired token, and accepts it one second before expiry', () => {
    const token = mint(30);
    expect(verify(token, { nowMs: NOW + 29_000 }).status).toBe('signed');
    expect(verify(token, { nowMs: NOW + 30_000 })).toEqual({
      status: 'invalid',
      reason: 'expired',
    });
  });

  it('caps the lifetime at MAX_TTL_SECONDS on both sides', () => {
    const long = mint(3600);
    expect(verify(long, { nowMs: NOW + MAX_TTL_SECONDS * 1000 })).toEqual({
      status: 'invalid',
      reason: 'expired',
    });
    // A validly signed token claiming a far-future expiry is refused too.
    const farFuture = signed({ ...CALL, exp: NOW / 1000 + 3600 });
    expect(verify(farFuture)).toEqual({ status: 'invalid', reason: 'expired' });
  });

  it('rejects a token presented for a different caller number', () => {
    expect(verify(mint(), { phoneNumber: '+15559999999' })).toEqual({
      status: 'invalid',
      reason: 'number-mismatch',
    });
    expect(verify(mint(), { phoneNumber: undefined })).toEqual({
      status: 'invalid',
      reason: 'number-mismatch',
    });
  });

  it('never returns signed without a secret', () => {
    expect(verify(mint(), { secret: undefined })).toEqual({
      status: 'invalid',
      reason: 'no-secret',
    });
    expect(verify(mint(), { secret: '' })).toEqual({ status: 'invalid', reason: 'no-secret' });
    expect(() => mintPhoneAttestation(CALL, '')).toThrow(/secret/);
  });

  it('is unsigned without a token, and malformed for garbage', () => {
    expect(verify(undefined)).toEqual({ status: 'unsigned' });
    expect(verify('')).toEqual({ status: 'unsigned' });
    for (const bad of ['abc', 'a.b.c', 'a+b.c/d', '.']) {
      expect(verify(bad)).toEqual({ status: 'invalid', reason: 'malformed' });
    }
    expect(verify(signed({ callSid: 'x', from: CALL.from }))).toEqual({
      status: 'invalid',
      reason: 'malformed',
    });
  });

  it('compares signatures with crypto.timingSafeEqual', () => {
    crypto.timingSafeEqual.mockClear();
    verify(mint());
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });
});

describe('mintPhoneAttestation', () => {
  it('is base64url with no padding, safe in a SIP URI header', () => {
    // Characters that put "+" and "/" into plain base64.
    const token = mintPhoneAttestation({ ...CALL, callSid: '~~~???>>>' }, SECRET, { nowMs: NOW });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [body] = token.split('.');
    expect(Buffer.from(JSON.stringify({ x: '~~~???>>>' })).toString('base64')).toMatch(/[+/]/);
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).callSid).toBe('~~~???>>>');
  });

  it('records a missing StirVerstat as an empty string', () => {
    const token = mintPhoneAttestation({ callSid: 'c', from: CALL.from, to: CALL.to }, SECRET, {
      nowMs: NOW,
    });
    const result = verify(token);
    expect(result.status === 'signed' && result.claims.verstat).toBe('');
  });
});
