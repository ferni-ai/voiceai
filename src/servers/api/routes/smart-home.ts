/**
 * Smart Home Unified API Routes
 *
 * Provides unified endpoints for all smart home integrations:
 * - Philips Hue (direct bridge connection)
 * - LIFX (cloud API)
 * - Sonos (cloud OAuth)
 *
 * Note: Ecobee has its own routes in ecobee.ts
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getAdminFirestore } from '../../../utils/firebase-admin-app.js';
import { verifyFirebaseToken, isVerifiedToken } from '../../../services/identity/firebase-auth.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { sealTokens } from '../../../utils/token-at-rest.js';
import {
  openSmartHomeCredentials,
  readSmartHomeCredentials,
} from '../../../services/smart-home/user-credentials.js';
import { assertNoEncryptedValues, hueSaveInput, lifxSaveInput } from './smart-home-guards.js';
import { HUE_NEEDS_REMOTE_ACCESS } from '../../../services/smart-home/hue-remote-access.js';
import { createManagedInterval, type ManagedInterval } from '../../../utils/managed-interval.js';
import { getVerifiedUserId as getUserId } from '../request-identity.js';

const log = createLogger({ module: 'smart-home-routes' });

// Log configuration status on module load
const SMART_HOME_CONFIG = {
  sonos: !!process.env.SONOS_CLIENT_ID && !!process.env.SONOS_CLIENT_SECRET,
};

if (!SMART_HOME_CONFIG.sonos) {
  log.info('Sonos integration not configured (set SONOS_CLIENT_ID and SONOS_CLIENT_SECRET)');
}

// ============================================================================
// TYPES
// ============================================================================

interface HueCredentials {
  bridgeIp: string;
  username: string;
}

interface LifxCredentials {
  token: string;
}

interface SonosCredentials {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: number;
  householdId?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getQueryParam(url: URL, key: string): string | null {
  return url.searchParams.get(key);
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

/** The caller verified at the door, never a userId from the query or body; 401 without one. */
function requireCaller(req: IncomingMessage, res: ServerResponse): string | null {
  const userId = getUserId(req);
  if (!userId) sendError(res, 401, 'Authentication required');
  return userId;
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getSmartHomeCollection() {
  return getAdminFirestore().collection('bogle_users');
}

export async function getCredentials<T>(userId: string, integration: string): Promise<T | null> {
  try {
    return await readSmartHomeCredentials<T>(userId, integration);
  } catch (error) {
    log.error({ error, userId, integration }, 'Failed to get credentials');
    return null;
  }
}

export async function saveCredentials<T extends object>(
  userId: string,
  integration: string,
  credentials: T
): Promise<void> {
  try {
    assertNoEncryptedValues(credentials); // never seal (or later decrypt) a submitted enc_ value
    // Fail closed: a read error throws here, so the set below never replaces a record we could not read.
    const existing =
      (await readSmartHomeCredentials<Record<string, unknown>>(userId, integration)) ?? {};
    const ref = getSmartHomeCollection().doc(userId).collection('smart_home').doc(integration);
    await ref.set(sealTokens({ ...existing, ...credentials })); // replaced whole: no plaintext left
  } catch (error) {
    log.error({ error, userId, integration }, 'Failed to save credentials');
    throw error;
  }
}

async function deleteCredentials(userId: string, integration: string): Promise<void> {
  try {
    await getSmartHomeCollection().doc(userId).collection('smart_home').doc(integration).delete();
  } catch (error) {
    log.error({ error, userId, integration }, 'Failed to delete credentials');
    throw error;
  }
}

// ============================================================================
// PHILIPS HUE HANDLERS
// ============================================================================

async function handleHueStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    const credentials = await getCredentials<HueCredentials>(userId, 'hue');

    // No server-side call to the bridge: it is on the home LAN (see hue-remote-access).
    if (!credentials?.username) {
      sendJson(res, 200, { connected: false });
      return;
    }
    sendJson(res, 200, {
      connected: false,
      saved: true,
      needsRemoteAccess: true,
      message: HUE_NEEDS_REMOTE_ACCESS,
    });
  } catch (error) {
    log.error({ error, userId }, 'Hue status check failed');
    sendJson(res, 200, { connected: false, error: 'Failed to check status' });
  }
}

