/**
 * The dedicated token key (OAUTH_ENCRYPTION_KEY) seals; LOG_HASH_SECRET stays
 * on the ring as read-only legacy, so every envelope written before the switch
 * still opens until the migration re-seals it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptData,
  encryptData,
  keyIdOf,
  openEnvelope,
  tokenKeyId,
} from '../token-encryption.js';
import { openTokens, sealTokens } from '../token-at-rest.js';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

const NEW = 'fixture-dedicated-token-key';
const LEGACY = 'fixture-log-hash-secret';
const RAW = { access_token: 'fixture-access', refresh_token: 'fixture-refresh' };

const saved = { o: process.env.OAUTH_ENCRYPTION_KEY, l: process.env.LOG_HASH_SECRET };
function keys(o?: string, l?: string) {
  if (o === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
  else process.env.OAUTH_ENCRYPTION_KEY = o;
  if (l === undefined) delete process.env.LOG_HASH_SECRET;
  else process.env.LOG_HASH_SECRET = l;
}

describe('token keyring', () => {
  afterEach(() => keys(saved.o, saved.l));

  it('encrypts with OAUTH_ENCRYPTION_KEY when it is set', () => {
    keys(NEW, LEGACY);
    const sealed = sealTokens(RAW);
    expect(JSON.parse(sealed.encrypted).kid).toBe(keyIdOf(NEW));
    expect(tokenKeyId()).toBe(keyIdOf(NEW));
    keys(NEW, undefined); // opens with the new key alone
    expect(openTokens(sealed, 't')).toEqual(RAW);
  });

  it('decrypt falls back to the legacy LOG_HASH_SECRET for envelopes it sealed', () => {
    keys(undefined, LEGACY);
    const old = sealTokens(RAW);
    keys(NEW, LEGACY);
    expect(openTokens(old, 't')).toEqual(RAW);
    expect(openEnvelope(old.encrypted)?.kid).toBe(keyIdOf(LEGACY));
  });

  it('opens a pre-kid envelope by trying each key, new key first', () => {
    keys(undefined, LEGACY);
    const envelope = JSON.parse(sealTokens(RAW).encrypted) as Record<string, unknown>;
    delete envelope.kid;
    keys(NEW, LEGACY);
    expect(openEnvelope(JSON.stringify(envelope))).toEqual({ value: RAW, kid: keyIdOf(LEGACY) });
  });

  it('without the fallback the legacy envelopes would not open', () => {
    keys(undefined, LEGACY);
    const old = sealTokens(RAW);
    keys(NEW, undefined);
    expect(openTokens(old, 'oura_tokens')).toBeNull();
  });

  it('logs a kid that matches no key on the ring', () => {
    keys('some-other-key', undefined);
    const foreign = sealTokens(RAW);
    keys(NEW, LEGACY);
    warn.mockClear();
    expect(openTokens(foreign, 'oura_tokens')).toBeNull();
    expect(warn.mock.calls[0][0]).toMatchObject({
      store: 'oura_tokens',
      reason: 'kid-mismatch',
      envelopeKid: keyIdOf('some-other-key'),
      kid: keyIdOf(NEW),
    });
  });
});

/** Seal a value with NEW and hand back the envelope fields for tampering. */
function sealedEnvelope(value: unknown): Record<string, string> {
  keys(NEW, undefined);
  return JSON.parse(encryptData(value)) as Record<string, string>;
}

/** XOR one byte of a base64 field with `mask`. */
function flipByte(b64: string, index: number, mask = 0x01): string {
  const bytes = Buffer.from(b64, 'base64');
  bytes[index] ^= mask;
  return bytes.toString('base64');
}

