/**
 * Smart Home Unified API Routes
 *
 * Provides unified endpoints for all smart home integrations:
 * - Philips Hue (direct bridge connection)
 * - LIFX (cloud API)
 * - Sonos (cloud OAuth)
 * - HomeKit (iOS bridge)
 *
 * Note: Ecobee has its own routes in ecobee.ts
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'smart-home-routes' });

// Log configuration status on module load
const SMART_HOME_CONFIG = {
  sonos: !!process.env.SONOS_CLIENT_ID && !!process.env.SONOS_CLIENT_SECRET,
  homeAssistant: !!process.env.HOME_ASSISTANT_URL && !!process.env.HOME_ASSISTANT_TOKEN,
};

if (!SMART_HOME_CONFIG.sonos) {
  log.info('Sonos integration not configured (set SONOS_CLIENT_ID and SONOS_CLIENT_SECRET)');
}
if (!SMART_HOME_CONFIG.homeAssistant) {
  log.debug('Home Assistant integration not configured (optional)');
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

interface HomeKitConfig {
  enabled: boolean;
  homeName?: string;
  deviceCount?: number;
  sceneCount?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-User-ID header
  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

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
  return getFirestore().collection('bogle_users');
}

async function getCredentials<T>(userId: string, integration: string): Promise<T | null> {
  try {
    const doc = await getSmartHomeCollection()
      .doc(userId)
      .collection('smart_home')
      .doc(integration)
      .get();

    if (!doc.exists) return null;
    return doc.data() as T;
  } catch (error) {
    log.error({ error, userId, integration }, 'Failed to get credentials');
    return null;
  }
}

async function saveCredentials<T extends object>(
  userId: string,
  integration: string,
  credentials: T
): Promise<void> {
  try {
    await getSmartHomeCollection()
      .doc(userId)
      .collection('smart_home')
      .doc(integration)
      .set(credentials, { merge: true });
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

async function handleHueStatus(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

  try {
    const credentials = await getCredentials<HueCredentials>(userId, 'hue');

    if (!credentials?.bridgeIp || !credentials?.username) {
      sendJson(res, 200, { connected: false });
      return;
    }

    // Try to get lights
    const response = await fetch(
      `http://${credentials.bridgeIp}/api/${credentials.username}/lights`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      sendJson(res, 200, { connected: false, error: 'Bridge not reachable' });
      return;
    }

    const lights = (await response.json()) as Record<
      string,
      { name: string; state: { on: boolean } }
    >;
    const lightList = Object.entries(lights).map(([_id, light]) => ({
      name: light.name,
      on: light.state.on,
    }));

    sendJson(res, 200, {
      connected: true,
      bridgeIp: credentials.bridgeIp,
      lightCount: lightList.length,
      lights: lightList.slice(0, 5),
    });
  } catch (error) {
    log.error({ error, userId }, 'Hue status check failed');
    sendJson(res, 200, { connected: false, error: 'Failed to check status' });
  }
}

async function handleHueSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await parseBody(req);
    const { userId, bridgeIp, username } = body as {
      userId: string;
      bridgeIp: string;
      username: string;
    };

    if (!userId || !bridgeIp || !username) {
      sendError(res, 400, 'userId, bridgeIp, and username required');
      return;
    }

    await saveCredentials(userId, 'hue', { bridgeIp, username });
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error }, 'Hue save failed');
    sendError(res, 500, 'Failed to save credentials');
  }
}

async function handleHueDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

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

async function handleLifxStatus(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

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
    const body = await parseBody(req);
    const { userId, token } = body as { userId: string; token: string };

    if (!userId || !token) {
      sendError(res, 400, 'userId and token required');
      return;
    }

    await saveCredentials(userId, 'lifx', { token });
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error }, 'LIFX save failed');
    sendError(res, 500, 'Failed to save credentials');
  }
}

async function handleLifxDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

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
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingOAuthStates) {
    if (now - data.createdAt > OAUTH_STATE_TTL) {
      pendingOAuthStates.delete(state);
    }
  }
}, 60000); // Every minute

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

async function handleSonosStatus(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

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
        `https://api.ws.sonos.com/control/api/v1/households/${data.households[0].id}/groups`,
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
    const body = await parseBody(req);
    const { userId } = body as { userId: string };

    if (!userId) {
      sendError(res, 400, 'userId required');
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

async function handleSonosDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

  try {
    await deleteCredentials(userId, 'sonos');
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error, userId }, 'Sonos disconnect failed');
    sendError(res, 500, 'Failed to disconnect');
  }
}

// ============================================================================
// HOMEKIT HANDLERS
// ============================================================================

async function handleHomeKitStatus(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

  try {
    // HomeKit state is synced from iOS app
    const config = await getCredentials<HomeKitConfig>(userId, 'homekit');

    if (!config?.enabled) {
      sendJson(res, 200, { connected: false });
      return;
    }

    // Get device/scene counts from the synced data
    const db = getFirestore();
    const devicesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('devices')
      .collection('list')
      .count()
      .get();

    const scenesDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('scenes')
      .get();

    const scenes = scenesDoc.exists ? (scenesDoc.data()?.scenes as unknown[])?.length || 0 : 0;

    sendJson(res, 200, {
      connected: true,
      homeName: config.homeName || 'My Home',
      deviceCount: devicesSnapshot.data().count,
      sceneCount: scenes,
    });
  } catch (error) {
    log.error({ error, userId }, 'HomeKit status check failed');
    sendJson(res, 200, { connected: false, error: 'Failed to check status' });
  }
}

async function handleHomeKitSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // This endpoint is called by iOS app to sync HomeKit data
  // Requires authentication header from iOS app
  try {
    const body = await parseBody(req);
    const { userId, homeData, authToken } = body as {
      userId: string;
      authToken: string;
      homeData: {
        homeName: string;
        devices: unknown[];
        scenes: unknown[];
        rooms: string[];
      };
    };

    if (!userId || !homeData) {
      sendError(res, 400, 'userId and homeData required');
      return;
    }

    // Validate auth token - the iOS app should send the user's Firebase auth token
    // This ensures only the authenticated user can sync their own HomeKit data
    const authHeader = req.headers.authorization;
    if (!authHeader && !authToken) {
      sendError(res, 401, 'Authentication required');
      return;
    }

    const token = authHeader?.replace('Bearer ', '') || authToken;

    // In production, verify the Firebase ID token
    // For now, we'll do a basic check that the token exists
    // TODO: Implement full Firebase token verification
    if (!token || token.length < 10) {
      sendError(res, 401, 'Invalid authentication token');
      return;
    }

    const db = getFirestore();
    const homekitRef = db.collection('bogle_users').doc(userId).collection('homekit');

    // Save config
    await homekitRef.doc('config').set(
      {
        enabled: true,
        homeName: homeData.homeName,
        deviceCount: homeData.devices.length,
        sceneCount: homeData.scenes.length,
        rooms: homeData.rooms,
        lastSync: new Date().toISOString(),
      },
      { merge: true }
    );

    // Save scenes
    await homekitRef.doc('scenes').set(
      {
        scenes: homeData.scenes,
        lastSync: new Date().toISOString(),
      },
      { merge: true }
    );

    // Save devices
    const devicesRef = homekitRef.doc('devices').collection('list');
    const batch = db.batch();

    for (const device of homeData.devices as Array<{ id: string }>) {
      batch.set(devicesRef.doc(device.id), device, { merge: true });
    }

    await batch.commit();

    log.info({ userId, deviceCount: homeData.devices.length }, 'HomeKit data synced');
    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error }, 'HomeKit sync failed');
    sendError(res, 500, 'Failed to sync HomeKit data');
  }
}

/**
 * Get pending HomeKit commands for iOS app to execute
 * Called by iOS app to poll for commands
 */
