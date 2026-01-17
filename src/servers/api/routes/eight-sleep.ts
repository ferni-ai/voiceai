/**
 * Eight Sleep API Routes
 *
 * OAuth flow and mattress control endpoints.
 *
 * OAuth Flow:
 * 1. GET /api/eight-sleep/auth/url → Returns authorization URL
 * 2. GET /api/eight-sleep/auth/callback → OAuth callback (handles code exchange)
 * 3. DELETE /api/eight-sleep/disconnect → Disconnect account
 *
 * Status & Control:
 * 4. GET /api/eight-sleep/status → Get connection status and mattress summary
 * 5. GET /api/eight-sleep/sleep/summary → Get sleep summary
 * 6. GET /api/eight-sleep/temperature → Get temperature state
 * 7. PUT /api/eight-sleep/temperature → Set temperature
 * 8. POST /api/eight-sleep/temperature/on → Turn on
 * 9. POST /api/eight-sleep/temperature/off → Turn off
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAuthorizationUrl,
  validateOAuthState,
  exchangeCodeForTokens,
  deleteUserTokens,
  isEightSleepConfigured,
  isApiConfigured,
} from '../../../services/identity/eight-sleep-auth.js';
import {
  getSleepSummary,
  getTemperatureState,
  setTemperature,
  turnOn,
  turnOff,
  getRecentBiometrics,
} from '../../../services/identity/eight-sleep-api.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'eight-sleep-routes' });

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
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

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleEightSleepRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Check if Eight Sleep is configured at app level
  if (!isApiConfigured() && !pathname.endsWith('/configured')) {
    sendError(res, 503, 'Eight Sleep integration is not configured');
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/configured - Check if API is configured
  // ============================================================================
  if (pathname === '/api/eight-sleep/configured' && req.method === 'GET') {
    sendJson(res, 200, { configured: isApiConfigured() });
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/auth/callback - OAuth callback (no auth required)
  // ============================================================================
  if (pathname === '/api/eight-sleep/auth/callback' && req.method === 'GET') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.warn({ error }, 'Eight Sleep OAuth error');
      // Redirect to settings with error
      res.writeHead(302, {
        Location: '/settings?eight-sleep=error&message=' + encodeURIComponent(error),
      });
      res.end();
      return true;
    }

    if (!code || !state) {
      sendError(res, 400, 'Missing code or state parameter');
      return true;
    }

    // Validate state and get user
    const userId = validateOAuthState(state);
    if (!userId) {
      sendError(res, 400, 'Invalid or expired state. Please try again.');
      return true;
    }

    // Exchange code for tokens
    const result = await exchangeCodeForTokens(code, userId);

    if (!result.success) {
      log.error({ error: result.error }, 'Eight Sleep token exchange failed');
      res.writeHead(302, {
        Location:
          '/settings?eight-sleep=error&message=' + encodeURIComponent(result.error || 'Failed'),
      });
      res.end();
      return true;
    }

    log.info({ userId }, 'Eight Sleep connected successfully');
    res.writeHead(302, { Location: '/settings?eight-sleep=success' });
    res.end();
    return true;
  }

  // Require authentication for all other routes
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Authentication required');
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/auth/url - Get authorization URL
  // ============================================================================
  if (pathname === '/api/eight-sleep/auth/url' && req.method === 'GET') {
    log.info({ userId }, 'Generating Eight Sleep auth URL');

    const result = getAuthorizationUrl(userId);

    if (!result.success || !result.data) {
      sendError(res, 500, result.error || 'Failed to generate auth URL');
      return true;
    }

    sendJson(res, 200, { url: result.data.url });
    return true;
  }

  // ============================================================================
  // DELETE /api/eight-sleep/disconnect - Disconnect account
  // ============================================================================
  if (pathname === '/api/eight-sleep/disconnect' && req.method === 'DELETE') {
    log.info({ userId }, 'Disconnecting Eight Sleep');

    await deleteUserTokens(userId);

    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/status - Get connection status and summary
  // ============================================================================
  if (pathname === '/api/eight-sleep/status' && req.method === 'GET') {
    const connected = await isEightSleepConfigured(userId);

    if (!connected) {
      sendJson(res, 200, { connected: false });
      return true;
    }

    // Get sleep summary and biometrics
    const [sleepResult, biometricsResult, tempResult] = await Promise.all([
      getSleepSummary(userId),
      getRecentBiometrics(userId),
      getTemperatureState(userId),
    ]);

    sendJson(res, 200, {
      connected: true,
      lastNightSleep: sleepResult.success ? sleepResult.data : null,
      biometrics: biometricsResult.success ? biometricsResult.data : null,
      temperature: tempResult.success ? tempResult.data : null,
      error: !sleepResult.success ? sleepResult.error : undefined,
    });
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/sleep/summary - Get sleep summary
  // ============================================================================
  if (pathname === '/api/eight-sleep/sleep/summary' && req.method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || undefined;

    const result = await getSleepSummary(userId, date);

    if (!result.success || !result.data) {
      sendError(res, 404, result.error || 'No sleep data found');
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // GET /api/eight-sleep/temperature - Get temperature state
  // ============================================================================
  if (pathname === '/api/eight-sleep/temperature' && req.method === 'GET') {
    const result = await getTemperatureState(userId);

    if (!result.success || !result.data) {
      sendError(res, 500, result.error || 'Failed to get temperature');
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // PUT /api/eight-sleep/temperature - Set temperature
  // ============================================================================
  if (pathname === '/api/eight-sleep/temperature' && req.method === 'PUT') {
    try {
      const body = await parseJsonBody(req);
      const level = typeof body.level === 'number' ? body.level : undefined;
      const durationMinutes =
        typeof body.durationMinutes === 'number' ? body.durationMinutes : undefined;

      if (level === undefined) {
        sendError(res, 400, 'Missing level parameter');
        return true;
      }

      const result = await setTemperature(userId, { level, durationMinutes });

      if (!result.success) {
        sendError(res, 500, result.error || 'Failed to set temperature');
        return true;
      }

      sendJson(res, 200, { success: true });
      return true;
    } catch {
      sendError(res, 400, 'Invalid request body');
      return true;
    }
  }

  // ============================================================================
  // POST /api/eight-sleep/temperature/on - Turn on
  // ============================================================================
  if (pathname === '/api/eight-sleep/temperature/on' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const level = typeof body.level === 'number' ? body.level : undefined;

      const result = await turnOn(userId, level);

      if (!result.success) {
        sendError(res, 500, result.error || 'Failed to turn on');
        return true;
      }

      sendJson(res, 200, { success: true });
      return true;
    } catch {
      sendError(res, 400, 'Invalid request body');
      return true;
    }
  }

  // ============================================================================
  // POST /api/eight-sleep/temperature/off - Turn off
  // ============================================================================
  if (pathname === '/api/eight-sleep/temperature/off' && req.method === 'POST') {
    const result = await turnOff(userId);

    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to turn off');
      return true;
    }

    sendJson(res, 200, { success: true });
    return true;
  }

  // Not an Eight Sleep route
  return false;
}