async function handleHueSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const input = hueSaveInput(getUserId(req), await parseBody(req));
    if ('error' in input) {
      sendError(res, input.status, input.error);
      return;
    }
    await saveCredentials(input.userId, 'hue', {
      bridgeIp: input.bridgeIp,
      username: input.username,
    });
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error }, 'Hue save failed');
    sendError(res, 500, 'Failed to save credentials');
  }
}

async function handleHueDisconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    await deleteCredentials(userId, 'hue');
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error, userId }, 'Hue disconnect failed');
    sendError(res, 500, 'Failed to disconnect');
  }
}

// ============================================================================
// LIFX HANDLERS
// ============================================================================

async function handleLifxStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    const credentials = await getCredentials<LifxCredentials>(userId, 'lifx');

    if (!credentials?.token) {
      sendJson(res, 200, { connected: false });
      return;
    }

    // Try to get lights
    const response = await fetch('https://api.lifx.com/v1/lights/all', {
      headers: { Authorization: `Bearer ${credentials.token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendJson(res, 200, { connected: false, error: 'Token invalid' });
      } else {
        sendJson(res, 200, { connected: false, error: 'API error' });
      }
      return;
    }

    const lights = (await response.json()) as Array<{ label: string; power: string }>;

    sendJson(res, 200, {
      connected: true,
      lightCount: lights.length,
      lights: lights.slice(0, 5).map((l) => ({ name: l.label, power: l.power })),
    });
  } catch (error) {
    log.error({ error, userId }, 'LIFX status check failed');
    sendJson(res, 200, { connected: false, error: 'Failed to check status' });
  }
}

async function handleLifxSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const input = lifxSaveInput(getUserId(req), await parseBody(req));
    if ('error' in input) {
      sendError(res, input.status, input.error);
      return;
    }
    await saveCredentials(input.userId, 'lifx', { token: input.token });
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error }, 'LIFX save failed');
    sendError(res, 500, 'Failed to save credentials');
  }
}

async function handleLifxDisconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    await deleteCredentials(userId, 'lifx');
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error, userId }, 'LIFX disconnect failed');
    sendError(res, 500, 'Failed to disconnect');
  }
}

// ============================================================================
// SONOS HANDLERS
// ============================================================================

// Sonos OAuth configuration
const SONOS_CLIENT_ID = process.env.SONOS_CLIENT_ID || '';
const SONOS_CLIENT_SECRET = process.env.SONOS_CLIENT_SECRET || '';
const SONOS_REDIRECT_URI =
  process.env.SONOS_REDIRECT_URI || 'https://app.ferni.ai/api/smart-home/sonos/callback';

// OAuth state storage (in-memory, for CSRF protection)
// In production, use Redis or Firestore
const pendingOAuthStates = new Map<string, { userId: string; createdAt: number }>();
const OAUTH_STATE_TTL = 10 * 60 * 1000; // 10 minutes

// Clean up old OAuth states periodically
const oauthStateCleanupInterval: ManagedInterval = createManagedInterval(
  () => {
    const now = Date.now();
    for (const [state, data] of pendingOAuthStates) {
      if (now - data.createdAt > OAUTH_STATE_TTL) {
        pendingOAuthStates.delete(state);
      }
    }
  },
  60000,
  { unref: true, label: 'smart-home-oauth-cleanup' }
);

/** Clean up the OAuth state interval (for graceful shutdown) */
export function cleanupSmartHomeIntervals(): void {
  oauthStateCleanupInterval.dispose();
}

/**
 * Refresh Sonos access token using refresh token
 */
async function refreshSonosToken(
  userId: string,
  refreshToken: string
): Promise<SonosCredentials | null> {
  if (!SONOS_CLIENT_ID || !SONOS_CLIENT_SECRET) {
    log.error('Sonos not configured for token refresh');
    return null;
  }

  try {
    const response = await fetch('https://api.sonos.com/login/v3/oauth/access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SONOS_CLIENT_ID}:${SONOS_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      log.error({ status: response.status }, 'Sonos token refresh failed');
      return null;
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const newCredentials: SonosCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: Date.now() + tokens.expires_in * 1000,
    };

    // Save the new tokens
    await saveCredentials(userId, 'sonos', newCredentials);
    log.info({ userId }, 'Sonos token refreshed successfully');

    return newCredentials;
  } catch (error) {
    log.error({ error, userId }, 'Sonos token refresh error');
    return null;
  }
}

/**
 * Get valid Sonos credentials, refreshing if needed
 */
async function getValidSonosCredentials(userId: string): Promise<SonosCredentials | null> {
  const credentials = await getCredentials<SonosCredentials>(userId, 'sonos');

  if (!credentials?.accessToken) {
    return null;
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const now = Date.now();
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes

  if (credentials.tokenExpiry && credentials.tokenExpiry - now < expiryBuffer) {
    // Token expired or about to expire, try to refresh
    if (credentials.refreshToken) {
      const newCredentials = await refreshSonosToken(userId, credentials.refreshToken);
      if (newCredentials) {
        return newCredentials;
      }
    }
    // Refresh failed, credentials are invalid
    return null;
  }

  return credentials;
}

async function handleSonosStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    // Use getValidSonosCredentials which handles token refresh
    const credentials = await getValidSonosCredentials(userId);

    if (!credentials?.accessToken) {
      sendJson(res, 200, { connected: false });
      return;
    }

    // Test connection by getting households
    const response = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token invalid even after refresh attempt - clear credentials
        log.warn({ userId }, 'Sonos token invalid, clearing credentials');
        await deleteCredentials(userId, 'sonos');
        sendJson(res, 200, { connected: false, error: 'Session expired, please reconnect' });
      } else {
        sendJson(res, 200, { connected: false, error: 'API error' });
      }
      return;
    }

    const data = (await response.json()) as { households: Array<{ id: string }> };

    // Get groups to count speakers
    let speakerCount = 0;
    let primaryGroup = 'Idle';

    if (data.households.length > 0) {
      const groupsRes = await fetch(
        `https://api.ws.sonos.com/control/api/v1/households/${encodeURIComponent(data.households[0].id)}/groups`,
        {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (groupsRes.ok) {
        const groupsData = (await groupsRes.json()) as {
          groups: Array<{ name: string; playbackState: string }>;
          players: Array<{ id: string }>;
        };
        speakerCount = groupsData.players?.length || 0;

        const playingGroup = groupsData.groups?.find((g) => g.playbackState === 'playing');
        primaryGroup = playingGroup?.name || groupsData.groups?.[0]?.name || 'Idle';
      }
    }

    sendJson(res, 200, {
      connected: true,
      speakerCount,
      households: data.households.length,
      primaryGroup,
    });
  } catch (error) {
    log.error({ error, userId }, 'Sonos status check failed');
    sendJson(res, 200, { connected: false, error: 'Failed to check status' });
  }
}

async function handleSonosAuthUrl(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // The account to link is the verified caller, never a userId in the body.
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, 401, 'Sign in required');
      return;
    }

    if (!SONOS_CLIENT_ID) {
      sendError(
        res,
        500,
        'Sonos not configured. Please set SONOS_CLIENT_ID and SONOS_CLIENT_SECRET environment variables.'
      );
      return;
    }

    // Generate secure random state for CSRF protection
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const state = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    // Store state server-side with userId
    pendingOAuthStates.set(state, { userId, createdAt: Date.now() });

    const authUrl = new URL('https://api.sonos.com/login/v3/oauth');
    authUrl.searchParams.set('client_id', SONOS_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SONOS_REDIRECT_URI);
    authUrl.searchParams.set('scope', 'playback-control-all');
    authUrl.searchParams.set('state', state);

    sendJson(res, 200, { authUrl: authUrl.toString() });
  } catch (error) {
    log.error({ error }, 'Sonos auth URL generation failed');
    sendError(res, 500, 'Failed to generate auth URL');
  }
}

