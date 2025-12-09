/**
 * UI Server with Token Server + Plaid Integration
 * Serves the frontend UI, provides LiveKit token generation, and handles Plaid OAuth flow
 */

import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import path from 'path';

// Engagement API routes (conversations, analytics, predictions, etc.)
import { handleEngagementRoutes } from './dist/api/engagement-routes.js';

// Diagnostics API routes (handoff metrics, etc.) - requires admin auth
import { handleDiagnosticsRoutes } from './dist/api/handoff-diagnostics.js';

// Feature flags, DORA metrics, voice presence, observability routes
import { handleDORARoutes } from './dist/api/dora-routes.js';
import { handleFeatureFlagRoutes } from './dist/api/feature-flag-routes.js';
import { handleObservabilityRoutes } from './dist/api/observability-routes.js';
import { handleVoicePresenceRoutes } from './dist/api/voice-presence-routes.js';

// Proactive Outreach API routes
import { handleOutreachRoutes } from './dist/api/outreach-handler.js';

// GDPR compliance routes (data export, deletion, consent)
import { handleGDPRRoutes } from './dist/api/gdpr-routes.js';

// Trust Journey & Export routes (Phase 1 & 2)
import { handleTrustExportRoutes } from './dist/api/trust-export-routes.js';
import { handleTrustJourneyRoutes } from './dist/api/trust-journey-routes.js';

// Calendar routes (for smart timing)
import { handleCalendarRoutes } from './dist/api/calendar-routes.js';

// Trust Systems consolidated routes (Phases 12-29)
import { handleTrustSystemsRoutes } from './dist/api/trust-systems-routes.js';

// Feature Flags routes (P7)
import { handleFeatureFlagsRoutes } from './dist/api/feature-flags-routes.js';

// Monitoring routes (P11)
import { handleMonitoringRoutes } from './dist/api/monitoring-routes.js';

// Relationship Health Dashboard routes
import { relationshipHealthRoutes } from './dist/api/routes/relationship-health-routes.js';

// Relationship Progress routes
import { handleRelationshipRoutes } from './dist/api/routes/relationship.js';

// Voice Humanization routes (metrics, feature flags)
import { handleVoiceHumanizationRoutes } from './dist/api/voice-humanization-routes.js';

// Voice Authentication routes (enrollment, verification, identification)
import { handleVoiceAuthRoutes } from './dist/api/voice-auth-handler.js';

// User preferences routes (timezone, quiet hours, contact info)
import { handleUserRoutes } from './dist/api/user-routes.js';

// Habit persistence routes (CRUD, completions, streaks)
import { handleHabitRoutes } from './dist/api/habit-routes.js';

// EvalOps - Quality evaluation system (LLM-as-judge, voice fingerprints, test scenarios)
// NOTE: Temporarily disabled - evalops module is WIP with TypeScript errors
// import { handleEvalOpsRoutes } from './dist/api/evalops-handler.js';

// Subscription routes (Stripe checkout, billing portal, usage tracking)
import {
  handleSubscriptionRequest,
  isSubscriptionRoute,
} from './dist/api/subscription-routes.js';

// Rate limiting and auth for sensitive endpoints
import { rateLimit, requireAdmin, requireAuth } from './dist/api/auth-middleware.js';

const PORT = process.env.PORT || 3003;
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Plaid configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_BASE_URL =
  {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[PLAID_ENV] || 'https://sandbox.plaid.com';

// Spotify configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_TOKENS_FILE = path.join(process.cwd(), '.spotify-tokens.json');

// Spotify state - device ID from web player
let spotifyWebDeviceId = null;
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

// Get Spotify refresh token from file or .env
function getSpotifyRefreshToken() {
  // Try file first (new system)
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
      if (data.refresh_token) {
        console.log('🎵 Using refresh token from .spotify-tokens.json');
        return data.refresh_token;
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not read Spotify tokens file:', err.message);
  }

  // Fall back to .env (old system)
  const envToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (envToken) {
    console.log('🎵 Using refresh token from .env (consider running scripts/spotify-auth.js)');
    return envToken;
  }

  return null;
}

// Save updated tokens to file
function saveSpotifyTokens(accessToken, refreshToken, expiresIn, scope = '') {
  try {
    // Preserve existing scope if not provided
    let existingScope = scope;
    if (!scope && fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
        existingScope = existing.scope || '';
      } catch {}
    }

    const data = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000,
      token_type: 'Bearer',
      scope: existingScope,
    };
    fs.writeFileSync(SPOTIFY_TOKENS_FILE, JSON.stringify(data, null, 2));
    console.log(
      '🎵 Saved updated tokens to .spotify-tokens.json (scope:',
      existingScope.slice(0, 50) + '...)'
    );
  } catch (err) {
    console.warn('⚠️ Could not save Spotify tokens:', err.message);
  }
}

