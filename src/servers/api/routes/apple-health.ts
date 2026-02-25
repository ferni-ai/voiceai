/**
 * Apple Health API Routes
 *
 * Sync-based health data endpoints for native iOS app integration.
 * Unlike OAuth integrations, Apple Health uses a push model where
 * the iOS app syncs HealthKit data to the backend.
 *
 * Setup Flow:
 * 1. POST /api/apple-health/setup → Generate sync token for device
 * 2. iOS app uses token to push HealthKit data
 * 3. GET /api/apple-health/status → Check connection status
 *
 * Data Sync:
 * - POST /api/apple-health/sync → Receive sync data from iOS app
 * - GET /api/apple-health/summary → Get daily summary
 *
 * Management:
 * - DELETE /api/apple-health/disconnect → Revoke sync token
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  generateSyncToken,
  validateSyncToken,
  revokeSyncToken,
  processSyncPayload,
  getConnectionStatus,
  getDailySummary,
  getRecentSummaries,
} from '../../../services/identity/apple-health-sync.js';
import type { AppleHealthSyncPayload } from '../../../services/identity/apple-health-types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { API_ERRORS } from '../../../api/error-messages.js';

const log = createLogger({ module: 'apple-health-routes' });

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

function getSyncToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Sync ')) {
    return authHeader.slice(5);
  }

  const tokenHeader = req.headers['x-sync-token'];
  if (tokenHeader && typeof tokenHeader === 'string') {
    return tokenHeader;
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

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleAppleHealthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-User-ID, X-Sync-Token'
  );

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // ============================================================================
  // POST /api/apple-health/sync - Receive sync data from iOS app
  // Uses sync token auth instead of user auth
  // ============================================================================
  if (pathname === '/api/apple-health/sync' && req.method === 'POST') {
    const syncToken = getSyncToken(req);
    const userId = getUserId(req);

    if (!userId || !syncToken) {
      sendError(res, 401, API_ERRORS.HEALTH_SYNC_CREDENTIALS_REQUIRED);
      return true;
    }

    // Validate sync token
    const validation = await validateSyncToken(userId, syncToken);
    if (!validation.valid) {
      sendError(res, 401, API_ERRORS.HEALTH_INVALID_SYNC_TOKEN);
      return true;
    }

    const payload = await parseBody<AppleHealthSyncPayload>(req);
    if (!payload) {
      sendError(res, 400, API_ERRORS.INVALID_SYNC_PAYLOAD);
      return true;
    }

    const result = await processSyncPayload(userId, payload);

    if (!result.success) {
      log.error({ error: result.error, userId }, 'Apple Health sync failed');
      sendError(res, 500, result.error || API_ERRORS.HEALTH_SYNC_FAILED);
      return true;
    }

    log.info({ userId, processed: result.data?.processed }, 'Apple Health sync completed');
    sendJson(res, 200, { success: true, processed: result.data?.processed });
    return true;
  }

  // All other routes require standard user authentication
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, API_ERRORS.AUTH_REQUIRED);
    return true;
  }

  // ============================================================================
  // POST /api/apple-health/setup - Generate sync token for device
  // ============================================================================
  if (pathname === '/api/apple-health/setup' && req.method === 'POST') {
    log.info({ userId }, 'Setting up Apple Health sync');

    const body = await parseBody<{ deviceId: string; deviceName: string }>(req);
    if (!body?.deviceId || !body?.deviceName) {
      sendError(res, 400, API_ERRORS.HEALTH_DEVICE_INFO_REQUIRED);
      return true;
    }

    const result = await generateSyncToken(userId, body.deviceId, body.deviceName);

    if (!result.success || !result.data) {
      sendError(res, 500, result.error || API_ERRORS.HEALTH_TOKEN_GENERATE_FAILED);
      return true;
    }

    sendJson(res, 200, { syncToken: result.data });
    return true;
  }

  // ============================================================================
  // GET /api/apple-health/status - Get connection status
  // ============================================================================
  if (pathname === '/api/apple-health/status' && req.method === 'GET') {
    const status = await getConnectionStatus(userId);

    sendJson(res, 200, status);
    return true;
  }

  // ============================================================================
  // GET /api/apple-health/summary - Get daily summary
  // ============================================================================
  if (pathname === '/api/apple-health/summary' && req.method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    const date = url.searchParams.get('date') || undefined;

    const result = await getDailySummary(userId, date);

    if (!result.success || !result.data) {
      sendError(res, 404, result.error || API_ERRORS.HEALTH_NO_DATA);
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // GET /api/apple-health/history - Get recent summaries
  // ============================================================================
  if (pathname === '/api/apple-health/history' && req.method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    const days = parseInt(url.searchParams.get('days') || '7', 10);

    const result = await getRecentSummaries(userId, days);

    if (!result.success) {
      sendError(res, 500, result.error || API_ERRORS.HEALTH_HISTORY_FAILED);
      return true;
    }

    sendJson(res, 200, { summaries: result.data || [] });
    return true;
  }

  // ============================================================================
  // DELETE /api/apple-health/disconnect - Disconnect device
  // ============================================================================
  if (pathname === '/api/apple-health/disconnect' && req.method === 'DELETE') {
    log.info({ userId }, 'Disconnecting Apple Health');

    await revokeSyncToken(userId);

    sendJson(res, 200, { success: true });
    return true;
  }

  // Not an Apple Health route
  return false;
}
