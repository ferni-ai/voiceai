/**
 * Owner-scoped Spotify playback routes (/api/spotify/*)
 * Run with: npx vitest run src/servers/api/routes/__tests__/spotify-playback.routes.test.ts
 */

import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HttpResponse = globalThis.Response;

const requestUserId = vi.fn();
const getValidToken = vi.fn();

vi.mock('../../../../api/identity-guard.js', () => ({
  requestUserId: (req: IncomingMessage) => requestUserId(req),
}));
vi.mock('../../../../services/identity/spotify-linked-tokens.js', () => ({
  getValidToken: (id: string) => getValidToken(id),
}));
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleSpotifyPlaybackRoutes } from '../spotify-playback.js';

function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(req, { method, url, headers: {} }) as unknown as IncomingMessage;
}

function makeRes() {
  const res = {
    status: 0,
    body: '' as string,
    writeHead: vi.fn((status: number) => {
      res.status = status;
      return res;
    }),
    end: vi.fn((chunk?: string) => {
      res.body = chunk ?? '';
    }),
    json: () => JSON.parse(res.body) as Record<string, unknown>,
  };
  return res;
}

const fetchMock = vi.fn();

describe('Spotify playback routes', () => {
  beforeEach(() => {
    requestUserId.mockReset().mockReturnValue('user-123');
    getValidToken.mockReset().mockResolvedValue('user-token');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores unrelated paths', async () => {
    const res = makeRes();
    const handled = await handleSpotifyPlaybackRoutes(
      makeReq('GET', '/api/spotify/rooms'),
      res as unknown as ServerResponse,
      '/api/spotify/rooms'
    );
    expect(handled).toBe(false);
  });

  it('requires a caller identity', async () => {
    requestUserId.mockReturnValue(null);
    const res = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/play'),
      res as unknown as ServerResponse,
      '/api/spotify/play'
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pauses on the caller's own account", async () => {
    fetchMock.mockResolvedValue(new HttpResponse(null, { status: 204 }));
    const res = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/pause'),
      res as unknown as ServerResponse,
      '/api/spotify/pause'
    );
    expect(getValidToken).toHaveBeenCalledWith('user-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player/pause',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
      })
    );
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ success: true });
  });

  it('clamps volume and rejects non-numbers', async () => {
    fetchMock.mockResolvedValue(new HttpResponse(null, { status: 204 }));
    const res = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/volume', { volume: 140 }),
      res as unknown as ServerResponse,
      '/api/spotify/volume'
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.spotify.com/v1/me/player/volume?volume_percent=100'
    );

    const bad = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/volume', { volume: 'loud' }),
      bad as unknown as ServerResponse,
      '/api/spotify/volume'
    );
    expect(bad.status).toBe(400);
  });

  it('reports status from me/player', async () => {
    fetchMock.mockResolvedValue(
      new HttpResponse(
        JSON.stringify({
          is_playing: true,
          item: { name: 'Clair de Lune', artists: [{ name: 'Debussy' }] },
          device: { volume_percent: 35 },
        }),
        { status: 200 }
      )
    );
    const res = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('GET', '/api/spotify/status'),
      res as unknown as ServerResponse,
      '/api/spotify/status'
    );
    expect(res.json()).toEqual({
      linked: true,
      playing: true,
      track: 'Clair de Lune',
      artist: 'Debussy',
      volume: 35,
    });
  });

  it('distinguishes not linked and no active device', async () => {
    getValidToken.mockResolvedValue(null);
    const status = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('GET', '/api/spotify/status'),
      status as unknown as ServerResponse,
      '/api/spotify/status'
    );
    expect(status.json()).toEqual({ linked: false, playing: false });

    const play = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/play'),
      play as unknown as ServerResponse,
      '/api/spotify/play'
    );
    expect(play.status).toBe(412);

    getValidToken.mockResolvedValue('user-token');
    fetchMock.mockResolvedValue(
      new HttpResponse(JSON.stringify({ error: { reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 })
    );
    const skip = makeRes();
    await handleSpotifyPlaybackRoutes(
      makeReq('POST', '/api/spotify/skip'),
      skip as unknown as ServerResponse,
      '/api/spotify/skip'
    );
    expect(skip.status).toBe(409);
    expect(skip.json()).toMatchObject({ error: 'no_active_device' });
  });
});
