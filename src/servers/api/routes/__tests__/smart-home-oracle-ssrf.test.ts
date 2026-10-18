/**
 * Smart-home routes: no decryption oracle, no SSRF, no writing someone else's
 * credentials.
 *
 * Real HTTP through bindVerifiedIdentity and the REAL routes; mocked: Firebase
 * token verification, Firestore (in memory) and outbound fetch.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({ db: null as unknown, outbound: [] as string[] }));
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
  isVerifiedToken: () => true,
}));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => h.db,
}));

const state = newMergeFakeState();
const { bindVerifiedIdentity } = await import('../../request-identity.js');
const routes = await import('../smart-home.js');
const guards = await import('../smart-home-guards.js');
const creds = await import('../../../../services/smart-home/user-credentials.js');
const { encryptSensitive, decryptSensitive } =
  await import('../../../../services/platform/privacy-crypto.js');
const { sealTokens } = await import('../../../../utils/token-at-rest.js');

const realFetch = globalThis.fetch;
let server: Server;
let base = '';
beforeAll(async () => {
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    if (url.startsWith(base)) return realFetch(input, init);
    h.outbound.push(url);
    return new globalThis.Response('{}');
  });
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!(await routes.handleSmartHomeRoutes(req, res, url.pathname, url))) {
        res.writeHead(404);
        res.end();
      }
    })();
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => {
  h.db = createMergeFakeFirestore(state);
  state.docs.clear();
  h.outbound.length = 0;
});

const post = (path: string, body: object, auth = true) =>
  realFetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: 'Bearer tok-A' } : {}),
    },
    body: JSON.stringify(body),
  });

describe('bridgeIp guard (SSRF)', () => {
  it.each(['192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.254', '8.8.8.8', '172.32.0.1'])(
    'accepts %s',
    (ip) => expect(guards.isSafeBridgeIp(ip)).toBe(true)
  );
  it.each([
    '127.0.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '192.0.2.1',
    '224.0.0.1',
    '255.255.255.255',
    'metadata.google.internal',
    'metadata',
    'localhost',
    '::1',
    'fe80::1',
    '192.168.1.20:80',
    '2130706433',
    '0x7f000001',
    '010.0.0.1',
    '',
    undefined,
  ])('refuses %s', (ip) => expect(guards.isSafeBridgeIp(ip)).toBe(false));

  it('hue save refuses the metadata server', async () => {
    const res = await post('/api/smart-home/hue/save', {
      bridgeIp: '169.254.169.254',
      username: 'u',
    });
    expect(res.status).toBe(400);
    expect(state.docs.size).toBe(0);
  });

  it('hue save refuses a username that is not a Hue app key', async () => {
    for (const username of ['../../x', 'a b', 'x'.repeat(65), 'key?y=1']) {
      const res = await post('/api/smart-home/hue/save', { bridgeIp: '192.168.1.2', username });
      expect(res.status).toBe(400);
    }
    expect(state.docs.size).toBe(0);
  });

  it('no request ever goes to a user-supplied bridge: status says it needs remote access', async () => {
    const save = await post('/api/smart-home/hue/save', {
      bridgeIp: '192.168.1.2',
      username: 'fixture-hue-app-key',
    });
    expect(save.status).toBe(200);
    state.docs.set('bogle_users/uid-A/smart_home/legacy', {}); // unrelated doc
    const status = await realFetch(`${base}/api/smart-home/hue/status`, {
      headers: { authorization: 'Bearer tok-A' },
    });
    expect(await status.json()).toMatchObject({
      connected: false,
      saved: true,
      needsRemoteAccess: true,
    });
    expect(h.outbound).toEqual([]); // no outbound fetch at all, to any host
  });
});

describe('no decryption oracle', () => {
  it('hue and lifx saves refuse an enc_ credential', async () => {
    const stolen = await encryptSensitive('victim-secret');
    const hue = await post('/api/smart-home/hue/save', {
      bridgeIp: '192.168.1.2',
      username: stolen,
    });
    const lifx = await post('/api/smart-home/lifx/save', { token: stolen });
    expect([hue.status, lifx.status]).toEqual([400, 400]);
    expect(state.docs.size).toBe(0);
  });

  it('every route save (Sonos included) refuses an enc_ value as a backstop', async () => {
    await expect(
      routes.saveCredentials('uid-A', 'sonos', { accessToken: 'enc_abc', refreshToken: 'r' })
    ).rejects.toThrow(/must not be an encrypted value/);
    expect(state.docs.size).toBe(0);
  });

  it('a route-sealed doc is opened, never decrypted, even if it holds an enc_ value', async () => {
    const ciphertext = await encryptSensitive('victim-secret');
    state.docs.set('bogle_users/uid-A/smart_home/lifx', { ...sealTokens({ token: ciphertext }) });
    expect(await routes.getCredentials('uid-A', 'lifx')).toEqual({ token: ciphertext });
  });

  it('ciphertext is bound to its user and field: replayed into another doc it does not open', async () => {
    await creds.saveCredential('victim', 'lifx', { token: 'victim-lifx-token' });
    const victimToken = state.docs.get('bogle_users/victim/smart_home/lifx')!.token as string;
    expect(await decryptSensitive(victimToken, 'victim/smart_home/lifx/token')).toBe(
      'victim-lifx-token'
    );
    await expect(decryptSensitive(victimToken)).rejects.toThrow(); // needs its AAD

    state.docs.set('bogle_users/uid-A/smart_home/lifx', { token: victimToken });
    expect(await routes.getCredentials('uid-A', 'lifx')).toBeNull();
    expect(await creds.getCredential('uid-A', 'lifx')).toBeNull();
  });

  it('legacy ciphertext without AAD still opens; the next agent save re-encrypts it with AAD', async () => {
    state.docs.set('bogle_users/uid-A/smart_home/lifx', {
      token: await encryptSensitive('legacy-token'),
    });
    expect(await creds.getCredential('uid-A', 'lifx')).toEqual({ token: 'legacy-token' });
    await creds.saveCredential('uid-A', 'lifx', { token: 'legacy-token' });
    const token = state.docs.get('bogle_users/uid-A/smart_home/lifx')!.token as string;
    await expect(decryptSensitive(token)).rejects.toThrow();
    expect(await decryptSensitive(token, creds.smartHomeAad('uid-A', 'lifx', 'token'))).toBe(
      'legacy-token'
    );
  });
});

describe('saves use only the verified caller', () => {
  it('ignores a body userId and writes the verified caller', async () => {
    const res = await post('/api/smart-home/lifx/save', { userId: 'victim', token: 'my-token' });
    expect(res.status).toBe(200);
    expect(state.docs.has('bogle_users/victim/smart_home/lifx')).toBe(false);
    expect(await routes.getCredentials('uid-A', 'lifx')).toEqual({ token: 'my-token' });
  });

  it('refuses a save with no verified caller', async () => {
    const res = await post(
      '/api/smart-home/hue/save',
      {
        userId: 'victim',
        bridgeIp: '192.168.1.2',
        username: 'u',
      },
      false
    );
    expect(res.status).toBe(401);
    expect(state.docs.size).toBe(0);
  });
});