async function handleHomeKitCommands(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

  // Validate auth - iOS app must be authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'Authentication required');
    return;
  }

  try {
    const db = getFirestore();
    const commandsRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('commands')
      .collection('pending');

    // Get pending commands
    const snapshot = await commandsRef.orderBy('timestamp', 'asc').limit(10).get();

    const commands: Array<{
      id: string;
      deviceId: string;
      action: string;
      value?: unknown;
      timestamp: number;
    }> = [];

    snapshot.forEach((doc) => {
      commands.push({
        id: doc.id,
        ...doc.data(),
      } as (typeof commands)[0]);
    });

    sendJson(res, 200, { commands });
  } catch (error) {
    log.error({ error, userId }, 'HomeKit commands fetch failed');
    sendError(res, 500, 'Failed to get commands');
  }
}

/**
 * Mark HomeKit commands as executed (called by iOS app after execution)
 */
async function handleHomeKitCommandComplete(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await parseBody(req);
    const { userId, commandId, success, error } = body as {
      userId: string;
      commandId: string;
      success: boolean;
      error?: string;
    };

    if (!userId || !commandId) {
      sendError(res, 400, 'userId and commandId required');
      return;
    }

    // Validate auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'Authentication required');
      return;
    }

    const db = getFirestore();
    const commandRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('commands')
      .collection('pending')
      .doc(commandId);

    // Delete the command (or move to history)
    const commandDoc = await commandRef.get();
    if (commandDoc.exists) {
      // Move to history for debugging
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('homekit')
        .doc('commands')
        .collection('history')
        .doc(commandId)
        .set({
          ...commandDoc.data(),
          executedAt: Date.now(),
          success,
          error,
        });

      // Delete from pending
      await commandRef.delete();
    }

    sendJson(res, 200, { success: true });
  } catch (err) {
    log.error({ error: err }, 'HomeKit command complete failed');
    sendError(res, 500, 'Failed to mark command complete');
  }
}