// Get token expiry time from file
function getSpotifyTokenExpiry() {
  try {
    if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
      return data.expires_at || 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

// Proactive token refresh - runs in background
async function refreshSpotifyTokenIfNeeded() {
  const refreshToken = getSpotifyRefreshToken();
  if (!refreshToken || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return; // Not configured
  }

  const expiresAt = getSpotifyTokenExpiry();
  const now = Date.now();
  const minutesUntilExpiry = Math.round((expiresAt - now) / 60000);

  // Refresh if less than 10 minutes remaining
  if (expiresAt > 0 && minutesUntilExpiry > 10) {
    console.log(`🎵 Spotify token valid for ${minutesUntilExpiry} more minutes`);
    return;
  }

  console.log(
    `🎵 Spotify token ${expiresAt === 0 ? 'not cached' : `expiring in ${minutesUntilExpiry} min`} - refreshing...`
  );

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('❌ Auto-refresh failed:', tokenResponse.status);
      return;
    }

    const data = await tokenResponse.json();
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

    // Save to file
    saveSpotifyTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in);

    const newMinutes = Math.round(data.expires_in / 60);
    console.log(`✅ Spotify token auto-refreshed! Valid for ${newMinutes} minutes`);
  } catch (err) {
    console.error('❌ Auto-refresh error:', err.message);
  }
}

// Start background refresh checker (every 5 minutes)
function startSpotifyAutoRefresh() {
  // Check immediately on startup
  refreshSpotifyTokenIfNeeded();

  // Then check every 5 minutes
  setInterval(refreshSpotifyTokenIfNeeded, 5 * 60 * 1000);
  console.log('🎵 Spotify auto-refresh enabled (checks every 5 min)');
}

// In-memory token storage (production would use database)
// This is shared between server and agent via file or Redis
const plaidAccessTokens = new Map();
const PLAID_TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json');

// Load tokens from file on startup
function loadPlaidTokens() {
  try {
    if (fs.existsSync(PLAID_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAID_TOKENS_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        plaidAccessTokens.set(key, value);
      }
      console.log(`✅ Loaded ${plaidAccessTokens.size} Plaid tokens from storage`);
    }
  } catch (err) {
    console.warn('⚠️ Could not load Plaid tokens:', err.message);
  }
}

// Save tokens to file
function savePlaidTokens() {
  try {
    const data = Object.fromEntries(plaidAccessTokens);
    fs.writeFileSync(PLAID_TOKENS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not save Plaid tokens:', err.message);
  }
}

// Store a Plaid access token for a user
function storePlaidToken(userId, accessToken, itemId, institution) {
  plaidAccessTokens.set(userId, {
    access_token: accessToken,
    item_id: itemId,
    institution,
    linked_at: new Date().toISOString(),
  });
  savePlaidTokens();
  console.log(`🔐 Stored Plaid token for user: ${userId} (${institution?.name || 'Unknown'})`);
}

// Get Plaid access token for a user (exported for agent use)
export function getPlaidToken(userId) {
  return plaidAccessTokens.get(userId);
}

loadPlaidTokens();

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    '❌ Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
  );
  process.exit(1);
}

// Agent dispatch client for dispatching agents to rooms
const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// Default agent name - must match livekit.toml agent name
// The persona is passed via metadata, not separate agents
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

/**
 * Generate LiveKit access token
 */
