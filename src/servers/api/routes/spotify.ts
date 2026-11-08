/**
 * Spotify Routes
 *
 * The house account's Web Playback SDK routes, and the delete-only end of the
 * per-user link that Ferni no longer offers (Spotify Developer Policy III.3;
 * see token/oauth/spotify.ts). There is no connect, callback, link status or
 * per-user token: GET /spotify/unlink removes an old link for the verified
 * caller, never for an id named in the URL.
 *
 *   /spotify/unlink  → remove the caller's old Spotify link (signed in)
 *   /spotify/token   → Web Playback SDK server token (admin only)
 *   /spotify/status  → Web Playback SDK config status (public booleans)
 *   /spotify/device  → Web Playback SDK device (admin only)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';
import { removeTokens } from '../../token/oauth/spotify.js';
import { requireAdmin } from '../../../api/auth-middleware.js';
import { getVerifiedUserId } from '../request-identity.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyRoutes' });

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * Handle Spotify routes
 */
export async function handleSpotifyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Remove the caller's old Spotify link (delete only: nothing links any more).
  if (pathname === '/spotify/unlink') {
    const uid = getVerifiedUserId(req);
    if (!uid) {
      sendJson(res, 401, { error: 'Sign in required' });
      return true;
    }
    await removeTokens(uid);
    log.info({ userId: uid }, 'Spotify unlinked');
    sendJson(res, 200, { success: true, message: 'Spotify unlinked' });
    return true;
  }

  // The server's own Spotify account token: no client uses it, so only admins
  // (and local dev with X-Admin-Key) may read it.
  if (pathname === '/spotify/token') {
    if (!(await requireAdmin(req, res))) return true;

    const forceRefresh = parsedUrl.searchParams.get('force') === '1';
    log.debug({ forceRefresh }, '/spotify/token requested');

    if (!spotifyService.isConfigured() || !spotifyService.getRefreshToken()) {
      log.error('Spotify not configured');
      sendJson(res, 500, {
        error: 'Spotify not configured',
        message: 'Run pnpm auth:spotify to connect Spotify',
      });
      return true;
    }

    try {
      const accessToken = await spotifyService.getAccessToken();
      if (!accessToken) {
        sendJson(res, 500, { error: 'Failed to get access token' });
        return true;
      }
      sendJson(res, 200, { token: accessToken, expires_at: spotifyService.getTokenExpiry() });
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Spotify token error');
      sendJson(res, 500, { error: 'Failed to get token' });
    }
    return true;
  }

  // Web Playback SDK config status (public booleans)
  if (pathname === '/spotify/status') {
    const config = spotifyService.getConfig();
    sendJson(res, 200, {
      configured: spotifyService.isConfigured(),
      has_refresh_token: config.hasRefreshToken,
      has_web_device: config.hasWebDevice,
    });
    return true;
  }

  // The device is the playback target for the server's own Spotify account,
  // not a user's. No client registers or reads it, so only admins may.
  if (pathname === '/spotify/device' && (req.method === 'POST' || req.method === 'GET')) {
    if (!(await requireAdmin(req, res))) return true;
  }

  // Register Spotify Web Player device
  if (pathname === '/spotify/device' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    // FIX BUG: Add error handler to prevent hanging promises on request errors
    return new Promise((resolve) => {
      req.on('error', (err) => {
        log.error({ error: err.message }, 'Request error in Spotify device registration');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request error' }));
        }
        resolve(true);
      });

      req.on('end', () => {
        try {
          const { device_id } = JSON.parse(body) as { device_id: string };

          if (!device_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing device_id' }));
            resolve(true);
            return;
          }

          spotifyService.setWebDeviceId(device_id);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, device_id }));
        } catch (err) {
          log.error({ error: (err as Error).message }, 'Spotify device registration error');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
        resolve(true);
      });
    });
  }

  // Get current Spotify device
  if (pathname === '/spotify/device' && req.method === 'GET') {
    const deviceId = spotifyService.getWebDeviceId();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        device_id: deviceId,
        has_device: !!deviceId,
      })
    );
    return true;
  }

  return false;
}
