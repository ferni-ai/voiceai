/**
 * Passkey registration through the real @simplewebauthn/server verifier,
 * fed by a software authenticator with a real P-256 key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_TTL_MS,
  finishRegistration,
  issueChallenge,
  listPasskeys,
  relyingParty,
  startRegistration,
  takeChallenge,
} from '../passkeys.js';
import { fakePasskeysDb } from './passkeys-fake-db.js';
import { SoftAuthenticator } from './soft-authenticator.js';

beforeEach(() => {
  vi.stubEnv('WEBAUTHN_ORIGINS', 'https://app.ferni.ai');
  vi.stubEnv('WEBAUTHN_RP_ID', '');
});
afterEach(() => vi.unstubAllEnvs());

async function begin() {
  const { db, docs } = fakePasskeysDb();
  const options = await startRegistration('alice', 'alice@example.com', db);
  if (options === 'has_passkey') throw new Error('unexpected');
  return { db, docs, options, device: new SoftAuthenticator() };
}

describe('relyingParty', () => {
  it("is the app's host unless set, with every configured origin", () => {
    expect(
      relyingParty({ WEBAUTHN_ORIGINS: 'https://app.ferni.ai, http://localhost:3004' })
    ).toEqual({
      rpID: 'app.ferni.ai',
      origins: ['https://app.ferni.ai', 'http://localhost:3004'],
    });
    expect(
      relyingParty({ WEBAUTHN_RP_ID: 'localhost', WEBAUTHN_ORIGINS: 'http://localhost:3004' }).rpID
    ).toBe('localhost');
  });
});

describe('registration', () => {
  it('stores a verified passkey: id, public key, counter, never anything secret', async () => {
    const { db, options, device } = await begin();
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect(options.user.id).not.toBe(Buffer.from('alice').toString('base64url'));
    expect(await finishRegistration('alice', device.register(options), Date.now(), db)).toBe(true);
    const [stored] = await listPasskeys('alice', db);
    expect(stored).toMatchObject({ id: device.id, counter: 0, transports: ['internal'] });
    expect(Buffer.from(stored?.publicKey ?? '', 'base64url').length).toBeGreaterThan(64);
  });

  it('refuses a response without user verification (no biometric or PIN)', async () => {
    const { db, options, device } = await begin();
    const response = device.register(options, { userVerified: false });
    expect(await finishRegistration('alice', response, Date.now(), db)).toBe(false);
    expect(await listPasskeys('alice', db)).toHaveLength(0);
  });

  it('refuses a response made for another site or origin', async () => {
    for (const bad of [{ origin: 'https://evil.example' }, { rpID: 'evil.example' }]) {
      const { db, options, device } = await begin();
      expect(await finishRegistration('alice', device.register(options, bad), Date.now(), db)).toBe(
        false
      );
    }
  });

  it('uses each challenge once: a replayed response is refused', async () => {
    const { db, options, device } = await begin();
    const response = device.register(options);
    expect(await finishRegistration('alice', response, Date.now(), db)).toBe(true);
    expect(await finishRegistration('alice', response, Date.now(), db)).toBe(false);
  });

  it('refuses after the 5-minute challenge window', async () => {
    const { db, options, device } = await begin();
    const late = Date.now() + CHALLENGE_TTL_MS + 1;
    expect(await finishRegistration('alice', device.register(options), late, db)).toBe(false);
  });

  it("refuses a response to someone else's challenge", async () => {
    const { db, options, device } = await begin();
    expect(await finishRegistration('bob', device.register(options), Date.now(), db)).toBe(false);
  });

  it('only registers a first passkey (more need an existing passkey, a later flow)', async () => {
    const { db, options, device } = await begin();
    await finishRegistration('alice', device.register(options), Date.now(), db);
    expect(await startRegistration('alice', 'alice@example.com', db)).toBe('has_passkey');
  });
});

describe('takeChallenge', () => {
  it('returns a challenge once, only for its purpose and binding', async () => {
    const { db } = fakePasskeysDb();
    await issueChallenge('alice', 'approve', 'c1', 'hash-A', 1000, db);
    expect(await takeChallenge('alice', 'approve', 'hash-B', 1000, db)).toBeNull();
    // A mismatched take still burns the challenge, so it can't be retried.
    expect(await takeChallenge('alice', 'approve', 'hash-A', 1000, db)).toBeNull();
    await issueChallenge('alice', 'approve', 'c2', 'hash-A', 1000, db);
    expect(await takeChallenge('alice', 'register', 'hash-A', 1000, db)).toBeNull();
    expect(await takeChallenge('alice', 'approve', 'hash-A', 1000, db)).toBe('c2');
    expect(await takeChallenge('alice', 'approve', 'hash-A', 1000, db)).toBeNull();
  });
});
