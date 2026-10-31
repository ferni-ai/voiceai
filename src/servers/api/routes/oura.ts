/**
 * Oura Ring data routes (read-only).
 *
 * Connecting and disconnecting are not here: they are the shared wearables flow
 * (POST /auth/oauth/start { provider: 'oura' }, then /wearables/oura/*).
 *
 * 1. GET /api/oura/configured → Is the Oura app set up on this server
 * 2. GET /api/oura/status → Connection status and all data
 * 3. GET /api/oura/sleep → Sleep summary
 * 4. GET /api/oura/readiness → Readiness score
 * 5. GET /api/oura/activity → Activity summary
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getOuraLink, isApiConfigured } from '../../../services/identity/oura-auth.js';
import {
  getSleepSummary,
  getReadinessSummary,
  getActivitySummary,
  getOuraStatus,
} from '../../../services/identity/oura-api.js';
import { API_ERRORS } from '../../../api/error-messages.js';
import { getVerifiedUserId as getUserId } from '../request-identity.js';

// ============================================================================
// HELPERS
// ============================================================================

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

export async function handleOuraRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Check if Oura is configured at app level
  if (!isApiConfigured() && !pathname.endsWith('/configured')) {
    sendError(res, 503, API_ERRORS.INTEGRATION_NOT_CONFIGURED('Oura'));
    return true;
  }

  // ============================================================================
  // GET /api/oura/configured - Check if API is configured
  // ============================================================================
  if (pathname === '/api/oura/configured' && req.method === 'GET') {
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
  // GET /api/oura/status - Get connection status and all data
  // ============================================================================
  if (pathname === '/api/oura/status' && req.method === 'GET') {
    const link = await getOuraLink(userId);

    if (link !== 'connected') {
      sendJson(res, 200, {
        connected: false,
        ...(link === 'needs_reauth' ? { needsReauth: true } : {}),
      });
      return true;
    }

    const result = await getOuraStatus(userId);

    if (!result.success || !result.data) {
      sendJson(res, 200, {
        connected: true,
        error: result.error,
      });
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // GET /api/oura/sleep - Get sleep summary
  // ============================================================================
  if (pathname === '/api/oura/sleep' && req.method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || undefined;

    const result = await getSleepSummary(userId, date);

    if (!result.success || !result.data) {
      sendError(res, 404, result.error || API_ERRORS.INTEGRATION_NO_SLEEP_DATA);
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // GET /api/oura/readiness - Get readiness score
  // ============================================================================
  if (pathname === '/api/oura/readiness' && req.method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || undefined;

    const result = await getReadinessSummary(userId, date);

    if (!result.success || !result.data) {
      sendError(res, 404, result.error || API_ERRORS.INTEGRATION_NO_READINESS_DATA);
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // GET /api/oura/activity - Get activity summary
  // ============================================================================
  if (pathname === '/api/oura/activity' && req.method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || undefined;

    const result = await getActivitySummary(userId, date);

    if (!result.success || !result.data) {
      sendError(res, 404, result.error || API_ERRORS.INTEGRATION_NO_ACTIVITY_DATA);
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // Not an Oura route
  return false;
}
