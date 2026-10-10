/**
 * Only the OAuth provider's redirect (/<x>/callback) skips auth in the
 * integrations API.
 *
 * The gate also skipped auth for any path containing '/connect' or '/auth', so
 * GET /biometrics/connect/:platform and GET /calendar/connect ran with auth = null,
 * read `auth!.isAdmin`, and answered 500 to every caller: the OAuth start never
 * worked. These tests send real HTTP requests through the REAL handler and auth
 * middleware; only Firebase token verification and the biometrics service are
 * mocked. The disconnect cases guard the neighbouring routes.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const biometrics = vi.hoisted(() => ({
  disconnectBiometrics: vi.fn(),
  getAuthorizationUrl: vi.fn(() => 'https://provider.example/auth'),
  exchangeCodeForTokens: vi.fn(async () => true),
  syncBiometrics: vi.fn(async () => null),
  getCurrentBiometrics: vi.fn(() => null),
  hasBiometricsConnectedAsync: vi.fn(async () => false),
  getConnectedPlatformAsync: vi.fn(async () => null),
}));
vi.mock('../../../../services/biometrics/index.js', () => biometrics);

const { handleIntegrationsRoutes } = await import('../handler.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleIntegrationsRoutes(req, res, url.pathname, url);
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
beforeEach(() => vi.clearAllMocks());

const call = (method: string, path: string, token?: string) =>
  fetch(`${base}/api/v1/integrations${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe('integrations auth gate', () => {
  it('disconnects biometrics for the signed-in caller', async () => {
    const res = await call('DELETE', '/biometrics/disconnect', 'tok-A');
    expect(res.status).toBe(200);
    expect(biometrics.disconnectBiometrics).toHaveBeenCalledWith('uid-A');
  });

  it('refuses an unauthenticated disconnect with 401', async () => {
    const res = await call('DELETE', '/biometrics/disconnect');
    expect(res.status).toBe(401);
    expect(biometrics.disconnectBiometrics).not.toHaveBeenCalled();
  });

  it('builds the OAuth start URL for the signed-in caller (was 500)', async () => {
    const res = await call('GET', '/biometrics/connect/oura', 'tok-A');
    expect(res.status).toBe(200);
    expect(biometrics.getAuthorizationUrl).toHaveBeenCalledWith(
      'oura',
      'uid-A',
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    );
  });

  it('refuses an unauthenticated OAuth start with 401 (was 500)', async () => {
    const res = await call('GET', '/biometrics/connect/oura');
    expect(res.status).toBe(401);
    expect(biometrics.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('still lets the provider redirect reach the callback without a token', async () => {
    const res = await call('GET', '/biometrics/callback/oura');
    expect(res.status).toBe(400); // reached the handler: missing code/state, not 401
    expect(await res.json()).toEqual({ error: 'Missing code or state parameter' });
  });
});
