/**
 * Spotify Routes
 *
 * Handles:
 * - Spotify Web Playback SDK integration (server-side token, device registration)
 * - Spotify OAuth flows (login/callback/status/unlink per device_id)
 *
 * Route differentiation:
 *   /spotify/token?device_id=X  → per-device OAuth access token
 *   /spotify/token              → Web Playback SDK server token
 *   /spotify/status?device_id=X → OAuth link status for a device
 *   /spotify/status             → Web Playback SDK config status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';
import * as spotifyOAuth from '../../token/oauth/spotify.js';
import { createOAuthStateManager } from '../../../utils/ddos-protection.js';
import { isValidId, sendInvalidIdError, getClientIp, sanitizeReturnUrl } from '../../token/validation.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyRoutes' });

// SECURITY: OAuth state bound to originating IP (5-minute expiry)
interface SpotifyOAuthState {
  device_id: string;
  return_url: string;
  client_ip: string;
}

const oauthStates = createOAuthStateManager(5 * 60 * 1000) as {
  create: (data: SpotifyOAuthState) => string | null;
  consume: (state: string) => SpotifyOAuthState | null;
};

/**
 * Handle Spotify routes
 */
export async function handleSpotifyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // ========================================================================
  // SPOTIFY OAUTH FLOWS (device_id-based)
  // ========================================================================

  // Start OAuth login for a device
  if (pathname === '/spotify/login') {
    const device_id = parsedUrl.searchParams.get('device_id') ?? undefined;
    const return_url = parsedUrl.searchParams.get('return_url') ?? undefined;

    if (!spotifyOAuth.isConfigured()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Spotify not configured',
          message: 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env',
        })
      );
      return true;
    }

    if (!device_id || !isValidId(device_id)) {
      sendInvalidIdError(res, 'device_id');
      return true;
    }

    const clientIp = getClientIp(req);
    const state = oauthStates.create({
      device_id,
      return_url: sanitizeReturnUrl(return_url, '/'),
      client_ip: clientIp,
    });
    if (!state) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
      return true;
    }

    log.info({ deviceId: device_id }, 'Spotify OAuth started');
    res.writeHead(302, { Location: spotifyOAuth.buildAuthUrl(state) });
    res.end();
    return true;
  }

  // OAuth callback — exchange code for tokens
  if (pathname === '/spotify/callback') {
    const code = parsedUrl.searchParams.get('code') ?? '';
    const state = parsedUrl.searchParams.get('state') ?? '';
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.error({ error }, 'Spotify OAuth error');
      res.writeHead(302, { Location: '/?spotify_error=' + encodeURIComponent(error) });
      res.end();
      return true;
    }

    const stateData = oauthStates.consume(state);
    if (!stateData) {
      log.error('Invalid or expired OAuth state');
      res.writeHead(302, { Location: '/?spotify_error=invalid_state' });
      res.end();
      return true;
    }

    // SECURITY: Validate callback IP matches originating IP (prevent state theft)
    const callbackIp = getClientIp(req);
    if (stateData.client_ip && stateData.client_ip !== callbackIp) {
      log.warn(
        { originIp: stateData.client_ip, callbackIp, deviceId: stateData.device_id },
        'SECURITY: OAuth callback IP mismatch - possible state theft attempt'
      );
      res.writeHead(302, { Location: '/?spotify_error=security_validation_failed' });
      res.end();
      return true;
    }

    const tokens = await spotifyOAuth.exchangeCode(code);
    if (!tokens) {
      res.writeHead(302, {
        Location: stateData.return_url + '?spotify_error=token_exchange_failed',
      });
      res.end();
      return true;
    }

    spotifyOAuth.saveTokens(stateData.device_id, tokens);
    log.info('Spotify linked successfully');
    res.writeHead(302, { Location: stateData.return_url + '?spotify_linked=true' });
    res.end();
    return true;
  }

  // Remove OAuth tokens for a device
  if (pathname === '/spotify/unlink') {
    const device_id = parsedUrl.searchParams.get('device_id');

    if (!device_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'device_id is required' }));
      return true;
    }

    await spotifyOAuth.removeTokens(device_id);
    log.info({ deviceId: device_id }, 'Spotify unlinked');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Spotify unlinked' }));
    return true;
  }

  // ========================================================================
  // TOKEN ENDPOINT
  // With device_id → per-device OAuth access token
  // Without device_id → Web Playback SDK server token
  // ========================================================================

  if (pathname === '/spotify/token') {
    const device_id = parsedUrl.searchParams.get('device_id');

    if (device_id) {
      // Per-device OAuth token (for voice agent Spotify integration)
      const accessToken = await spotifyOAuth.getValidToken(device_id);
      if (!accessToken) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            linked: false,
            error: 'Spotify not linked for this device',
            login_url: `/spotify/login?device_id=${encodeURIComponent(device_id)}`,
          })
        );
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ linked: true, access_token: accessToken }));
      return true;
    }

    // Web Playback SDK server token (no device_id)
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

  // ========================================================================
  // STATUS ENDPOINT
  // With device_id → OAuth link status for that device
  // Without device_id → Web Playback SDK config status
  // ========================================================================

  if (pathname === '/spotify/status') {
    const device_id = parsedUrl.searchParams.get('device_id');

    if (device_id) {
      // OAuth link status for a specific device
      const userTokens = await spotifyOAuth.getTokens(device_id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          spotify_configured: spotifyOAuth.isConfigured(),
          linked: !!userTokens,
          expires_at: userTokens?.expires_at ?? null,
          login_url: spotifyOAuth.isConfigured()
            ? `/spotify/login?device_id=${encodeURIComponent(device_id)}`
            : null,
        })
      );
      return true;
    }

    // Web Playback SDK status (no device_id) — existing behaviour
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
