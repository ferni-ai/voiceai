/**
 * Spotify Routes
 *
 * Handles:
 * - Spotify Web Playback SDK integration (server-side token, device registration)
 * - Spotify OAuth "connect account" flow and the caller's own link
 *
 * A link belongs to the verified Ferni user. Connecting starts at POST
 * /auth/oauth/start { provider: 'spotify' } (Bearer token), which returns
 * /spotify/login?state=…; the callback saves the tokens under the uid in the
 * state record it consumes. The token/status/unlink routes act for the verified
 * caller. They still accept ?device_id= from older clients, but it only selects
 * "my link" over the server routes below, it never names whose link.
 *
 * Route differentiation:
 *   /spotify/token?device_id=X  → the caller's own Spotify access token
 *   /spotify/token              → Web Playback SDK server token (admin only)
 *   /spotify/status?device_id=X → the caller's link status
 *   /spotify/status             → Web Playback SDK config status (public)
 *   /spotify/device             → Web Playback SDK device (admin only)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';
import * as spotifyOAuth from '../../token/oauth/spotify.js';
import { consumeOAuthLinkState, peekOAuthLinkState } from '../../token/oauth-link-state.js';
import { requireAdmin } from '../../../api/auth-middleware.js';
import { getVerifiedUserId } from '../request-identity.js';
import { OAUTH_START_PATH } from './oauth-start.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyRoutes' });

const PROVIDER = 'spotify';
const CONNECT = { method: 'POST', url: OAUTH_START_PATH, provider: PROVIDER } as const;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string): true {
  res.writeHead(302, { Location: location });
  res.end();
  return true;
}

/** The return URL with one query parameter added. */
function withParam(url: string, key: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

/** The verified caller, or a 401 sent and null. */
function requireCaller(req: IncomingMessage, res: ServerResponse): string | null {
  const uid = getVerifiedUserId(req);
  if (!uid) sendJson(res, 401, { error: 'Sign in required', connect: CONNECT });
  return uid;
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
  // ========================================================================
  // SPOTIFY OAUTH FLOWS (bound to the verified caller)
  // ========================================================================

  // Go on to Spotify: only with a state from POST /auth/oauth/start.
  if (pathname === '/spotify/login') {
    if (!spotifyOAuth.isConfigured()) {
      sendJson(res, 503, {
        error: 'Spotify not configured',
        message: 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env',
      });
      return true;
    }

    const state = parsedUrl.searchParams.get('state');
    const record = await peekOAuthLinkState(state, PROVIDER);
    if (!state || !record) {
      sendJson(res, 401, { error: 'Sign in required', connect: CONNECT });
      return true;
    }

    log.info({ userId: record.uid }, 'Spotify OAuth: redirecting to Spotify');
    return redirect(res, spotifyOAuth.buildAuthUrl(state));
  }

  // OAuth callback: exchange the code and save the tokens for the bound user.
  if (pathname === '/spotify/callback') {
    const code = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');
    // Consumed first, so a denied or failed return still burns the state.
    const record = await consumeOAuthLinkState(req, parsedUrl.searchParams.get('state'), PROVIDER);

    if (error) {
      log.warn({ error }, 'Spotify OAuth error');
      return redirect(res, withParam(record?.returnUrl ?? '/', 'spotify_error', error));
    }
    if (!code || !record) {
      log.warn({ hasCode: !!code }, 'Spotify callback without a code or a valid state');
      return redirect(res, '/?spotify_error=invalid_state');
    }

    const tokens = await spotifyOAuth.exchangeCode(code);
    if (!tokens) {
      return redirect(res, withParam(record.returnUrl, 'spotify_error', 'token_exchange_failed'));
    }

    // The Ferni user comes only from the consumed state record.
    await spotifyOAuth.saveTokens(record.uid, tokens);
    log.info({ userId: record.uid }, 'Spotify linked');
    return redirect(res, withParam(record.returnUrl, 'spotify_linked', 'true'));
  }

  // Remove the caller's Spotify link.
  if (pathname === '/spotify/unlink') {
    const uid = requireCaller(req, res);
    if (!uid) return true;

    await spotifyOAuth.removeTokens(uid);
    log.info({ userId: uid }, 'Spotify unlinked');
    sendJson(res, 200, { success: true, message: 'Spotify unlinked' });
    return true;
  }

  // ========================================================================
  // TOKEN ENDPOINT
  // With device_id → the caller's own OAuth access token
  // Without device_id → Web Playback SDK server token (admin only)
  // ========================================================================

  if (pathname === '/spotify/token') {
    if (parsedUrl.searchParams.has('device_id')) {
      const uid = requireCaller(req, res);
      if (!uid) return true;

      const accessToken = await spotifyOAuth.getValidToken(uid);
      if (!accessToken) {
        sendJson(res, 404, { linked: false, error: 'Spotify not linked', connect: CONNECT });
        return true;
      }
      sendJson(res, 200, { linked: true, access_token: accessToken });
      return true;
    }

    // The server's own Spotify account: no client uses it, so only admins
    // (and local dev with X-Admin-Key) may read it.
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

  // ========================================================================
  // STATUS ENDPOINT
  // With device_id → the caller's link status
  // Without device_id → Web Playback SDK config status
  // ========================================================================

  if (pathname === '/spotify/status') {
    if (parsedUrl.searchParams.has('device_id')) {
      const uid = requireCaller(req, res);
      if (!uid) return true;

      const configured = spotifyOAuth.isConfigured();
      const userTokens = await spotifyOAuth.getTokens(uid);
      sendJson(res, 200, {
        spotify_configured: configured,
        linked: !!userTokens,
        expires_at: userTokens?.expires_at ?? null,
        connect: configured ? CONNECT : null,
      });
      return true;
    }

    // Web Playback SDK status (no device_id) — existing behaviour
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
