/**
 * Spotify Routes
 *
 * Handles Spotify Web Playback SDK integration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyRoutes' });

/**
 * Handle Spotify routes
 */
export async function handleSpotifyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Get Spotify access token for Web Playback SDK
  if (pathname === '/spotify/token') {
    const forceRefresh = parsedUrl.searchParams.get('force') === '1';
    log.debug({ forceRefresh }, '/spotify/token requested');

    if (!spotifyService.isConfigured() || !spotifyService.getRefreshToken()) {
      log.error('Spotify not configured');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Spotify not configured',
          message: 'Run pnpm auth:spotify to connect Spotify',
        })
      );
      return true;
    }

    try {
      const accessToken = await spotifyService.getAccessToken();

      if (!accessToken) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to get access token' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          token: accessToken,
          expires_at: spotifyService.getTokenExpiry(),
        })
      );
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Spotify token error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get token' }));
    }
    return true;
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

  // Spotify status
  if (pathname === '/spotify/status') {
    const config = spotifyService.getConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        configured: spotifyService.isConfigured(),
        has_refresh_token: config.hasRefreshToken,
        has_web_device: config.hasWebDevice,
      })
    );
    return true;
  }

  return false;
}
