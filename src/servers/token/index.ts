/**
 * Token Server - TypeScript version
 *
 * Handles:
 * - LiveKit token generation
 * - Spotify OAuth
 * - Google Calendar OAuth
 * - Demo session rate limiting
 *
 * Run standalone: npx tsx src/servers/token/index.ts
 * Or via gateway: npx tsx src/servers/gateway.ts
 */

import 'dotenv/config';
import http from 'http';
import url from 'url';
import crypto from 'crypto';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TokenServer' });

// DDoS protection
import {
  hardenServer,
  handleHealthEndpoint,
  handleSecurityMonitoring,
  addRequestId,
  createOAuthStateManager,
  registerDDoSAlertCallback,
  startDDoSMonitoring,
} from '../../utils/ddos-protection.js';
import { notifyDDoSAlert } from '../../services/slack-notifications.js';

// Shared utilities
import { setCorsHeaders, handleCorsPreflightRequest } from '../shared/cors.js';

// Token server modules
import {
  validateConfig,
  getLiveKitUrl,
  createToken,
  createRoomWithAgent,
  createDemoRoom,
} from './livekit.js';
import {
  DEMO_CONFIG,
  checkDemoAllowed,
  recordDemoSession,
  startRateLimitCleanup,
} from './demo-rate-limit.js';
import { isValidId, sendInvalidIdError, getClientIp } from './validation.js';
import * as spotify from './oauth/spotify.js';
import * as googleCalendar from './oauth/google-calendar.js';
import * as wearables from './oauth/wearables.js';
import type { WearableProvider } from '../../services/wearable-integration/types.js';

const PORT = parseInt(process.env.TOKEN_SERVER_PORT || '3001', 10);

// ============================================================================
// RATE LIMITING FOR TOKEN ENDPOINT (SECURITY)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const tokenRateLimits = new Map<string, RateLimitEntry>();
const TOKEN_RATE_LIMIT_MAX = 10; // Max 10 tokens per minute per IP
const TOKEN_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Check and enforce rate limit for token generation
 * Returns true if rate limited (should reject), false if allowed
 */
