import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No token file on disk: the module falls back to SPOTIFY_REFRESH_TOKEN, the
// way the LiveKit Cloud agent runs. Writes are swallowed.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: () => false, writeFileSync: vi.fn() };
});

const warn = vi.fn();
const error = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => {
  const quiet = (): Record<string, unknown> => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() });
  return { getLogger: () => ({ warn, error, info: vi.fn(), debug: vi.fn() }), createLogger: quiet };
});

function tokenResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function loadModule(): Promise<typeof import('../spotify-auth.js')> {
  vi.resetModules();
  return import('../spotify-auth.js');
}

describe('spotify-auth: a revoked refresh token is permanent', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'secret');
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'revoked-refresh-token');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    warn.mockReset();
    error.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stops calling Spotify after invalid_grant, including forced refreshes', async () => {
    fetchMock.mockImplementation(async () => tokenResponse(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }));
    const { getSpotifyAccessToken } = await loadModule();

    expect(await getSpotifyAccessToken()).toBeNull();
    expect(await getSpotifyAccessToken()).toBeNull();
    expect(await getSpotifyAccessToken(true)).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the revocation once as a warning, not as an error', async () => {
    fetchMock.mockImplementation(async () => tokenResponse(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' }));
    const { getSpotifyAccessToken } = await loadModule();

    await getSpotifyAccessToken();
    await getSpotifyAccessToken(true);

    expect(error).not.toHaveBeenCalled();
    expect(warn.mock.calls.filter((c) => String(c.at(-1)).includes('revoked'))).toHaveLength(1);
  });

  it('keeps retrying transient failures (they are not a revocation)', async () => {
    fetchMock.mockImplementation(async () => tokenResponse(503, { error: 'server_error' }));
    const { getSpotifyAccessToken } = await loadModule();

    await getSpotifyAccessToken();
    await getSpotifyAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('works again once a different refresh token is configured', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse(400, { error: 'invalid_grant' }));
    const { getSpotifyAccessToken } = await loadModule();
    expect(await getSpotifyAccessToken()).toBeNull();

    // A fresh process picks up the rotated secret.
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'new-refresh-token');
    fetchMock.mockResolvedValueOnce(
      tokenResponse(200, { access_token: 'access-ok', expires_in: 3600, token_type: 'Bearer' })
    );
    const fresh = await loadModule();
    expect(await fresh.getSpotifyAccessToken()).toBe('access-ok');
  });
});
