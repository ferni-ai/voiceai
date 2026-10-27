/**
 * Smart-home credentials fail closed. Two things are pinned here:
 *  - saveCredentials never overwrites a record it could not read (a read error,
 *    or an envelope that will not open). A missing record still saves.
 *  - Agent-written enc_ fields decrypt inside a sealed envelope too, but only
 *    for the user, integration and field they were sealed for (smartHomeAad).
 *    Any other context, a tampered ciphertext, or a partial value fails, and
 *    no token material reaches the logger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  const logger = { debug: fn, info: fn, warn: fn, error: fn, trace: fn, fatal: fn };
  return { calls, logger: { ...logger, child: () => logger }, db: null as unknown };
});

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => h.logger,
  getLogger: () => h.logger,
}));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => h.db,
}));

const TOKEN_A = 'fixture-lifx-token-a';
const TOKEN_B = 'fixture-lifx-token-b';
const HUE_USER = 'fixture-hue-username';
const SONOS_ACCESS = 'fixture-sonos-access';
const SONOS_REFRESH = 'fixture-sonos-refresh';
const PLAIN = [TOKEN_A, TOKEN_B, HUE_USER, SONOS_ACCESS, SONOS_REFRESH];

const state = newMergeFakeState();
const path = (user: string, integration: string) => `bogle_users/${user}/smart_home/${integration}`;

// No plaintext token and no ciphertext reaches a log line.
const noTokenInLogs = () => {
  // Errors serialize to {} by default, so pull out their messages too.
  const s = JSON.stringify(h.calls, (_k, v: unknown) => (v instanceof Error ? v.message : v));
  for (const t of PLAIN) expect(s).not.toContain(t);
  expect(s).not.toContain('enc_');
};

describe('smart_home fail-closed saves and envelope decrypt', () => {
  let routes: typeof import('../smart-home.js');
  let creds: typeof import('../../../../services/smart-home/user-credentials.js');
  let sealTokens: typeof import('../../../../utils/token-at-rest.js').sealTokens;
  let encryptSensitive: typeof import('../../../../services/platform/privacy-crypto.js').encryptSensitive;

  beforeEach(async () => {
    process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
    h.db = createMergeFakeFirestore(state);
    state.docs.clear();
    state.writes.length = 0;
    state.failReads = new Set();
    h.calls.length = 0;
    routes = await import('../smart-home.js');
    creds = await import('../../../../services/smart-home/user-credentials.js');
    ({ sealTokens } = await import('../../../../utils/token-at-rest.js'));
    ({ encryptSensitive } = await import('../../../../services/platform/privacy-crypto.js'));
  });

  afterEach(() => noTokenInLogs());

  describe('saveCredentials', () => {
    it('saves when there is no record yet', async () => {
      await routes.saveCredentials('u1', 'lifx', { token: TOKEN_A });
      expect(await routes.getCredentials('u1', 'lifx')).toEqual({ token: TOKEN_A });
    });

    it('fails closed on a read error and does not overwrite the record', async () => {
      await routes.saveCredentials('u1', 'lifx', { token: TOKEN_A });
      const before = structuredClone(state.docs.get(path('u1', 'lifx')));
      const writesBefore = state.writes.length;

      state.failReads?.add(path('u1', 'lifx'));
      await expect(routes.saveCredentials('u1', 'lifx', { token: TOKEN_B })).rejects.toThrow();

      expect(state.writes.length).toBe(writesBefore);
      expect(state.docs.get(path('u1', 'lifx'))).toEqual(before);
    });

    it('fails closed when the existing envelope will not open', async () => {
      state.docs.set(path('u1', 'lifx'), { encrypted: 'not-a-valid-envelope' });
      const before = structuredClone(state.docs.get(path('u1', 'lifx')));
      const writesBefore = state.writes.length;

      await expect(routes.saveCredentials('u1', 'lifx', { token: TOKEN_B })).rejects.toThrow();

      expect(state.writes.length).toBe(writesBefore);
      expect(state.docs.get(path('u1', 'lifx'))).toEqual(before);
    });
  });

  describe('enc_ fields inside a sealed envelope', () => {
    it('decrypt for the user, integration and field they were sealed for', async () => {
      const enc = await encryptSensitive(TOKEN_A, creds.smartHomeAad('u1', 'lifx', 'token'));
      state.docs.set(path('u1', 'lifx'), { ...sealTokens({ token: enc }) });
      expect(await routes.getCredentials('u1', 'lifx')).toEqual({ token: TOKEN_A });
    });

    it('fail for another user (cross-user replay)', async () => {
      const enc = await encryptSensitive(TOKEN_A, creds.smartHomeAad('userA', 'lifx', 'token'));
      state.docs.set(path('userB', 'lifx'), { ...sealTokens({ token: enc }) });
      expect(await routes.getCredentials('userB', 'lifx')).toBeNull();
    });

    it('fail for another field of the same integration', async () => {
      const enc = await encryptSensitive(
        SONOS_REFRESH,
        creds.smartHomeAad('u1', 'sonos', 'refreshToken')
      );
      state.docs.set(path('u1', 'sonos'), { ...sealTokens({ accessToken: enc }) });
      expect(await routes.getCredentials('u1', 'sonos')).toBeNull();
    });

    it('the AAD separates integrations even when the field name is the same', async () => {
      const { decryptSensitive } = await import('../../../../services/platform/privacy-crypto.js');
      const enc = await encryptSensitive(TOKEN_A, creds.smartHomeAad('u1', 'lifx', 'token'));
      await expect(
        decryptSensitive(enc, creds.smartHomeAad('u1', 'hue', 'token'))
      ).rejects.toThrow();
      await expect(decryptSensitive(enc, creds.smartHomeAad('u1', 'lifx', 'token'))).resolves.toBe(
        TOKEN_A
      );
    });

    it('fail for another integration', async () => {
      const enc = await encryptSensitive(HUE_USER, creds.smartHomeAad('u1', 'lifx', 'token'));
      state.docs.set(path('u1', 'hue'), { ...sealTokens({ username: enc }) });
      expect(await routes.getCredentials('u1', 'hue')).toBeNull();
    });

    it('fail when the ciphertext is tampered with', async () => {
      const good = await encryptSensitive(TOKEN_A, creds.smartHomeAad('u1', 'lifx', 'token'));
      const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
      state.docs.set(path('u1', 'lifx'), { ...sealTokens({ token: tampered }) });
      expect(await routes.getCredentials('u1', 'lifx')).toBeNull();
    });

    it('never return a partial value when one field fails', async () => {
      const ok = await encryptSensitive(
        SONOS_ACCESS,
        creds.smartHomeAad('u1', 'sonos', 'accessToken')
      );
      const bad = await encryptSensitive(
        SONOS_REFRESH,
        creds.smartHomeAad('other', 'sonos', 'refreshToken')
      );
      state.docs.set(path('u1', 'sonos'), {
        ...sealTokens({ accessToken: ok, refreshToken: bad }),
      });
      expect(await routes.getCredentials('u1', 'sonos')).toBeNull();
    });

    it('tampered ciphertext in a raw (unsealed) doc also fails', async () => {
      const good = await encryptSensitive(TOKEN_A, creds.smartHomeAad('u1', 'lifx', 'token'));
      const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
      state.docs.set(path('u1', 'lifx'), { token: tampered });
      expect(await routes.getCredentials('u1', 'lifx')).toBeNull();
    });
  });
});
