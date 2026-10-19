/**
 * #2097: the CLI refreshed its session through /api/auth/refresh, a route no
 * server has, so every session died an hour after `ferni auth login`. It now
 * refreshes against Firebase securetoken with the key from init.json.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_URL = 'https://app.example.test';
const INIT_JSON_URL = `${APP_URL}/__/firebase/init.json`;

let home: string;
let tokenPath: string;
let fetchMock: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function writeStoredToken(overrides: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      userId: 'user-1',
      email: 'seth@example.test',
      displayName: 'Seth',
      firebaseToken: 'old-id-token',
      refreshToken: 'old-refresh-token',
      expiresAt: Date.now() - 60_000, // expired a minute ago
      ...overrides,
    })
  );
}

/** Answer init.json with a key and securetoken with `securetoken`. */
function routeFetch(securetoken: () => Response | Promise<Response>): void {
  fetchMock.mockImplementation(async (input: string | URL) => {
    const url = String(input);
    if (url === INIT_JSON_URL) return json(200, { apiKey: 'public-web-key', projectId: 'p' });
    if (url.startsWith('https://securetoken.googleapis.com/v1/token')) return securetoken();
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function loadAuth() {
  vi.resetModules();
  return import('../cli-auth.service.js');
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ferni-cli-auth-'));
  tokenPath = path.join(home, '.ferni', 'auth.json');
  vi.stubEnv('HOME', home);
  vi.stubEnv('FERNI_APP_URL', APP_URL);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('CLI session refresh', () => {
  it('refreshes an expired token against securetoken and persists the new one', async () => {
    writeStoredToken();
    routeFetch(() =>
      json(200, {
        id_token: 'new-id-token',
        refresh_token: 'new-refresh-token',
        expires_in: '3600',
        user_id: 'user-1',
      })
    );
    const auth = await loadAuth();

    expect(await auth.getAuthToken()).toBe('new-id-token');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://securetoken.googleapis.com/v1/token?key=public-web-key');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh-token',
    });
    expect(
      fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.includes('/api/auth/refresh'))
    ).toBe(false);

    const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    expect(stored).toMatchObject({
      userId: 'user-1',
      email: 'seth@example.test',
      firebaseToken: 'new-id-token',
      refreshToken: 'new-refresh-token',
    });
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
  });

  it('a 400 from securetoken says sign in again, clears the session and does not retry', async () => {
    writeStoredToken();
    routeFetch(() => json(400, { error: { code: 400, message: 'INVALID_REFRESH_TOKEN' } }));
    const auth = await loadAuth();

    await expect(auth.getAuthHeaders()).rejects.toThrow(/sign in again/i);
    const securetokenCalls = () =>
      fetchMock.mock.calls.filter(([u]) => String(u).startsWith('https://securetoken')).length;
    expect(securetokenCalls()).toBe(1);
    expect(fs.existsSync(tokenPath)).toBe(false);

    // The next call finds no session instead of trying the dead token again.
    expect(await auth.getAuthToken()).toBeNull();
    expect(securetokenCalls()).toBe(1);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('keeps the session when securetoken is unreachable', async () => {
    writeStoredToken();
    routeFetch(() => json(503, { error: { message: 'UNAVAILABLE' } }));
    const auth = await loadAuth();

    await expect(auth.getAuthToken()).rejects.toThrow(/try again/i);
    expect(JSON.parse(fs.readFileSync(tokenPath, 'utf-8')).refreshToken).toBe('old-refresh-token');
  });

  it('uses a fresh token without calling the network', async () => {
    writeStoredToken({ expiresAt: Date.now() + 30 * 60 * 1000 });
    const auth = await loadAuth();

    expect(await auth.getAuthToken()).toBe('old-id-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts an expired but refreshable session as signed in, so commands reach the refresh', async () => {
    writeStoredToken();
    const auth = await loadAuth();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()?.email).toBe('seth@example.test');
  });
});
