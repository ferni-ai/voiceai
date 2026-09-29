/**
 * Spotify Playback Routes (owner-scoped)
 *
 * Thin wrappers over the Spotify Web API using the caller's own linked
 * account (see services/identity/spotify-linked-tokens). Used by the web
 * app's vibe controller.
 *
 *   GET  /api/spotify/status  → { linked, playing, track?, artist?, volume }
 *   POST /api/spotify/play    → resume playback
 *   POST /api/spotify/pause   → pause playback
 *   POST /api/spotify/skip    → next track
 *   POST /api/spotify/volume  { volume: 0-100 }
 *
 * Failures: 401 not signed in, 412 Spotify not linked, 409 no active device,
 * 403 Premium required, 502 Spotify error.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requestUserId } from '../../../api/identity-guard.js';
import { getValidToken } from '../../../services/identity/spotify-linked-tokens.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyPlaybackRoutes' });

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface PlayerState {
  is_playing?: boolean;
  item?: { name?: string; artists?: Array<{ name: string }> };
  device?: { volume_percent?: number | null };
}

/** Map a failed Spotify response to a status/message the client can show */
async function sendSpotifyError(
  res: ServerResponse,
  response: Awaited<ReturnType<typeof fetch>>
): Promise<void> {
  const text = await response.text().catch(() => '');
  const noDevice = response.status === 404 || text.includes('NO_ACTIVE_DEVICE');
  const premium = response.status === 403 || text.includes('PREMIUM_REQUIRED');
  log.warn({ status: response.status, body: text.slice(0, 200) }, 'Spotify playback call failed');
  sendJson(res, noDevice ? 409 : premium ? 403 : 502, {
    success: false,
    error: noDevice ? 'no_active_device' : premium ? 'premium_required' : 'spotify_error',
  });
}

const COMMANDS: Record<string, { method: 'PUT' | 'POST'; path: string }> = {
  '/api/spotify/play': { method: 'PUT', path: '/me/player/play' },
  '/api/spotify/pause': { method: 'PUT', path: '/me/player/pause' },
  '/api/spotify/skip': { method: 'POST', path: '/me/player/next' },
};

/**
 * Handle owner-scoped Spotify playback routes. Returns false for other paths.
 */
export async function handleSpotifyPlaybackRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const isStatus = pathname === '/api/spotify/status' && req.method === 'GET';
  const isVolume = pathname === '/api/spotify/volume' && req.method === 'POST';
  const command = req.method === 'POST' ? COMMANDS[pathname] : undefined;
  if (!isStatus && !isVolume && !command) return false;

  const ownerId = requestUserId(req);
  if (!ownerId) {
    sendJson(res, 401, { error: 'Sign in required' });
    return true;
  }

  const token = await getValidToken(ownerId);
  if (!token) {
    if (isStatus) {
      sendJson(res, 200, { linked: false, playing: false });
    } else {
      sendJson(res, 412, { success: false, error: 'spotify_not_linked' });
    }
    return true;
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    if (isStatus) {
      const response = await fetch(`${SPOTIFY_API_BASE}/me/player`, { headers });
      if (response.status === 204) {
        sendJson(res, 200, { linked: true, playing: false });
        return true;
      }
      if (!response.ok) {
        await sendSpotifyError(res, response);
        return true;
      }
      const state = (await response.json()) as PlayerState;
      sendJson(res, 200, {
        linked: true,
        playing: !!state.is_playing,
        track: state.item?.name,
        artist: state.item?.artists?.map((a) => a.name).join(', '),
        volume: state.device?.volume_percent ?? undefined,
      });
      return true;
    }

    let endpoint: string;
    let method: 'PUT' | 'POST';
    if (isVolume) {
      const body = await readJson(req);
      const volume = Number(body.volume);
      if (!Number.isFinite(volume)) {
        sendJson(res, 400, { success: false, error: 'volume must be a number 0-100' });
        return true;
      }
      const clamped = Math.round(Math.max(0, Math.min(100, volume)));
      endpoint = `/me/player/volume?volume_percent=${clamped}`;
      method = 'PUT';
    } else {
      endpoint = command!.path;
      method = command!.method;
    }

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, { method, headers });
    if (!response.ok) {
      await sendSpotifyError(res, response);
      return true;
    }
    sendJson(res, 200, { success: true });
  } catch (err) {
    log.error({ error: String(err), pathname }, 'Spotify playback route error');
    sendJson(res, 502, { success: false, error: 'spotify_unreachable' });
  }
  return true;
}
