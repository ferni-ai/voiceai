/**
 * CLI auth token refresh: exchanges the refresh token directly with Firebase's
 * Secure Token API (there is no /api/auth/refresh backend route).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthModule = typeof import('../cli-auth.service.js');

let tmpHome: string;
let auth: AuthModule;
const originalHome = process.env.HOME;

function writeToken(overrides: Record<string, unknown> = {}): void {
  const dir = path.join(tmpHome, '.ferni');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'auth.json'),
    JSON.stringify({
      userId: 'uid-1',
      email: 'a@example.com',
      firebaseToken: 'old-id-token',
      refreshToken: 'old-refresh',
      expiresAt: Date.now() - 1000, // expired
      firebaseApiKey: 'web-key',
      ...overrides,
    })
  );
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ferni-auth-'));
  process.env.HOME = tmpHome;
  delete process.env.FERNI_FIREBASE_API_KEY;
  delete process.env.FIREBASE_API_KEY;
  delete process.env.VITE_FIREBASE_API_KEY;
  vi.resetModules();
  auth = await import('../cli-auth.service.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('cli-auth token refresh', () => {
  it('refreshes an expired token against securetoken.googleapis.com', async () => {
    writeToken();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: 'new-id-token',
          refresh_token: 'new-refresh',
          expires_in: '3600',
          user_id: 'uid-1',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(auth.isAuthenticated()).toBe(true); // refreshable session counts
    const idToken = await auth.getAuthToken();

    expect(idToken).toBe('new-id-token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://securetoken.googleapis.com/v1/token?key=web-key');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh');

    const stored = auth.readStoredToken();
    expect(stored?.firebaseToken).toBe('new-id-token');
    expect(stored?.refreshToken).toBe('new-refresh');
    expect(stored?.email).toBe('a@example.com');
    expect(stored?.expiresAt ?? 0).toBeGreaterThan(Date.now() + 3500 * 1000);
  });

  it('prefers the env API key over the stored one', async () => {
    writeToken();
    process.env.FERNI_FIREBASE_API_KEY = 'env-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id_token: 't', expires_in: '3600' })));
    vi.stubGlobal('fetch', fetchMock);

    await auth.getAuthToken();
    expect(String(fetchMock.mock.calls[0][0])).toContain('key=env-key');
  });

  it('clears credentials when Firebase rejects the refresh token', async () => {
    writeToken();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":{"message":"TOKEN_EXPIRED"}}', { status: 400 })
        )
    );

    expect(await auth.getAuthToken()).toBeNull();
    expect(auth.readStoredToken()).toBeNull();
  });

  it('does not call the network when the token is still valid', async () => {
    writeToken({ expiresAt: Date.now() + 60 * 60 * 1000 });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await auth.getAuthToken()).toBe('old-id-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logout clears local credentials without calling a backend', async () => {
    writeToken();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await auth.logout();
    expect(auth.readStoredToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
