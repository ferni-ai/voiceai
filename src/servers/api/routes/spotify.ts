/**
 * Spotify Routes
 *
 * Handles Spotify Web Playback SDK integration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';

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
    console.log('🎵 /spotify/token requested', forceRefresh ? '(force refresh)' : '');

    if (!spotifyService.isConfigured() || !spotifyService.getRefreshToken()) {
      console.error('❌ Spotify not configured');
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
      console.error('❌ Spotify token error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get token' }));
    }
    return true;
  }

  // Register Spotify Web Player device
  if (pathname === '/spotify/device' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));

    return new Promise((resolve) => {
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
          console.error('❌ Spotify device registration error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
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
