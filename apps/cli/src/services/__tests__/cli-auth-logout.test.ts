/**
 * #2127: `ferni auth logout` asks the server to revoke its refresh tokens and
 * clears the local session whether or not that works, and says when it didn't.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const API_URL = 'https://api.example.test';

let home: string;
let tokenPath: string;
let fetchMock: ReturnType<typeof vi.fn>;

function writeStoredToken(): void {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      userId: 'user-1',
      email: 'seth@example.test',
      firebaseToken: 'id-token-1',
      refreshToken: 'refresh-token-1',
      expiresAt: Date.now() + 30 * 60 * 1000,
    })
  );
}

async function loadAuth() {
  vi.resetModules();
  return import('../cli-auth.service.js');
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ferni-cli-logout-'));
  tokenPath = path.join(home, '.ferni', 'auth.json');
  vi.stubEnv('HOME', home);
  vi.stubEnv('FERNI_API_URL', API_URL);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  writeStoredToken();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('CLI logout', () => {
  it('revokes on the server with the stored token and clears the session', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ revoked: true }), { status: 200 }));
    const auth = await loadAuth();

    expect(await auth.logout()).toEqual({ revoked: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/revoke`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer id-token-1' });
    expect(fs.existsSync(tokenPath)).toBe(false);
  });

  it('clears the session and reports why when the server refuses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
    );
    const auth = await loadAuth();

    const result = await auth.logout();
    expect(result.revoked).toBe(false);
    expect(result.error).toBe('HTTP 401: Authentication required');
    expect(fs.existsSync(tokenPath)).toBe(false);
  });

  it('clears the session and reports why when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.example.test'));
    const auth = await loadAuth();

    const result = await auth.logout();
    expect(result.revoked).toBe(false);
    expect(result.error).toContain('ENOTFOUND');
    expect(fs.existsSync(tokenPath)).toBe(false);
  });
});