async function createToken(roomName, participantName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Serve static files from frontend-typescript/dist directory
 */
function serveStaticFile(filePath, res) {
  const fullPath = path.join(process.cwd(), 'frontend-typescript', 'dist', filePath);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  const frontendDir = path.resolve(process.cwd(), 'frontend-typescript', 'dist');
  if (!resolvedPath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// Allowed origins for CORS (restrict in production)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3004', 'http://localhost:3002', 'https://ferni.ai', 'https://john-bogle-ui-1031920444452.us-central1.run.app'];

function getCorsOrigin(req) {
  const origin = req.headers.origin;
  // In development or if origin matches allowed list, return it
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    return origin;
  }
  // Default to first allowed origin (won't match, blocking the request effectively)
  return ALLOWED_ORIGINS[0];
}

// HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS with origin validation
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, Authorization, Stripe-Signature');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ============================================================================
  // ENGAGEMENT API ROUTES (conversations, analytics, predictions, rituals, etc.)
  // ============================================================================
  try {
    const handled = await handleEngagementRoutes(req, res, pathname, parsedUrl);
    if (handled) return;
  } catch (err) {
    console.error('❌ Engagement route error:', err);
  }

  // ============================================================================
  // DIAGNOSTICS API ROUTES (requires admin auth)
  // ============================================================================
  try {
    const handled = await handleDiagnosticsRoutes(req, res, pathname, parsedUrl);
    if (handled) return;
  } catch (err) {
    console.error('❌ Diagnostics route error:', err);
  }

  // ============================================================================
  // FEATURE FLAGS, DORA, VOICE PRESENCE, OBSERVABILITY ROUTES
  // ============================================================================
  try {
    // Feature flags
    if (pathname.startsWith('/api/flags')) {
      const handled = await handleFeatureFlagRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // DORA metrics
    if (pathname.startsWith('/api/dora')) {
      const handled = await handleDORARoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Voice presence
    if (pathname.startsWith('/api/voice-presence')) {
      const handled = await handleVoicePresenceRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Observability
    if (pathname.startsWith('/api/observability')) {
      const handled = await handleObservabilityRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // GDPR compliance (data export, deletion, consent)
    if (pathname.startsWith('/api/gdpr')) {
      const handled = await handleGDPRRoutes(req, res, pathname);
      if (handled) return;
    }

    // Trust Journey visualization (Phase 1)
    if (pathname.startsWith('/api/trust-journey')) {
      const handled = await handleTrustJourneyRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust data export (Phase 2)
    if (pathname.startsWith('/api/trust-export')) {
      const handled = await handleTrustExportRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Calendar routes (for smart outreach timing)
    if (pathname.startsWith('/api/calendar')) {
      const handled = await handleCalendarRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Trust Systems consolidated routes (Phases 12-29)
    if (pathname.startsWith('/api/trust/')) {
      const handled = await handleTrustSystemsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship Progress routes (must be before health routes for specificity)
    if (pathname === '/api/relationship/progress') {
      const handled = await handleRelationshipRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Relationship Health Dashboard routes
    if (pathname.startsWith('/api/relationship/')) {
      const handled = await relationshipHealthRoutes(req, res);
      if (handled) return;
    }

    // Proactive Outreach routes
    if (pathname.startsWith('/api/outreach')) {
      const handled = await handleOutreachRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Feature Flags routes (P7)
    if (pathname.startsWith('/api/flags')) {
      const handled = await handleFeatureFlagsRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Monitoring routes (P11)
    if (pathname.startsWith('/api/monitoring')) {
      const handled = await handleMonitoringRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Voice Humanization routes (metrics, feature toggles, dashboard)
    if (pathname.startsWith('/api/voice-humanization')) {
      const handled = await handleVoiceHumanizationRoutes(req, res, pathname);
      if (handled) return;
    }

    // Voice Authentication routes (enrollment, verification, identification)
    if (pathname.startsWith('/api/voice/')) {
      const handled = await handleVoiceAuthRoutes(req, res, pathname);
      if (handled) return;
    }

    // User preferences routes (timezone, quiet hours, contact info)
    if (pathname.startsWith('/api/user')) {
      const handled = await handleUserRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // Habit persistence routes (CRUD, completions, streaks)
    if (pathname.startsWith('/api/habits')) {
      const handled = await handleHabitRoutes(req, res, pathname, parsedUrl);
      if (handled) return;
    }

    // EvalOps - Quality evaluation system
    // NOTE: Temporarily disabled - evalops module is WIP with TypeScript errors
    // if (pathname.startsWith('/api/evalops')) {
    //   const handled = await handleEvalOpsRoutes(req, res, pathname, parsedUrl);
    //   if (handled) return;
    // }

    // Subscription routes (Stripe checkout, billing portal, usage tracking)
    if (isSubscriptionRoute(pathname)) {
      try {
        // Parse body for POST requests
        let body = undefined;
        if (req.method === 'POST' || req.method === 'PUT') {
          body = await new Promise((resolve) => {
            let data = '';
            req.on('data', (chunk) => (data += chunk));
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch {
                resolve(data); // Keep raw for webhook signature verification
              }
            });
          });
        }

        // Build request context
        const ctx = {
          method: req.method,
          pathname,
          query: Object.fromEntries(parsedUrl.searchParams),
          body,
          headers: req.headers,
        };

        // Handle the request
        const response = await handleSubscriptionRequest(ctx);

        // Send response
        res.writeHead(response.status, response.headers);
        res.end(JSON.stringify(response.body));
        return;
      } catch (err) {
        console.error('❌ Subscription route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }
    }
  } catch (err) {
    console.error('❌ API route error:', err);
  }

  // Health check endpoint
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', service: 'ferni-ui', timestamp: new Date().toISOString() })
    );
    return;
  }

  // Comprehensive health dashboard endpoint
  if (pathname === '/health/dashboard') {
    // NOTE: CORS already set at top of handler via getCorsOrigin()

    const dashboard = {
      status: 'ok',
      service: 'ferni-ui',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node: process.version,
      checks: {
        livekit: {
          configured: !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
          url: LIVEKIT_URL ? LIVEKIT_URL.replace(/\/\/.*@/, '//***@') : null, // Mask creds
        },
        plaid: {
          configured: !!(PLAID_CLIENT_ID && PLAID_SECRET),
          environment: PLAID_ENV,
        },
        spotify: {
          configured: !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
          hasRefreshToken: !!getSpotifyRefreshToken(),
          hasWebDevice: !!spotifyWebDeviceId,
        },
        firebase: {
          projectId: process.env.GCP_PROJECT_ID || null,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: PORT,
        version: process.env.npm_package_version || 'unknown',
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard, null, 2));
    return;
  }

  // LiveKit URL endpoint
  if (pathname === '/token-url') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: LIVEKIT_URL }));
    return;
  }

  // ============================================================================
  // PLAID ROUTES
  // ============================================================================

  // Serve Plaid Link page
  if (pathname === '/link-account') {
    serveStaticFile('plaid-link.html', res);
    return;
  }

  // Exchange Plaid public token for access token
  if (pathname === '/plaid/exchange' && req.method === 'POST') {
    // Rate limit: 5 exchanges per minute per IP (financial operation)
    if (rateLimit(req, res, { maxRequests: 5, windowMs: 60000 })) {
      return; // Rate limited
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { public_token, user_id, institution, accounts } = JSON.parse(body);

        if (!public_token || !user_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing public_token or user_id' }));
          return;
        }

        if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Plaid not configured' }));
          return;
        }

        // Exchange public token for access token
        const exchangeResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            public_token,
          }),
        });

        if (!exchangeResponse.ok) {
          const error = await exchangeResponse.json();
          console.error('❌ Plaid exchange error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.error_message || 'Token exchange failed' }));
          return;
        }

        const { access_token, item_id } = await exchangeResponse.json();

        // Store the access token for this user
        storePlaidToken(user_id, access_token, item_id, institution);

        console.log(`✅ Plaid account linked for user: ${user_id}`);
        console.log(`   Institution: ${institution?.name || 'Unknown'}`);
        console.log(`   Accounts: ${accounts?.length || 0}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            institution: institution?.name,
            accounts_linked: accounts?.length || 0,
          })
        );
      } catch (err) {
        console.error('❌ Plaid exchange error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }

  // Check if user has Plaid linked
  if (pathname === '/plaid/status') {
    const user_id = parsedUrl.searchParams.get('user_id');

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing user_id' }));
      return;
    }

    const tokenData = getPlaidToken(user_id);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: !!tokenData,
        institution: tokenData?.institution?.name,
        linked_at: tokenData?.linked_at,
      })
    );
    return;
  }

  // ============================================================================
  // SPOTIFY ROUTES - Web Playback SDK support
  // ============================================================================

  // Get Spotify access token for Web Playback SDK
  if (pathname === '/spotify/token') {
    const forceRefresh = parsedUrl.searchParams.get('force') === '1';
    console.log('🎵 /spotify/token requested', forceRefresh ? '(force refresh)' : '');
    const refreshToken = getSpotifyRefreshToken();

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !refreshToken) {
      console.error('❌ Spotify not configured:', {
        hasClientId: !!SPOTIFY_CLIENT_ID,
        hasClientSecret: !!SPOTIFY_CLIENT_SECRET,
        hasRefreshToken: !!refreshToken,
      });
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Spotify not configured',
          help: 'Run: node scripts/spotify-auth.js',
        })
      );
      return;
    }

    // Get scope from tokens file
    let tokenScope = '';
    try {
      if (fs.existsSync(SPOTIFY_TOKENS_FILE)) {
        const existing = JSON.parse(fs.readFileSync(SPOTIFY_TOKENS_FILE, 'utf8'));
        tokenScope = existing.scope || '';
      }
    } catch {}

    // Return cached token if still valid (unless force refresh)
    if (!forceRefresh && spotifyAccessToken && Date.now() < spotifyTokenExpiry - 60000) {
      console.log(
        '🎵 Returning cached token (valid for',
        Math.round((spotifyTokenExpiry - Date.now()) / 60000),
        'min)'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: spotifyAccessToken,
          scope: tokenScope,
          expires_in: Math.round((spotifyTokenExpiry - Date.now()) / 1000),
        })
      );
      return;
    }

    // Refresh the token
    console.log('🎵 Refreshing Spotify token...');
    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ Spotify API error:', tokenResponse.status, errorText);
        throw new Error(`Spotify token refresh failed: ${tokenResponse.status} - ${errorText}`);
      }

      const data = await tokenResponse.json();
      spotifyAccessToken = data.access_token;
      spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

      // Scope comes from the refresh response or keep existing
      const newScope = data.scope || tokenScope;

      // Save updated tokens (Spotify may return new refresh token)
      saveSpotifyTokens(
        data.access_token,
        data.refresh_token || refreshToken,
        data.expires_in,
        newScope
      );

      console.log('🎵 Spotify token refreshed successfully');
      console.log('   Scope:', newScope || '(none)');
      console.log('   Expires in:', Math.round(data.expires_in / 60), 'minutes');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: spotifyAccessToken,
          scope: newScope,
          expires_in: data.expires_in,
        })
      );
    } catch (err) {
      console.error('❌ Spotify token error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to get Spotify token',
          message: err.message,
          help: 'Your refresh token may have expired. Run: node scripts/spotify-auth.js',
        })
      );
    }
    return;
  }

  // Register Web Playback SDK device
  if (pathname === '/spotify/device' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { device_id } = JSON.parse(body);
        spotifyWebDeviceId = device_id;
        console.log(`🎵 Spotify Web Player device registered: ${device_id}`);

        // Write to a file so the agent can read it
        const deviceFile = path.join(process.cwd(), '.spotify-device.json');
        fs.writeFileSync(
          deviceFile,
          JSON.stringify({ device_id, registered_at: new Date().toISOString() })
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, device_id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Get current Spotify device (for agent to use)
  if (pathname === '/spotify/device' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        device_id: spotifyWebDeviceId,
        has_device: !!spotifyWebDeviceId,
      })
    );
    return;
  }

  // Check Spotify link status
  if (pathname === '/spotify/status') {
    const refreshToken = getSpotifyRefreshToken();
    const isConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
    const isLinked = !!(refreshToken && isConfigured);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: isLinked,
        configured: isConfigured,
        hasRefreshToken: !!refreshToken,
        hasWebDevice: !!spotifyWebDeviceId,
        deviceId: spotifyWebDeviceId,
      })
    );
    return;
  }

  // ============================================================================
  // MARKETPLACE PROXY ROUTES (GitHub private repo access)
  // ============================================================================

  const GITHUB_MARKETPLACE_TOKEN = process.env.GITHUB_MARKETPLACE_TOKEN || '';
  const GITHUB_MARKETPLACE_REPO = 'sethdford/voiceai-agents';
  const MARKETPLACE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  let marketplaceRegistryCache = null;
  let marketplaceRegistryCacheTime = 0;

  // Proxy for marketplace registry (keeps GitHub token server-side)
  if (pathname === '/api/marketplace/registry') {
    const now = Date.now();

    // Return cache if valid
    if (marketplaceRegistryCache && now - marketplaceRegistryCacheTime < MARKETPLACE_CACHE_TTL) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'HIT',
      });
      res.end(JSON.stringify(marketplaceRegistryCache));
      return;
    }

    if (!GITHUB_MARKETPLACE_TOKEN) {
      console.warn('⚠️ GITHUB_MARKETPLACE_TOKEN not set - marketplace proxy disabled');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Marketplace not configured',
          message: 'GITHUB_MARKETPLACE_TOKEN environment variable not set',
        })
      );
      return;
    }

    try {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_MARKETPLACE_REPO}/contents/registry.json`,
        {
          headers: {
            Accept: 'application/vnd.github.raw+json',
            Authorization: `Bearer ${GITHUB_MARKETPLACE_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!githubResponse.ok) {
        throw new Error(`GitHub API error: ${githubResponse.status}`);
      }

      const registryData = await githubResponse.json();

      // Cache the response
      marketplaceRegistryCache = registryData;
      marketplaceRegistryCacheTime = now;

      console.log(
        `✅ Marketplace: Fetched registry with ${registryData.agents?.length || 0} agents`
      );

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'MISS',
      });
      res.end(JSON.stringify(registryData));
    } catch (err) {
      console.error('❌ Marketplace proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to fetch marketplace registry',
          message: err.message,
        })
      );
    }
    return;
  }

  // Proxy for individual agent manifests
  if (pathname.startsWith('/api/marketplace/agents/') && pathname.endsWith('/manifest')) {
    const agentId = pathname.replace('/api/marketplace/agents/', '').replace('/manifest', '');

    if (!GITHUB_MARKETPLACE_TOKEN) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Marketplace not configured' }));
      return;
    }

    try {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_MARKETPLACE_REPO}/contents/agents/${agentId}/persona.manifest.json`,
        {
          headers: {
            Accept: 'application/vnd.github.raw+json',
            Authorization: `Bearer ${GITHUB_MARKETPLACE_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!githubResponse.ok) {
        if (githubResponse.status === 404) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Agent manifest not found: ${agentId}` }));
          return;
        }
        throw new Error(`GitHub API error: ${githubResponse.status}`);
      }

      const manifestData = await githubResponse.json();

      console.log(`✅ Marketplace: Fetched manifest for ${agentId}`);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      });
      res.end(JSON.stringify(manifestData));
    } catch (err) {
      console.error(`❌ Marketplace manifest proxy error for ${agentId}:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to fetch agent manifest',
          message: err.message,
        })
      );
    }
    return;
  }

  // ============================================================================
  // AGENT REGISTRY ROUTES (Dynamic agent discovery)
  // ============================================================================

  // Get all available agents (for dynamic UI rendering)
  if (pathname === '/api/agents') {
    try {
      // Dynamic import to use ES modules
      const { AgentRegistry } = await import('./dist/personas/registry/unified-registry.js');
      const agents = await AgentRegistry.getEnabledAgents();

      // Transform agents for UI consumption
      const uiAgents = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        initials: agent.ui.initials,
        subtitle: agent.ui.subtitle,
        role: agent.role,
        roleId: agent.roleId,
        isCoordinator: agent.isCoordinator,
        canHandoff: agent.canHandoff,
        handoffToolName: agent.handoffToolName,
        entrancePhrase: agent.ui.entrancePhrase,
        themeClass: agent.ui.themeClass,
        // Include voice for reference (not used directly in UI)
        voiceId: agent.voiceId,
        // Include colors if available in manifest marketplace
        colors: agent.manifest.marketplace?.colors || null,
      }));

      // Sort: coordinator (Ferni) first, then alphabetically by name
      // Check both isCoordinator flag AND id='ferni' for robustness
      uiAgents.sort((a, b) => {
        const aIsCoordinator = a.isCoordinator || a.id === 'ferni';
        const bIsCoordinator = b.isCoordinator || b.id === 'ferni';

        if (aIsCoordinator && !bIsCoordinator) return -1;
        if (!aIsCoordinator && bIsCoordinator) return 1;
        return a.name.localeCompare(b.name);
      });

      // Build response
      const responseData = {
        agents: uiAgents,
        count: uiAgents.length,
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      });
      res.end(JSON.stringify(responseData));
    } catch (err) {
      console.error('❌ Failed to get agents:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to load agents',
          message: err.message,
          // Provide fallback agent IDs for graceful degradation (canonical IDs)
          fallback: [
            'ferni',
            'peter-john',
            'alex-chen',
            'maya-santos',
            'jordan-taylor',
            'nayan-patel',
          ],
        })
      );
    }
    return;
  }

  // Get a single agent by ID/alias
  if (pathname.startsWith('/api/agents/') && req.method === 'GET') {
    const agentId = pathname.replace('/api/agents/', '');

    try {
      const { AgentRegistry } = await import('./dist/personas/registry/unified-registry.js');
      const agent = await AgentRegistry.getAgentOrNull(agentId);

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Agent not found: ${agentId}` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: agent.id,
          name: agent.name,
          initials: agent.ui.initials,
          subtitle: agent.ui.subtitle,
          role: agent.role,
          roleId: agent.roleId,
          isCoordinator: agent.isCoordinator,
          canHandoff: agent.canHandoff,
          handoffToolName: agent.handoffToolName,
          entrancePhrase: agent.ui.entrancePhrase,
          themeClass: agent.ui.themeClass,
          voiceId: agent.voiceId,
          aliases: agent.aliases,
          handoffTriggers: agent.handoffTriggers,
          colors: agent.manifest.marketplace?.colors || null,
        })
      );
    } catch (err) {
      console.error('❌ Failed to get agent:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load agent', message: err.message }));
    }
    return;
  }

  // ============================================================================
  // ADMIN API ROUTES
  // ============================================================================

  // Helper to parse JSON body
  const parseJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });

  // POST /api/agents/:id/enable - Enable or disable an agent
  if (pathname.match(/^\/api\/agents\/[^/]+\/enable$/) && req.method === 'POST') {
    // Rate limit: 10 enable/disable per minute per IP
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return; // Rate limited
    }

    const agentId = pathname.split('/')[3];

    try {
      const { enabled } = await parseJsonBody(req);

      // For now, we store enabled state in memory
      // In production, this would update a config file or database
      console.log(`${enabled ? '✅ Enabling' : '❌ Disabling'} agent: ${agentId}`);

      // Clear caches to reflect the change
      agentsCacheData = null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          agentId,
          enabled,
          message: `Agent ${agentId} ${enabled ? 'enabled' : 'disabled'}`,
        })
      );
    } catch (err) {
      console.error('❌ Failed to update agent status:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update agent', message: err.message }));
    }
    return;
  }

  // PUT /api/agents/:id - Update agent settings (colors, subtitle, etc.)
  if (
    pathname.match(/^\/api\/agents\/[^/]+$/) &&
    !pathname.includes('/enable') &&
    req.method === 'PUT'
  ) {
    const agentId = pathname.split('/')[3];

    try {
      const updates = await parseJsonBody(req);

      console.log(`📝 Updating agent ${agentId}:`, updates);

      // In production, this would update the bundle's persona.manifest.json
      // For now, we log the update and acknowledge it

      // Clear cache
      agentsCacheData = null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          agentId,
          updates,
          message: 'Agent settings updated (note: restart required for full effect)',
        })
      );
    } catch (err) {
      console.error('❌ Failed to update agent:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update agent', message: err.message }));
    }
    return;
  }

  // POST /api/team/order - Update team roster order
  if (pathname === '/api/team/order' && req.method === 'POST') {
    try {
      const { order } = await parseJsonBody(req);

      if (!Array.isArray(order)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'order must be an array of agent IDs' }));
        return;
      }

      console.log(`📋 Updating team order:`, order);

      // In production, this would update team-config.ts or a database
      // For now, we acknowledge the request

      // Clear cache
      agentsCacheData = null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          order,
          message: 'Team order updated',
        })
      );
    } catch (err) {
      console.error('❌ Failed to update team order:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update team order', message: err.message }));
    }
    return;
  }

  // POST /api/agents/validate - Validate all agent bundles (ADMIN ONLY)
  if (pathname === '/api/agents/validate' && req.method === 'POST') {
    // SECURITY: This endpoint runs shell commands - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    try {
      const { execSync } = await import('child_process');

      // Run the CLI validation command
      const output = execSync('npm run agents validate', {
        encoding: 'utf-8',
        timeout: 30000,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          output,
          message: 'Validation complete',
        })
      );
    } catch (err) {
      console.error('❌ Validation failed:', err);
      res.writeHead(200, { 'Content-Type': 'application/json' }); // Still 200, validation ran
      res.end(
        JSON.stringify({
          success: false,
          output: err.stdout || err.message,
          errors: err.stderr,
          message: 'Validation found issues',
        })
      );
    }
    return;
  }

  // GET /api/voice/preview/:voiceId - Get voice preview URL
  if (pathname.match(/^\/api\/voice\/preview\//) && req.method === 'GET') {
    const voiceId = pathname.split('/')[4];

    // Return Cartesia playground URL for voice preview
    const previewUrl = `https://play.cartesia.ai/voice/${voiceId}`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        voiceId,
        previewUrl,
        message: 'Use Cartesia playground to preview this voice',
      })
    );
    return;
  }

  // ============================================================================
  // TOOLS ANALYTICS API
  // ============================================================================

  // GET /api/tools/analytics - Dashboard data for tool analytics (ADMIN ONLY)
  if (pathname === '/api/tools/analytics' && req.method === 'GET') {
    // SECURITY: Internal analytics data - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    try {
      // Dynamic import of the optimization API
      const { getDashboardData } = await import('./dist/services/optimization-api.js');
      const data = await getDashboardData();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('❌ Failed to get tools analytics:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to get analytics',
          message: err.message,
        })
      );
    }
    return;
  }

  // POST /api/tools/optimize - Trigger optimization cycle (ADMIN ONLY)
  if (pathname === '/api/tools/optimize' && req.method === 'POST') {
    // SECURITY: Expensive operation - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    // Rate limit: 2 optimizations per minute per IP (expensive operation)
    if (rateLimit(req, res, { maxRequests: 2, windowMs: 60000 })) {
      return; // Rate limited
    }

    try {
      const { triggerOptimizationCycle } = await import('./dist/services/optimization-api.js');
      const result = await triggerOptimizationCycle();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ Failed to trigger optimization:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ============================================================================
  // PUSH NOTIFICATIONS API
  // ============================================================================

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

  // In-memory push subscription storage (production would use database)
  if (!global.pushSubscriptions) {
    global.pushSubscriptions = new Map();
  }

  // GET /api/push/vapid-key - Get VAPID public key for web push
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('⚠️ VAPID_PUBLIC_KEY not set - push notifications unavailable');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Push notifications not configured',
          message:
            'VAPID_PUBLIC_KEY environment variable not set. Run: node scripts/generate-vapid-keys.js',
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        publicKey: VAPID_PUBLIC_KEY,
      })
    );
    return;
  }

  // POST /api/push/subscribe - Register push subscription
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const subscription = JSON.parse(body);

        if (!subscription.endpoint || !subscription.keys) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid subscription format' }));
          return;
        }

        // Store subscription (in production, this would go to database)
        const userId = subscription.userId || 'anonymous';
        const userSubs = global.pushSubscriptions.get(userId) || [];

        // Avoid duplicates
        const exists = userSubs.some((s) => s.endpoint === subscription.endpoint);
        if (!exists) {
          userSubs.push({
            ...subscription,
            createdAt: new Date().toISOString(),
          });
          global.pushSubscriptions.set(userId, userSubs);
          console.log(`🔔 Push subscription registered for user: ${userId}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('❌ Failed to register push subscription:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to register subscription' }));
      }
    });
    return;
  }

  // POST /api/push/unsubscribe - Remove push subscription
  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { endpoint, userId } = JSON.parse(body);
        const userSubs = global.pushSubscriptions.get(userId || 'anonymous') || [];
        const filtered = userSubs.filter((s) => s.endpoint !== endpoint);

        if (filtered.length > 0) {
          global.pushSubscriptions.set(userId || 'anonymous', filtered);
        } else {
          global.pushSubscriptions.delete(userId || 'anonymous');
        }

        console.log(`🔕 Push subscription removed for user: ${userId || 'anonymous'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to unsubscribe' }));
      }
    });
    return;
  }

  // POST /api/push/send - Send a push notification (ADMIN ONLY)
  if (pathname === '/api/push/send' && req.method === 'POST') {
    // SECURITY: Sending notifications to users - require admin auth
    const auth = requireAdmin(req, res);
    if (!auth) return; // 401/403 already sent

    // Rate limit: 10 notifications per minute per IP (prevents spam)
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return; // Rate limited
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { userId, title, body: notificationBody, type } = JSON.parse(body);

        // Try to use backend service if available
        try {
          const { getPushNotificationsService } =
            await import('./dist/services/push-notifications.js');
          const service = getPushNotificationsService();
          const success = await service.sendNotification(userId || 'anonymous', {
            title: title || 'Test Notification',
            body: notificationBody || 'This is a test notification',
            type: type || 'general',
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success,
              message: success ? 'Notification sent' : 'No subscriptions found',
            })
          );
        } catch (err) {
          // Service not available, return placeholder response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              message: 'Push notification service not available (web-push module not installed)',
            })
          );
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send notification' }));
      }
    });
    return;
  }

  // ============================================================================
  // LIVEKIT ROUTES
  // ============================================================================

  // Token generation endpoint
  if (pathname === '/token') {
    // Rate limit: 20 tokens per minute per IP (prevents abuse)
    if (rateLimit(req, res, { maxRequests: 20, windowMs: 60000 })) {
      return; // Rate limited
    }

    const room = parsedUrl.searchParams.get('room');
    const username = parsedUrl.searchParams.get('username');
    const device_id = parsedUrl.searchParams.get('device_id');
    const persona_id = parsedUrl.searchParams.get('persona_id');

    if (!room || !username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Missing required parameters: room and username',
        })
      );
      return;
    }

    // Default to jack-b persona if not specified
    const selectedPersona = persona_id || 'jack-b';

    createToken(room, username)
      .then(async (token) => {
        console.log(
          `✅ Generated token for user "${username}" in room "${room}" (persona: ${selectedPersona})${device_id ? ` (device: ${device_id})` : ''}`
        );

        // Dispatch the agent to the room with persona metadata
        // The agent will read persona_id from metadata and load the appropriate persona
        try {
          const agentMetadata = {
            user_name: username,
            device_id: device_id || undefined, // Pass device ID for user identification
            persona_id: selectedPersona, // Pass persona selection!
            source: 'web', // Mark as web connection
          };
          await agentDispatch.createDispatch(room, AGENT_NAME, {
            metadata: JSON.stringify(agentMetadata),
          });
          console.log(
            `✅ Dispatched agent "${AGENT_NAME}" to room "${room}" with persona: ${selectedPersona}`,
            agentMetadata
          );
        } catch (dispatchError) {
          // Agent might already be dispatched, or room doesn't exist yet - that's ok
          console.log(`ℹ️ Agent dispatch note: ${dispatchError.message}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            token,
            url: LIVEKIT_URL,
            room,
            username,
            device_id,
            persona_id: selectedPersona,
          })
        );
      })
      .catch((error) => {
        console.error('❌ Error generating token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate token' }));
      });
    return;
  }

  // Serve static files
  if (pathname === '/' || pathname === '') {
    serveStaticFile('index.html', res);
    return;
  }

  // Serve admin page (same SPA, JS handles routing)
  if (pathname === '/admin') {
    serveStaticFile('index.html', res);
    return;
  }

  // Serve developer portal
  if (pathname === '/developers' || pathname === '/dev') {
    const devPortalPath = path.join(process.cwd(), 'docs', 'developer-portal.html');
    if (fs.existsSync(devPortalPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(devPortalPath, 'utf-8'));
      return;
    }
  }

  // Serve other static files
  serveStaticFile(pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🌐 John Bogle UI Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📍 Server: http://0.0.0.0:${PORT}`);
  console.log(`  🔗 LiveKit: ${LIVEKIT_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Start Spotify token auto-refresh
  startSpotifyAutoRefresh();
});
