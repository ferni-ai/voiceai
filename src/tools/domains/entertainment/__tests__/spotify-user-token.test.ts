/**
 * Spotify voice tools use the calling user's linked account.
 * Run with: npx vitest run src/tools/domains/entertainment/__tests__/spotify-user-token.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HttpResponse = globalThis.Response;
type FetchInit = Parameters<typeof fetch>[1];

const logWarn = vi.fn();
const logger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: logWarn,
  error: vi.fn(),
  child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
});
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: logger,
  createLogger: logger,
  safeLog: logger,
}));
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  voice: { BackgroundAudioPlayer: vi.fn() },
}));

// Never touch the real .spotify-tokens.json / device file
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false), writeFileSync: vi.fn() };
});

// In-memory Firestore stand-in: one map per store, keyed by user ID
const stores = new Map<string, Map<string, unknown>>();
vi.mock('../../../../services/persistence/index.js', () => ({
  createPersistenceStore: vi.fn((config: { collection: string }) => {
    const data = stores.get(config.collection) ?? new Map<string, unknown>();
    stores.set(config.collection, data);
    return {
      get: vi.fn(async (id: string) => data.get(id) ?? null),
      setImmediate: vi.fn(async (id: string, value: unknown) => void data.set(id, value)),
      delete: vi.fn(async (id: string) => void data.delete(id)),
      shutdown: vi.fn(async () => undefined),
    };
  }),
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): InstanceType<typeof HttpResponse> {
  return new HttpResponse(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadModules() {
  const encryption = await import('../../../../utils/token-encryption.js');
  const linked = await import('../../../../services/identity/spotify-linked-tokens.js');
  const spotify = await import('../spotify.js');
  return { encryption, linked, tools: spotify.createSpotifyTools() };
}

describe('Spotify voice tools — per-user tokens', () => {
  beforeEach(() => {
    vi.resetModules();
    stores.clear();
    fetchMock.mockReset();
    logWarn.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'global-refresh');
    vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'test-encryption-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refreshes the user's expired token and plays from their account", async () => {
    const { encryption, linked, tools } = await loadModules();

    // Token saved by the web OAuth flow for this user (expired)
    stores.get('spotify_oauth_tokens')!.set('user-123', {
      encrypted: encryption.encryptData({
        access_token: 'stale-user-token',
        refresh_token: 'user-refresh',
        expires_at: Date.now() - 60_000,
      }),
      updated_at: Date.now(),
    });

    fetchMock.mockImplementation(async (url: string, init?: FetchInit) => {
      if (url === 'https://accounts.spotify.com/api/token') {
        return jsonResponse({ access_token: 'fresh-user-token', expires_in: 3600 });
      }
      if (url === 'https://api.spotify.com/v1/me/player') {
        return jsonResponse({
          is_playing: true,
          progress_ms: 1000,
          item: { name: 'Blue in Green', artists: [{ name: 'Miles Davis' }], duration_ms: 330000 },
        });
      }
      throw new Error(`unexpected fetch ${url} ${String(init?.method)}`);
    });

    await expect(linked.setSpotifyUser('user-123')).resolves.toBe(true);

    const result = await (tools.whatsPlaying.execute as (a: object) => Promise<string>)({});
    expect(result).toContain('Blue in Green');

    // The user's refresh token was used (startup also validates the global
    // token in the background, so look for the user's call specifically)
    const refreshBodies = fetchMock.mock.calls
      .filter(([u]) => u === 'https://accounts.spotify.com/api/token')
      .map(([, init]) => String((init as FetchInit).body));
    expect(refreshBodies.some((b) => b.includes('refresh_token=user-refresh'))).toBe(true);

    // Every Web API call carried the refreshed user token
    const playerCalls = fetchMock.mock.calls.filter(
      ([u]) => u === 'https://api.spotify.com/v1/me/player'
    );
    expect(playerCalls.length).toBeGreaterThan(0);
    for (const [, init] of playerCalls) {
      expect((init as FetchInit).headers).toMatchObject({
        Authorization: 'Bearer fresh-user-token',
      });
    }

    // Refreshed token persisted back to the user's (encrypted) store
    const saved = stores.get('spotify_oauth_tokens')!.get('user-123') as { encrypted: string };
    expect(saved.encrypted).not.toContain('fresh-user-token');
    expect(encryption.decryptData<{ access_token: string }>(saved.encrypted)?.access_token).toBe(
      'fresh-user-token'
    );
  });

  it('falls back to the global token (and says so) when the user has not linked Spotify', async () => {
    const { linked, tools } = await loadModules();

    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://accounts.spotify.com/api/token') {
        return jsonResponse({
          access_token: 'global-access',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      if (url === 'https://api.spotify.com/v1/me/player') {
        return jsonResponse({
          is_playing: false,
          item: { name: 'So What', artists: [{ name: 'Miles Davis' }], duration_ms: 540000 },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(linked.setSpotifyUser('user-without-spotify')).resolves.toBe(false);

    const result = await (tools.whatsPlaying.execute as (a: object) => Promise<string>)({});
    expect(result).toContain('So What');

    const playerCall = fetchMock.mock.calls.find(
      ([u]) => u === 'https://api.spotify.com/v1/me/player'
    );
    expect((playerCall![1] as FetchInit).headers).toMatchObject({
      Authorization: 'Bearer global-access',
    });
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-wit' }),
      expect.stringContaining('falling back to the global Spotify token')
    );
  });

  it('treats placeholder user IDs as unbound', async () => {
    const { linked } = await loadModules();
    await expect(linked.setSpotifyUser('anonymous')).resolves.toBe(false);
    expect(linked.getSpotifyUser()).toBeNull();
  });
});
