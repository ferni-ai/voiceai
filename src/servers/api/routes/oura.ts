/**
 * Oura Ring API Routes
 *
 * OAuth flow and data access endpoints.
 *
 * OAuth Flow:
 * 1. GET /api/oura/auth/url → Returns authorization URL
 * 2. GET /api/oura/auth/callback → OAuth callback (handles code exchange)
 * 3. DELETE /api/oura/disconnect → Disconnect account
 *
 * Data Access:
 * 4. GET /api/oura/status → Get connection status and all data
 * 5. GET /api/oura/sleep → Get sleep summary
 * 6. GET /api/oura/readiness → Get readiness score
 * 7. GET /api/oura/activity → Get activity summary
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAuthorizationUrl,
  validateOAuthState,
  exchangeCodeForTokens,
  deleteUserTokens,
  isOuraConfigured,
  isApiConfigured,
} from '../../../services/identity/oura-auth.js';
import {
  getSleepSummary,
  getReadinessSummary,
  getActivitySummary,
  getOuraStatus,
} from '../../../services/identity/oura-api.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'oura-routes' });

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

export async function handleOuraRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Check if Oura is configured at app level
  if (!isApiConfigured() && !pathname.endsWith('/configured')) {
    sendError(res, 503, 'Oura integration is not configured');
    return true;
  }

  // ============================================================================
  // GET /api/oura/configured - Check if API is configured
  // ============================================================================
  if (pathname === '/api/oura/configured' && req.method === 'GET') {
    sendJson(res, 200, { configured: isApiConfigured() });
    return true;
  }

  // ============================================================================
  // GET /api/oura/auth/callback - OAuth callback (no auth required)
  // ============================================================================
  if (pathname === '/api/oura/auth/callback' && req.method === 'GET') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.warn({ error }, 'Oura OAuth error');
      res.writeHead(302, { Location: `/settings?oura=error&message=${encodeURIComponent(error)}` });
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
      log.error({ error: result.error }, 'Oura token exchange failed');
      res.writeHead(302, {
        Location: `/settings?oura=error&message=${encodeURIComponent(result.error || 'Failed')}`,
      });
      res.end();
      return true;
    }

    log.info({ userId }, 'Oura connected successfully');
    res.writeHead(302, { Location: '/settings?oura=success' });
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
  // GET /api/oura/auth/url - Get authorization URL
  // ============================================================================
  if (pathname === '/api/oura/auth/url' && req.method === 'GET') {
    log.info({ userId }, 'Generating Oura auth URL');

    const result = getAuthorizationUrl(userId);

    if (!result.success || !result.data) {
      sendError(res, 500, result.error || 'Failed to generate auth URL');
      return true;
    }

    sendJson(res, 200, { url: result.data.url });
    return true;
  }

  // ============================================================================
  // DELETE /api/oura/disconnect - Disconnect account
  // ============================================================================
  if (pathname === '/api/oura/disconnect' && req.method === 'DELETE') {
    log.info({ userId }, 'Disconnecting Oura');

    await deleteUserTokens(userId);

    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // GET /api/oura/status - Get connection status and all data
  // ============================================================================
  if (pathname === '/api/oura/status' && req.method === 'GET') {
    const connected = await isOuraConfigured(userId);

    if (!connected) {
      sendJson(res, 200, { connected: false });
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
      sendError(res, 404, result.error || 'No sleep data found');
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
      sendError(res, 404, result.error || 'No readiness data found');
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
      sendError(res, 404, result.error || 'No activity data found');
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // Not an Oura route
  return false;
}