describe('envelope authentication', () => {
  afterEach(() => keys(saved.o, saved.l));

  // Plaintext is {"t":"xxxxxxxxxxxx"}; byte 8 is an "x". GCM is CTR underneath,
  // so flipping that ciphertext bit turns it into a "y": still valid JSON. Only
  // the auth tag check can tell this envelope was altered.
  const VALUE = { t: 'xxxxxxxxxxxx' };

  it('opens the untampered envelope (control)', () => {
    const env = sealedEnvelope(VALUE);
    expect(openEnvelope(JSON.stringify(env))).toEqual({ value: VALUE, kid: keyIdOf(NEW) });
  });

  it('rejects an envelope with one ciphertext byte flipped', () => {
    const env = sealedEnvelope(VALUE);
    env.data = flipByte(env.data, 8);
    expect(openEnvelope(JSON.stringify(env))).toBeNull();
  });

  it('rejects an envelope with one auth-tag byte flipped', () => {
    const env = sealedEnvelope(VALUE);
    env.authTag = flipByte(env.authTag, 0);
    expect(openEnvelope(JSON.stringify(env))).toBeNull();
  });

  it('rejects a truncated auth tag, even the true tag cut to 12 bytes', () => {
    const env = sealedEnvelope(VALUE);
    expect(Buffer.from(env.authTag, 'base64')).toHaveLength(16);
    // A prefix of the real tag is a valid 12-byte GCM tag; only the pinned
    // length stops it from verifying. Node 22 (prod and CI) accepts it without
    // authTagLength; Node 23+ rejects short tags itself.
    env.authTag = Buffer.from(env.authTag, 'base64').subarray(0, 12).toString('base64');
    expect(openEnvelope(JSON.stringify(env))).toBeNull();
  });
});

describe('the envelope kid picks the key', () => {
  afterEach(() => keys(saved.o, saved.l));

  it('an envelope sealed with NEW but relabelled with LEGACY kid does not open', () => {
    keys(NEW, LEGACY);
    const env = JSON.parse(encryptData(RAW)) as Record<string, string>;
    expect(env.kid).toBe(keyIdOf(NEW));
    expect(openEnvelope(JSON.stringify(env))).toEqual({ value: RAW, kid: keyIdOf(NEW) });
    // NEW is on the ring and would open it; the kid must stop us falling through to it.
    env.kid = keyIdOf(LEGACY);
    expect(openEnvelope(JSON.stringify(env))).toBeNull();
  });

  it('an envelope whose kid names no key on the ring does not open', () => {
    keys(NEW, LEGACY);
    const env = JSON.parse(encryptData(RAW)) as Record<string, string>;
    env.kid = keyIdOf('a-key-nobody-has');
    expect(openEnvelope(JSON.stringify(env))).toBeNull();
  });
});

describe('production without a token key', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    keys(saved.o, saved.l);
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('throws instead of writing tokens in the clear', () => {
    process.env.NODE_ENV = 'production';
    keys(undefined, undefined);
    expect(() => encryptData(RAW)).toThrow('OAUTH_ENCRYPTION_KEY is required in production');
    expect(() => sealTokens(RAW)).toThrow('OAUTH_ENCRYPTION_KEY is required in production');
  });

  it('seals normally in production once a key is set (control)', () => {
    process.env.NODE_ENV = 'production';
    keys(NEW, undefined);
    expect(JSON.parse(encryptData(RAW))).toMatchObject({ encrypted: true, kid: keyIdOf(NEW) });
  });
});

describe('decryptData fails closed', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    keys(saved.o, saved.l);
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('decrypts an untampered envelope (control)', () => {
    keys(NEW, undefined);
    expect(decryptData(encryptData(RAW))).toEqual(RAW);
  });

  it('returns null for a tampered envelope, not the envelope object', () => {
    const env = sealedEnvelope(RAW);
    env.authTag = flipByte(env.authTag, 0);
    expect(decryptData(JSON.stringify(env))).toBeNull();
  });

  it('returns null for an envelope sealed with a key it does not hold', () => {
    keys('some-other-key', undefined);
    const foreign = encryptData(RAW);
    keys(NEW, LEGACY);
    expect(decryptData(foreign)).toBeNull();
  });

  it('returns null for an envelope in production with no key, instead of throwing', () => {
    const sealed = JSON.stringify(sealedEnvelope(RAW));
    process.env.NODE_ENV = 'production';
    keys(undefined, undefined);
    expect(decryptData(sealed)).toBeNull();
  });

  it('still returns legacy plaintext JSON written with no key configured', () => {
    keys(undefined, undefined);
    const plain = encryptData(RAW); // dev with no key writes plain JSON
    expect(JSON.parse(plain)).toEqual(RAW);
    keys(NEW, LEGACY);
    expect(decryptData(plain)).toEqual(RAW);
  });

  it('returns null for garbage', () => {
    keys(NEW, undefined);
    expect(decryptData('not json')).toBeNull();
  });
});
