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

const PORT = parseInt(process.env.TOKEN_SERVER_PORT || '3001', 10);

// OAuth state types
interface SpotifyOAuthState {
  device_id: string;
  return_url: string;
}

interface GoogleOAuthState {
  user_id: string;
  return_url: string;
  created_at: number;
}

// OAuth state manager (5 minute expiry)
const oauthStates = createOAuthStateManager(5 * 60 * 1000) as {
  create: (data: SpotifyOAuthState) => string | null;
  consume: (state: string) => SpotifyOAuthState | null;
};
const googleOAuthStates = new Map<string, GoogleOAuthState>();

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

        console.log(
          `✅ Demo token generated (${(rateCheck.sessionsRemaining || 0) - 1} sessions remaining for this IP today)`
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
        console.error('❌ Demo token error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to create demo session' }));
      }
      return;
    }

    // Token generation endpoint
    if (pathname === '/token') {
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

        console.log(
          `✅ Token generated for "${username}" in room "${room}" (firebase: ${firebase_uid || 'none'}, persona: ${personaId})`
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
        console.error('❌ Token error:', error);
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

      const state = oauthStates.create({ device_id, return_url: return_url || '/' });
      if (!state) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
        return;
      }

      console.log(`🎵 Spotify OAuth started for device: ${device_id}`);
      res.writeHead(302, { Location: spotify.buildAuthUrl(state) });
      res.end();
      return;
    }

    if (pathname === '/spotify/callback') {
      const { code, state, error } = query;

      if (error) {
        console.error(`❌ Spotify OAuth error: ${error}`);
        res.writeHead(302, { Location: '/?spotify_error=' + encodeURIComponent(error) });
        res.end();
        return;
      }

      const stateData = oauthStates.consume(state || '');
      if (!stateData) {
        console.error('❌ Invalid or expired OAuth state');
        res.writeHead(302, { Location: '/?spotify_error=invalid_state' });
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
      console.log('✅ Spotify linked successfully');
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

      const userTokens = spotify.getTokens(device_id);

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

      spotify.removeTokens(device_id);
      console.log(`🎵 Spotify unlinked for device: ${device_id}`);

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

      const state = crypto.randomUUID();
      googleOAuthStates.set(state, {
        user_id,
        return_url: return_url || '/?calendar_linked=true',
        created_at: Date.now(),
      });

      // Cleanup old states (> 10 minutes)
      const maxAge = 10 * 60 * 1000;
      for (const [key, value] of googleOAuthStates) {
        if (Date.now() - value.created_at > maxAge) {
          googleOAuthStates.delete(key);
        }
      }

      console.log(`📅 Starting Google Calendar OAuth for user: ${user_id}`);
      res.writeHead(302, { Location: googleCalendar.buildAuthUrl(state) });
      res.end();
      return;
    }

    if (pathname === '/auth/google/callback') {
      const { code, state, error } = query;

      if (error) {
        console.error(`❌ Google Calendar OAuth error: ${error}`);
        res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
        res.end();
        return;
      }

      const stateData = googleOAuthStates.get(state || '');
      if (!stateData) {
        console.error('❌ Invalid Google OAuth state');
        res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
        res.end();
        return;
      }

      googleOAuthStates.delete(state || '');

      const tokens = await googleCalendar.exchangeCode(code || '');
      if (!tokens) {
        res.writeHead(302, {
          Location: stateData.return_url + '?calendar_error=token_exchange_failed',
        });
        res.end();
        return;
      }

      googleCalendar.saveTokens(stateData.user_id, tokens);
      console.log('✅ Google Calendar linked successfully');
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

      const userTokens = googleCalendar.getTokens(user_id);

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

      googleCalendar.removeTokens(user_id);
      console.log(`📅 Google Calendar unlinked for user: ${user_id}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
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
    console.log('');
    console.log('🎫 LiveKit Token Server (TypeScript)');
    console.log('━'.repeat(50));
    console.log(`📡 Server running at http://localhost:${port}`);
    console.log(`🔗 LiveKit URL: ${getLiveKitUrl()}`);
    console.log(`🎵 Spotify: ${spotify.isConfigured() ? '✅ Configured' : '❌ Not configured'}`);
    console.log(
      `📅 Google Calendar: ${googleCalendar.isConfigured() ? '✅ Configured' : '❌ Not configured'}`
    );
    console.log(`🛡️  DDoS Protection: ✅ Enabled`);
    console.log('━'.repeat(50));
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down token server...');
    server.close(() => {
      console.log('✅ Server stopped');
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
