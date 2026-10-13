/**
 * The export's two filters: the store allowlist (a store is exported only once someone has
 * reviewed it) and the secret-field filter (whole words, so ordinary fields survive).
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORTED_STORES,
  isSecretField,
  KNOWN_USER_STORES,
  WITHHELD_STORES,
} from '../user-records-export.js';

describe('secret fields', () => {
  it.each([
    'pushToken',
    'refresh_token',
    'refresh',
    'access',
    'endpoint',
    'keys',
    'p256dh',
    'auth',
    'passwordHash',
    'salt',
    'pin',
    'otpCode',
    'code',
    'verificationCode',
    'apiKey',
    'api_key',
    'session_id',
    'clientSecret',
    'webauthnCredential',
    'privateKey',
  ])('drops %s', (key) => expect(isSecretField(key)).toBe(true));

  it.each([
    'footprint',
    'zipCode',
    'accessLevel',
    'author',
    'name',
    'phoneNumber',
    'pinned',
    'sessionCount',
    'keystone',
    'hashtags',
    'notes',
  ])('keeps %s', (key) => expect(isSecretField(key)).toBe(false));
});

describe('store allowlist', () => {
  it('holds every store a menu panel reads', () => {
    for (const store of KNOWN_USER_STORES) {
      const [root, , sub] = store.split('/');
      if (sub) expect(EXPORTED_STORES[root!], store).toContain(sub);
    }
  });

  it('never also allowlists a withheld store', () => {
    const exported = Object.values(EXPORTED_STORES).flat();
    expect(exported.filter((s) => s in WITHHELD_STORES)).toEqual([]);
    expect(
      exported.filter((s) =>
        /token|secret|credential|oauth|push_sub|passkey|webauthn|plaid/i.test(s)
      )
    ).toEqual([]);
  });
});
