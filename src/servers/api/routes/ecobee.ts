/**
 * Ecobee API Routes
 *
 * PIN-based OAuth flow and thermostat status endpoints.
 *
 * OAuth Flow:
 * 1. POST /api/ecobee/link/start → Returns PIN for user to enter at ecobee.com
 * 2. GET /api/ecobee/link/status → Poll to check if user has authorized
 * 3. DELETE /api/ecobee/disconnect → Disconnect Ecobee account
 *
 * Status:
 * 4. GET /api/ecobee/status → Get connection status and thermostat summary
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  requestPin,
  checkAuthorization,
  getPendingAuth,
  deleteUserTokens,
  isEcobeeConfigured,
  isApiConfigured,
} from '../../../services/identity/ecobee-auth.js';
import {
  getThermostatStatus,
  getSensorReadings,
  setTemperature,
  setClimateMode,
  resumeSchedule,
  setHvacMode,
} from '../../../services/identity/ecobee-api.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { API_ERRORS } from '../../../api/error-messages.js';

const log = createLogger({ module: 'ecobee-routes' });

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

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleEcobeeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers - restrict to Ferni domains
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

  // Check if Ecobee is configured at app level
  if (!isApiConfigured() && !pathname.endsWith('/configured')) {
    sendError(res, 503, API_ERRORS.INTEGRATION_NOT_CONFIGURED('Ecobee'));
    return true;
  }

  // ============================================================================
  // GET /api/ecobee/configured - Check if Ecobee API is configured
  // ============================================================================
  if (pathname === '/api/ecobee/configured' && req.method === 'GET') {
    sendJson(res, 200, { configured: isApiConfigured() });
    return true;
  }

  // Require authentication for all other routes
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.AUTH_REQUIRED);
    return true;
  }

  // ============================================================================
  // POST /api/ecobee/link/start - Start OAuth flow, get PIN
  // ============================================================================
  if (pathname === '/api/ecobee/link/start' && req.method === 'POST') {
    log.info({ userId }, 'Starting Ecobee link flow');

    const result = await requestPin(userId);

    if (!result.success || !result.data) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_LINK_FAILED);
      return true;
    }

    sendJson(res, 200, {
      pin: result.data.pin,
      expiresInMinutes: result.data.expiresIn,
      instructions: `Enter this PIN at ecobee.com/consumerportal, click "Add Application", then enter the PIN.`,
    });
    return true;
  }

  // ============================================================================
  // GET /api/ecobee/link/status - Poll to check authorization status
  // ============================================================================
  if (pathname === '/api/ecobee/link/status' && req.method === 'GET') {
    // Check if there's a pending auth
    const pending = await getPendingAuth(userId);

    if (!pending) {
      // Check if already connected
      const connected = await isEcobeeConfigured(userId);
      if (connected) {
        sendJson(res, 200, { status: 'connected' });
        return true;
      }
      sendJson(res, 200, { status: 'no_pending_auth' });
      return true;
    }

    // Check if expired
    const remainingMs = pending.expiresAt - Date.now();
    if (remainingMs <= 0) {
      sendJson(res, 200, { status: 'expired' });
      return true;
    }

    // Check if user has authorized
    const result = await checkAuthorization(userId);

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_AUTH_CHECK_FAILED);
      return true;
    }

    if (result.data?.authorized) {
      log.info({ userId }, 'Ecobee authorization successful');
      sendJson(res, 200, { status: 'connected' });
      return true;
    }

    // Still waiting
    sendJson(res, 200, {
      status: 'pending',
      pin: pending.pin,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      pollIntervalSeconds: pending.interval,
    });
    return true;
  }

  // ============================================================================
  // DELETE /api/ecobee/disconnect - Disconnect Ecobee account
  // ============================================================================
  if (pathname === '/api/ecobee/disconnect' && req.method === 'DELETE') {
    log.info({ userId }, 'Disconnecting Ecobee');

    await deleteUserTokens(userId);

    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // GET /api/ecobee/status - Get connection status and thermostat summary
  // ============================================================================
  if (pathname === '/api/ecobee/status' && req.method === 'GET') {
    const connected = await isEcobeeConfigured(userId);

    if (!connected) {
      sendJson(res, 200, {
        connected: false,
      });
      return true;
    }

    // Get thermostat info
    const statusResult = await getThermostatStatus(userId);
    const sensorsResult = await getSensorReadings(userId);

    sendJson(res, 200, {
      connected: true,
      thermostat: statusResult.success ? statusResult.data : null,
      sensors: sensorsResult.success ? sensorsResult.data : [],
      error: !statusResult.success ? statusResult.error : undefined,
    });
    return true;
  }

  // ============================================================================
  // POST /api/ecobee/temperature - Set temperature hold
  // ============================================================================
  if (pathname === '/api/ecobee/temperature' && req.method === 'POST') {
    let body: { heat?: number; cool?: number; holdType?: string } = {};
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      body = JSON.parse(Buffer.concat(chunks).toString()) as typeof body;
    } catch {
      sendError(res, 400, API_ERRORS.INVALID_JSON_BODY);
      return true;
    }

    if (body.heat === undefined && body.cool === undefined) {
      sendError(res, 400, API_ERRORS.ECOBEE_TEMP_PARAMS_REQUIRED);
      return true;
    }

    const result = await setTemperature(userId, {
      heatHoldTemp: body.heat,
      coolHoldTemp: body.cool,
      holdType: body.holdType as 'nextTransition' | 'indefinite' | undefined,
    });

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_SET_TEMP_FAILED);
      return true;
    }

    sendJson(res, 200, { success: true, message: result.data });
    return true;
  }

  // ============================================================================
  // POST /api/ecobee/climate - Set climate mode (home/away/sleep)
  // ============================================================================
  if (pathname === '/api/ecobee/climate' && req.method === 'POST') {
    let body: { climate: string; holdType?: string } = { climate: '' };
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      body = JSON.parse(Buffer.concat(chunks).toString()) as typeof body;
    } catch {
      sendError(res, 400, API_ERRORS.INVALID_JSON_BODY);
      return true;
    }

    if (!body.climate || !['home', 'away', 'sleep'].includes(body.climate)) {
      sendError(res, 400, API_ERRORS.ECOBEE_INVALID_CLIMATE);
      return true;
    }

    const result = await setClimateMode(userId, {
      climate: body.climate as 'home' | 'away' | 'sleep',
      holdType: body.holdType as 'nextTransition' | 'indefinite' | undefined,
    });

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_SET_CLIMATE_FAILED);
      return true;
    }

    sendJson(res, 200, { success: true, message: result.data });
    return true;
  }

  // ============================================================================
  // POST /api/ecobee/resume - Resume regular schedule
  // ============================================================================
  if (pathname === '/api/ecobee/resume' && req.method === 'POST') {
    const result = await resumeSchedule(userId);

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_RESUME_FAILED);
      return true;
    }

    sendJson(res, 200, { success: true, message: result.data });
    return true;
  }

  // ============================================================================
  // POST /api/ecobee/hvac - Set HVAC mode (heat/cool/auto/off)
  // ============================================================================
  if (pathname === '/api/ecobee/hvac' && req.method === 'POST') {
    let body: { mode: string } = { mode: '' };
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      body = JSON.parse(Buffer.concat(chunks).toString()) as typeof body;
    } catch {
      sendError(res, 400, API_ERRORS.INVALID_JSON_BODY);
      return true;
    }

    if (!body.mode || !['heat', 'cool', 'auto', 'off'].includes(body.mode)) {
      sendError(res, 400, API_ERRORS.ECOBEE_INVALID_HVAC_MODE);
      return true;
    }

    const result = await setHvacMode(userId, body.mode as 'heat' | 'cool' | 'auto' | 'off');

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.ECOBEE_SET_HVAC_FAILED);
      return true;
    }

    sendJson(res, 200, { success: true, message: result.data });
    return true;
  }

  // Not an Ecobee route
  return false;
}
