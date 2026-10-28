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
  it('the Hue save guard refuses an enc_ username for being encrypted', () => {
    // The app-key pattern (no underscore) would also reject it; check the guard itself.
    expect(guards.hueSaveInput('uid-A', { bridgeIp: '192.168.1.2', username: 'enc_abc' })).toEqual({
      status: 400,
      error: 'username must not be an encrypted value',
    });
  });

  it('hue and lifx saves refuse an enc_ credential over HTTP', async () => {
    const stolen = await encryptSensitive('victim-secret');
    const hue = await post('/api/smart-home/hue/save', {
      bridgeIp: '192.168.1.2',
      username: stolen,
    });
    const lifx = await post('/api/smart-home/lifx/save', { token: stolen });
    expect(await lifx.json()).toMatchObject({ error: 'token must not be an encrypted value' });
    expect([hue.status, lifx.status]).toEqual([400, 400]);
    expect(state.docs.size).toBe(0);
  });

  it('every route save (Sonos included) refuses an enc_ value as a backstop', async () => {
    await expect(
      routes.saveCredentials('uid-A', 'sonos', { accessToken: 'enc_abc', refreshToken: 'r' })
    ).rejects.toThrow(/must not be an encrypted value/);
    expect(state.docs.size).toBe(0);
  });

  it('a route-sealed doc decrypts only enc_ values bound to its own user and field', async () => {
    const victim = await encryptSensitive(
      'victim-secret',
      creds.smartHomeAad('victim', 'lifx', 'token')
    );
    state.docs.set('bogle_users/uid-A/smart_home/lifx', { ...sealTokens({ token: victim }) });
    expect(await routes.getCredentials('uid-A', 'lifx')).toBeNull();
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

  it('a no-AAD ciphertext (e.g. an MCP or OAuth secret) does not open in a smart_home doc', async () => {
    const noAad = await encryptSensitive('some-other-secret');
    state.docs.set('bogle_users/uid-A/smart_home/lifx', { token: noAad });
    expect(await creds.getCredential('uid-A', 'lifx')).toBeNull();
    expect(await routes.getCredentials('uid-A', 'lifx')).toBeNull();
    await expect(
      decryptSensitive(noAad, creds.smartHomeAad('uid-A', 'lifx', 'token'))
    ).rejects.toThrow();
    // What the agent writes now is bound, and opens only with its AAD.
    await creds.saveCredential('uid-A', 'lifx', { token: 'new-token' });
    const token = state.docs.get('bogle_users/uid-A/smart_home/lifx')!.token as string;
    expect(await decryptSensitive(token, creds.smartHomeAad('uid-A', 'lifx', 'token'))).toBe(
      'new-token'
    );
  });

  it('one unreadable field blanks only its own integration', async () => {
    await creds.saveCredential('uid-A', 'lifx', { token: 'good-lifx-token' });
    state.docs.set('bogle_users/uid-A/smart_home/hue', {
      bridgeIp: '192.168.1.2',
      username: await encryptSensitive('x', 'someone-else/smart_home/hue/username'),
    });
    const all = await creds.getUserSmartHomeCredentials('uid-A');
    expect(all.hue).toBeNull();
    expect(all.lifx).toEqual({ token: 'good-lifx-token', connectedAt: expect.any(String) });
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

describe('HomeKit command-complete uses only the verified caller', () => {
  const pending = (uid: string) => `bogle_users/${uid}/homekit/commands/pending/c1`;
  const complete = (body: object, authorization?: string) =>
    realFetch(`${base}/api/smart-home/homekit/command-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: JSON.stringify(body),
    });

  it("ignores body.userId: completes only the verified caller's command", async () => {
    state.docs.set(pending('victim'), { deviceId: 'd', action: 'on', timestamp: 1 });
    state.docs.set(pending('uid-A'), { deviceId: 'd', action: 'on', timestamp: 1 });
    const res = await complete(
      { userId: 'victim', commandId: 'c1', success: true },
      'Bearer tok-A'
    );
    expect(res.status).toBe(200);
    expect(state.docs.has(pending('victim'))).toBe(true);
    expect(state.docs.has(pending('uid-A'))).toBe(false);
    expect(state.docs.get('bogle_users/uid-A/homekit/commands/history/c1')).toMatchObject({
      success: true,
    });
  });

  it('refuses an unverified bearer token or none at all', async () => {
    state.docs.set(pending('victim'), { deviceId: 'd', action: 'on', timestamp: 1 });
    for (const auth of ['Bearer not-a-real-token', undefined]) {
      const res = await complete({ userId: 'victim', commandId: 'c1', success: true }, auth);
      expect(res.status).toBe(401);
    }
    expect(state.docs.has(pending('victim'))).toBe(true);
  });
});