function checkTokenRateLimit(ip: string): {
  limited: boolean;
  remaining: number;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const entry = tokenRateLimits.get(ip);

  // Clean up expired entries periodically
  if (tokenRateLimits.size > 10000) {
    for (const [key, value] of tokenRateLimits) {
      if (now > value.resetAt) {
        tokenRateLimits.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetAt) {
    // New window or expired - start fresh
    tokenRateLimits.set(ip, { count: 1, resetAt: now + TOKEN_RATE_LIMIT_WINDOW_MS });
    return { limited: false, remaining: TOKEN_RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= TOKEN_RATE_LIMIT_MAX) {
    // Rate limited
    return {
      limited: true,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  // Increment counter
  entry.count++;
  return { limited: false, remaining: TOKEN_RATE_LIMIT_MAX - entry.count };
}

// OAuth state types
// SECURITY: OAuth states now include client IP for binding validation
interface SpotifyOAuthState {
  device_id: string;
  return_url: string;
  client_ip: string; // SECURITY: Bind state to originating IP
}

interface GoogleOAuthState {
  user_id: string;
  return_url: string;
  created_at: number;
  client_ip: string; // SECURITY: Bind state to originating IP
}

interface WearablesOAuthState {
  user_id: string;
  provider: WearableProvider;
  return_url: string;
  created_at: number;
  client_ip: string; // SECURITY: Bind state to originating IP
}

// OAuth state manager (5 minute expiry)
const oauthStates = createOAuthStateManager(5 * 60 * 1000) as {
  create: (data: SpotifyOAuthState) => string | null;
  consume: (state: string) => SpotifyOAuthState | null;
};
const googleOAuthStates = new Map<string, GoogleOAuthState>();
const wearablesOAuthStates = new Map<string, WearablesOAuthState>();

// Validate configuration on startup
if (!validateConfig()) {
  process.exit(1);
}

/**
 * Create the HTTP server
 */
export function createTokenServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // Add request ID for tracing
    addRequestId(req, res);

    // Set CORS headers
    setCorsHeaders(req, res);

    // Handle preflight
    if (handleCorsPreflightRequest(req, res)) {
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';
    const query = parsedUrl.query as Record<string, string | undefined>;

    // Health endpoint
    if (handleHealthEndpoint(req, res, pathname, 'token-server')) {
      return;
    }

    // Security monitoring
    if (handleSecurityMonitoring(req, res, pathname)) {
      return;
    }

    // ============================================================================
    // LIVEKIT ENDPOINTS
    // ============================================================================

    // LiveKit URL endpoint
    if (pathname === '/token-url') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: getLiveKitUrl() }));
      return;
    }

    // Demo token endpoint
    if (pathname === '/demo-token') {
      const ip = getClientIp(req);
      const rateCheck = checkDemoAllowed(ip);

      if (!rateCheck.allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': rateCheck.retryAfter || '',
        });
        res.end(
          JSON.stringify({
            error: rateCheck.reason,
            message: rateCheck.message,
            retryAfter: rateCheck.retryAfter,
          })
        );
        return;
      }

      try {
        const demoId = `demo-${crypto.randomBytes(16).toString('hex')}`;
        const roomName = `demo-${crypto.randomBytes(12).toString('hex')}`;
        const username = 'Visitor';

        await createDemoRoom(roomName, demoId, DEMO_CONFIG.sessionDurationMinutes);

        const token = await createToken({
          roomName,
          participantName: username,
          ttl: `${DEMO_CONFIG.sessionDurationMinutes}m`,
          metadata: {
            device_id: demoId,
            persona_id: 'ferni',
            is_demo: true,
          },
        });

        recordDemoSession(ip);

        log.info(
          { sessionsRemaining: (rateCheck.sessionsRemaining || 0) - 1 },
          'Demo token generated'
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            token,
            url: getLiveKitUrl(),
            room: roomName,
            username,
            persona_id: 'ferni',
            is_demo: true,
            session_duration_minutes: DEMO_CONFIG.sessionDurationMinutes,
            sessions_remaining: (rateCheck.sessionsRemaining || 0) - 1,
            upgrade_url: 'https://app.ferni.ai',
          })
        );
      } catch (error) {
        log.error({ error: String(error) }, 'Demo token error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create demo session' }));
      }
      return;
    }

    // Token generation endpoint
    if (pathname === '/token') {
      // SECURITY: Rate limit token generation to prevent abuse
      const clientIp = getClientIp(req);
      const rateCheck = checkTokenRateLimit(clientIp);

      if (rateCheck.limited) {
        log.warn({ ip: clientIp }, 'Token rate limit exceeded');
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(TOKEN_RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil((rateCheck.retryAfterMs || 0) / 1000)),
        });
        res.end(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: 'Too many token requests. Please try again later.',
            retryAfterMs: rateCheck.retryAfterMs,
          })
        );
        return;
      }

      const { room, username, device_id, persona_id, firebase_uid } = query;

      if (!room || !username) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameters: room and username' }));
        return;
      }

      // Validate IDs
      if (device_id && !isValidId(device_id)) {
        sendInvalidIdError(res, 'device_id');
        return;
      }
      if (persona_id && !isValidId(persona_id)) {
        sendInvalidIdError(res, 'persona_id');
        return;
      }
      if (firebase_uid && !isValidId(firebase_uid)) {
        sendInvalidIdError(res, 'firebase_uid');
        return;
      }

      try {
        const personaId = persona_id || 'ferni';

        await createRoomWithAgent(room, {
          persona_id: personaId,
          device_id,
          firebase_uid,
          user_name: username,
        });

        const spotifyLinked = !!spotify.getTokens(device_id || '');

        const token = await createToken({
          roomName: room,
          participantName: username,
          metadata: {
            device_id,
            firebase_uid,
            persona_id: personaId,
            spotify_linked: spotifyLinked,
          },
        });

        log.info(
          { username, room, firebaseUid: firebase_uid || 'none', personaId },
          'Token generated'
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            token,
            url: getLiveKitUrl(),
            room,
            username,
            persona_id: personaId,
            spotify_linked: spotifyLinked,
          })
        );
      } catch (error) {
        log.error({ error: String(error) }, 'Token error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate token' }));
      }
      return;
    }

    // ============================================================================
    // SPOTIFY OAUTH ENDPOINTS
    // ============================================================================

    if (pathname === '/spotify/login') {
      const { device_id, return_url } = query;

      if (!spotify.isConfigured()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Spotify not configured',
            message: 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env',
          })
        );
        return;
      }

      if (!device_id || !isValidId(device_id)) {
        sendInvalidIdError(res, 'device_id');
        return;
      }

      // SECURITY: Bind OAuth state to client IP to prevent CSRF/state theft
      const clientIp = getClientIp(req);
      const state = oauthStates.create({
        device_id,
        return_url: return_url || '/',
        client_ip: clientIp,
      });
      if (!state) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
        return;
      }

      log.info({ deviceId: device_id }, 'Spotify OAuth started');
      res.writeHead(302, { Location: spotify.buildAuthUrl(state) });
      res.end();
      return;
    }

    if (pathname === '/spotify/callback') {
      const { code, state, error } = query;

      if (error) {
        log.error({ error }, 'Spotify OAuth error');
        res.writeHead(302, { Location: '/?spotify_error=' + encodeURIComponent(error) });
        res.end();
        return;
      }

      const stateData = oauthStates.consume(state || '');
      if (!stateData) {
        log.error('Invalid or expired OAuth state');
        res.writeHead(302, { Location: '/?spotify_error=invalid_state' });
        res.end();
        return;
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
        return;
      }

      const tokens = await spotify.exchangeCode(code || '');
      if (!tokens) {
        res.writeHead(302, {
          Location: stateData.return_url + '?spotify_error=token_exchange_failed',
        });
        res.end();
        return;
      }

      spotify.saveTokens(stateData.device_id!, tokens);
      log.info('Spotify linked successfully');
      res.writeHead(302, { Location: stateData.return_url + '?spotify_linked=true' });
      res.end();
      return;
    }

    if (pathname === '/spotify/token') {
      const { device_id } = query;

      if (!device_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'device_id is required' }));
        return;
      }

      const accessToken = await spotify.getValidToken(device_id);

      if (!accessToken) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            linked: false,
            error: 'Spotify not linked for this device',
            login_url: `/spotify/login?device_id=${encodeURIComponent(device_id)}`,
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ linked: true, access_token: accessToken }));
      return;
    }

    if (pathname === '/spotify/status') {
      const { device_id } = query;

      if (!device_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'device_id is required' }));
        return;
      }

      const userTokens = await spotify.getTokens(device_id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          spotify_configured: spotify.isConfigured(),
          linked: !!userTokens,
          expires_at: userTokens?.expires_at || null,
          login_url: spotify.isConfigured()
            ? `/spotify/login?device_id=${encodeURIComponent(device_id)}`
            : null,
        })
      );
      return;
    }

    if (pathname === '/spotify/unlink') {
      const { device_id } = query;

      if (!device_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'device_id is required' }));
        return;
      }

      await spotify.removeTokens(device_id);
      log.info({ deviceId: device_id }, 'Spotify unlinked');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Spotify unlinked' }));
      return;
    }

    // ============================================================================
    // GOOGLE CALENDAR OAUTH ENDPOINTS
    // ============================================================================

    if (pathname === '/auth/google/login') {
      const { user_id, return_url } = query;

      if (!googleCalendar.isConfigured()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Google Calendar OAuth not configured',
            message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET',
          })
        );
        return;
      }

      if (!user_id || !isValidId(user_id)) {
        sendInvalidIdError(res, 'user_id');
        return;
      }

      // SECURITY: Bind OAuth state to client IP
      const clientIp = getClientIp(req);
      const state = crypto.randomUUID();
      googleOAuthStates.set(state, {
        user_id,
        return_url: return_url || '/?calendar_linked=true',
        created_at: Date.now(),
        client_ip: clientIp,
      });

      // Cleanup old states (> 10 minutes)
      const maxAge = 10 * 60 * 1000;
      for (const [key, value] of googleOAuthStates) {
        if (Date.now() - value.created_at > maxAge) {
          googleOAuthStates.delete(key);
        }
      }

      log.info({ userId: user_id }, 'Starting Google Calendar OAuth');
      res.writeHead(302, { Location: googleCalendar.buildAuthUrl(state) });
      res.end();
      return;
    }

    if (pathname === '/auth/google/callback') {
      const { code, state, error } = query;

      if (error) {
        log.error({ error }, 'Google Calendar OAuth error');
        res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
        res.end();
        return;
      }

      const stateData = googleOAuthStates.get(state || '');
      if (!stateData) {
        log.error('Invalid Google OAuth state');
        res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
        res.end();
        return;
      }

      googleOAuthStates.delete(state || '');

      // SECURITY: Validate callback IP matches originating IP
      const callbackIp = getClientIp(req);
      if (stateData.client_ip && stateData.client_ip !== callbackIp) {
        log.warn(
          { originIp: stateData.client_ip, callbackIp, userId: stateData.user_id },
          'SECURITY: Google OAuth callback IP mismatch - possible state theft attempt'
        );
        res.writeHead(302, { Location: '/?calendar_error=security_validation_failed' });
        res.end();
        return;
      }

      const tokens = await googleCalendar.exchangeCode(code || '');
      if (!tokens) {
        res.writeHead(302, {
          Location: stateData.return_url + '?calendar_error=token_exchange_failed',
        });
        res.end();
        return;
      }

      googleCalendar.saveTokens(stateData.user_id, tokens);
      log.info('Google Calendar linked successfully');
      res.writeHead(302, { Location: stateData.return_url + '?calendar_linked=true' });
      res.end();
      return;
    }

    if (pathname === '/auth/google/token') {
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      const accessToken = await googleCalendar.getValidToken(user_id);

      if (!accessToken) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            linked: false,
            error: 'Google Calendar not linked for this user',
            login_url: `/auth/google/login?user_id=${encodeURIComponent(user_id)}`,
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ linked: true, access_token: accessToken }));
      return;
    }

    if (pathname === '/auth/google/status') {
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      const userTokens = await googleCalendar.getTokens(user_id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          google_calendar_configured: googleCalendar.isConfigured(),
          linked: !!userTokens,
          expires_at: userTokens?.expires_at || null,
          login_url: googleCalendar.isConfigured()
            ? `/auth/google/login?user_id=${encodeURIComponent(user_id)}`
            : null,
        })
      );
      return;
    }

    if (pathname === '/auth/google/unlink') {
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      await googleCalendar.removeTokens(user_id);
      log.info({ userId: user_id }, 'Google Calendar unlinked');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
      return;
    }

    // ============================================================================
    // WEARABLES OAUTH ENDPOINTS
    // ============================================================================

    // Wearables status - get connection status for all providers
    if (pathname === '/wearables/status') {
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      const statuses = await wearables.getAllConnectionStatuses(user_id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providers: statuses }));
      return;
    }

    // Dynamic wearables login - /wearables/{provider}/login
    const wearableLoginMatch = pathname.match(/^\/wearables\/(fitbit|oura|garmin|whoop)\/login$/);
    if (wearableLoginMatch) {
      const provider = wearableLoginMatch[1] as Exclude<WearableProvider, 'apple_health'>;
      const { user_id, return_url } = query;

      if (!wearables.isProviderConfigured(provider)) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `${provider} not configured`,
            message: `Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET in .env`,
          })
        );
        return;
      }

      if (!user_id || !isValidId(user_id)) {
        sendInvalidIdError(res, 'user_id');
        return;
      }

      // SECURITY: Bind OAuth state to client IP
      const clientIp = getClientIp(req);
      const state = crypto.randomUUID();
      wearablesOAuthStates.set(state, {
        user_id,
        provider,
        return_url: return_url || `/?${provider}_linked=true`,
        created_at: Date.now(),
        client_ip: clientIp,
      });

      // Cleanup old states (> 10 minutes)
      const maxAge = 10 * 60 * 1000;
      for (const [key, value] of wearablesOAuthStates) {
        if (Date.now() - value.created_at > maxAge) {
          wearablesOAuthStates.delete(key);
        }
      }

      const authUrl = wearables.buildAuthUrl(provider, state);
      if (!authUrl) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to build auth URL' }));
        return;
      }

      log.info({ userId: user_id, provider }, 'Starting wearable OAuth');
      res.writeHead(302, { Location: authUrl });
      res.end();
      return;
    }

    // Dynamic wearables callback - /wearables/{provider}/callback
    const wearableCallbackMatch = pathname.match(
      /^\/wearables\/(fitbit|oura|garmin|whoop)\/callback$/
    );
    if (wearableCallbackMatch) {
      const provider = wearableCallbackMatch[1] as Exclude<WearableProvider, 'apple_health'>;
      const { code, state, error } = query;

      if (error) {
        log.error({ error, provider }, 'Wearable OAuth error');
        res.writeHead(302, { Location: `/?${provider}_error=` + encodeURIComponent(error) });
        res.end();
        return;
      }

      const stateData = wearablesOAuthStates.get(state || '');
      if (!stateData || stateData.provider !== provider) {
        log.error({ provider }, 'Invalid wearable OAuth state');
        res.writeHead(302, { Location: `/?${provider}_error=invalid_state` });
        res.end();
        return;
      }

      wearablesOAuthStates.delete(state || '');

      // SECURITY: Validate callback IP matches originating IP
      const callbackIp = getClientIp(req);
      if (stateData.client_ip && stateData.client_ip !== callbackIp) {
        log.warn(
          { originIp: stateData.client_ip, callbackIp, userId: stateData.user_id, provider },
          'SECURITY: Wearable OAuth callback IP mismatch - possible state theft attempt'
        );
        res.writeHead(302, { Location: `/?${provider}_error=security_validation_failed` });
        res.end();
        return;
      }

      // Pass state for PKCE-enabled providers (e.g., Garmin)
      const tokens = await wearables.exchangeCode(provider, code || '', state || '');
      if (!tokens) {
        res.writeHead(302, {
          Location: stateData.return_url + `?${provider}_error=token_exchange_failed`,
        });
        res.end();
        return;
      }

      await wearables.saveTokens(provider, stateData.user_id, tokens);
      log.info({ provider, userId: stateData.user_id }, 'Wearable linked successfully');
      res.writeHead(302, { Location: stateData.return_url + `?${provider}_linked=true` });
      res.end();
      return;
    }

    // Dynamic wearables token - /wearables/{provider}/token
    const wearableTokenMatch = pathname.match(/^\/wearables\/(fitbit|oura|garmin|whoop)\/token$/);
    if (wearableTokenMatch) {
      const provider = wearableTokenMatch[1] as Exclude<WearableProvider, 'apple_health'>;
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      const accessToken = await wearables.getValidToken(provider, user_id);

      if (!accessToken) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            linked: false,
            error: `${provider} not linked for this user`,
            login_url: `/wearables/${provider}/login?user_id=${encodeURIComponent(user_id)}`,
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ linked: true, access_token: accessToken }));
      return;
    }

    // Dynamic wearables unlink - /wearables/{provider}/unlink
    const wearableUnlinkMatch = pathname.match(
      /^\/wearables\/(fitbit|oura|garmin|whoop|apple_health)\/unlink$/
    );
    if (wearableUnlinkMatch) {
      const provider = wearableUnlinkMatch[1] as WearableProvider;
      const { user_id } = query;

      if (!user_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'user_id is required' }));
        return;
      }

      await wearables.removeTokens(provider, user_id);
      log.info({ userId: user_id, provider }, 'Wearable unlinked');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `${provider} unlinked` }));
      return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // Apply DDoS protection
  hardenServer(server);

  return server;
}

/**
 * Start the token server
 */
export function startTokenServer(port = PORT): http.Server {
  const server = createTokenServer();

  // Register DDoS alerting
  registerDDoSAlertCallback(async (details) => {
    await notifyDDoSAlert(details);
  });

  // Start DDoS monitoring
  startDDoSMonitoring('token-server', 30_000);

  // Start rate limit cleanup
  startRateLimitCleanup();

  server.listen(port, () => {
    log.info(
      {
        port,
        livekitUrl: getLiveKitUrl(),
        spotifyConfigured: spotify.isConfigured(),
        googleCalendarConfigured: googleCalendar.isConfigured(),
        wearablesConfigured: wearables.getConfiguredProviders(),
        ddosProtection: true,
      },
      'Token server started'
    );
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down token server...');
    server.close(() => {
      log.info('Server stopped');
      process.exit(0);
    });
  });

  return server;
}

// Run standalone if invoked directly
const isMainModule =
  process.argv[1]?.includes('token/index') || process.argv[1]?.includes('token-server');
if (isMainModule) {
  startTokenServer();
}