async function handleSonosCallback(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const code = getQueryParam(parsedUrl, 'code');
  const state = getQueryParam(parsedUrl, 'state');
  const error = getQueryParam(parsedUrl, 'error');

  if (error) {
    log.error({ error }, 'Sonos OAuth error');
    res.writeHead(302, { Location: '/settings?smart_home=error&integration=sonos' });
    res.end();
    return;
  }

  if (!code || !state) {
    sendError(res, 400, 'Missing code or state');
    return;
  }

  try {
    // Validate state server-side (CSRF protection)
    const stateData = pendingOAuthStates.get(state);

    if (!stateData) {
      log.warn({ state }, 'Invalid or expired OAuth state');
      res.writeHead(302, {
        Location: '/settings?smart_home=error&integration=sonos&reason=invalid_state',
      });
      res.end();
      return;
    }

    // Remove used state
    pendingOAuthStates.delete(state);
    const userId = stateData.userId;

    // Exchange code for tokens
    const tokenRes = await fetch('https://api.sonos.com/login/v3/oauth/access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SONOS_CLIENT_ID}:${SONOS_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SONOS_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Save credentials
    await saveCredentials<SonosCredentials>(userId, 'sonos', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: Date.now() + tokens.expires_in * 1000,
    });

    // Redirect back to app
    res.writeHead(302, { Location: '/settings?smart_home=success&integration=sonos' });
    res.end();
  } catch (err) {
    log.error({ error: err }, 'Sonos callback failed');
    res.writeHead(302, { Location: '/settings?smart_home=error&integration=sonos' });
    res.end();
  }
}