async function handleHomeKitDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req) || getQueryParam(parsedUrl, 'userId');
  if (!userId) {
    sendError(res, 400, 'userId required');
    return;
  }

  try {
    // Delete HomeKit config
    await deleteCredentials(userId, 'homekit');

    // Also delete devices and scenes
    const db = getFirestore();
    const devicesRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('devices')
      .collection('list');

    const devices = await devicesRef.listDocuments();
    const batch = db.batch();
    for (const doc of devices) {
      batch.delete(doc);
    }
    await batch.commit();

    await db.collection('bogle_users').doc(userId).collection('homekit').doc('scenes').delete();

    sendJson(res, 200, { success: true });
  } catch (error) {
    log.error({ error, userId }, 'HomeKit disconnect failed');
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
    await handleHueStatus(req, res, parsedUrl);
    return true;
  }

  // POST /api/smart-home/hue/save
  if (pathname === '/api/smart-home/hue/save' && req.method === 'POST') {
    await handleHueSave(req, res);
    return true;
  }

  // DELETE /api/smart-home/hue/disconnect
  if (pathname === '/api/smart-home/hue/disconnect' && req.method === 'DELETE') {
    await handleHueDisconnect(req, res, parsedUrl);
    return true;
  }

  // =========================================================================
  // LIFX ROUTES
  // =========================================================================

  // GET /api/smart-home/lifx/status
  if (pathname === '/api/smart-home/lifx/status' && req.method === 'GET') {
    await handleLifxStatus(req, res, parsedUrl);
    return true;
  }

  // POST /api/smart-home/lifx/save
  if (pathname === '/api/smart-home/lifx/save' && req.method === 'POST') {
    await handleLifxSave(req, res);
    return true;
  }

  // DELETE /api/smart-home/lifx/disconnect
  if (pathname === '/api/smart-home/lifx/disconnect' && req.method === 'DELETE') {
    await handleLifxDisconnect(req, res, parsedUrl);
    return true;
  }

  // =========================================================================
  // SONOS ROUTES
  // =========================================================================

  // GET /api/smart-home/sonos/status
  if (pathname === '/api/smart-home/sonos/status' && req.method === 'GET') {
    await handleSonosStatus(req, res, parsedUrl);
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
    await handleSonosDisconnect(req, res, parsedUrl);
    return true;
  }

  // =========================================================================
  // HOMEKIT ROUTES
  // =========================================================================

  // GET /api/smart-home/homekit/status
  if (pathname === '/api/smart-home/homekit/status' && req.method === 'GET') {
    await handleHomeKitStatus(req, res, parsedUrl);
    return true;
  }

  // POST /api/smart-home/homekit/sync (called by iOS app)
  if (pathname === '/api/smart-home/homekit/sync' && req.method === 'POST') {
    await handleHomeKitSync(req, res);
    return true;
  }

  // DELETE /api/smart-home/homekit/disconnect
  if (pathname === '/api/smart-home/homekit/disconnect' && req.method === 'DELETE') {
    await handleHomeKitDisconnect(req, res, parsedUrl);
    return true;
  }

  // GET /api/smart-home/homekit/commands (called by iOS app to poll for commands)
  if (pathname === '/api/smart-home/homekit/commands' && req.method === 'GET') {
    await handleHomeKitCommands(req, res, parsedUrl);
    return true;
  }

  // POST /api/smart-home/homekit/command-complete (called by iOS app after executing command)
  if (pathname === '/api/smart-home/homekit/command-complete' && req.method === 'POST') {
    await handleHomeKitCommandComplete(req, res);
    return true;
  }

  // Not a smart home route
  return false;
}