async function handleSonosDisconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = requireCaller(req, res);
  if (!userId) return;

  try {
    await deleteCredentials(userId, 'sonos');
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error, userId }, 'Sonos disconnect failed');
    sendError(res, 500, 'Failed to disconnect');
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleSmartHomeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  const allowedOrigins = [
    'https://app.ferni.ai',
    'https://ferni.ai',
    'https://ferni-prod.web.app',
    'http://localhost:3004',
    'http://localhost:3002',
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // =========================================================================
  // HUE ROUTES
  // =========================================================================

  // GET /api/smart-home/hue/status
  if (pathname === '/api/smart-home/hue/status' && req.method === 'GET') {
    await handleHueStatus(req, res);
    return true;
  }

  // POST /api/smart-home/hue/save
  if (pathname === '/api/smart-home/hue/save' && req.method === 'POST') {
    await handleHueSave(req, res);
    return true;
  }

  // DELETE /api/smart-home/hue/disconnect
  if (pathname === '/api/smart-home/hue/disconnect' && req.method === 'DELETE') {
    await handleHueDisconnect(req, res);
    return true;
  }

  // =========================================================================
  // LIFX ROUTES
  // =========================================================================

  // GET /api/smart-home/lifx/status
  if (pathname === '/api/smart-home/lifx/status' && req.method === 'GET') {
    await handleLifxStatus(req, res);
    return true;
  }

  // POST /api/smart-home/lifx/save
  if (pathname === '/api/smart-home/lifx/save' && req.method === 'POST') {
    await handleLifxSave(req, res);
    return true;
  }

  // DELETE /api/smart-home/lifx/disconnect
  if (pathname === '/api/smart-home/lifx/disconnect' && req.method === 'DELETE') {
    await handleLifxDisconnect(req, res);
    return true;
  }

  // =========================================================================
  // SONOS ROUTES
  // =========================================================================

  // GET /api/smart-home/sonos/status
  if (pathname === '/api/smart-home/sonos/status' && req.method === 'GET') {
    await handleSonosStatus(req, res);
    return true;
  }

  // POST /api/smart-home/sonos/auth-url
  if (pathname === '/api/smart-home/sonos/auth-url' && req.method === 'POST') {
    await handleSonosAuthUrl(req, res);
    return true;
  }

  // GET /api/smart-home/sonos/callback (OAuth redirect)
  if (pathname === '/api/smart-home/sonos/callback' && req.method === 'GET') {
    await handleSonosCallback(req, res, parsedUrl);
    return true;
  }

  // DELETE /api/smart-home/sonos/disconnect
  if (pathname === '/api/smart-home/sonos/disconnect' && req.method === 'DELETE') {
    await handleSonosDisconnect(req, res);
    return true;
  }

  // Not a smart home route
  return false;
}
