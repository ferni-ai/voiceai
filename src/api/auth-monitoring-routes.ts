/**
 * Auth Monitoring Routes
 *
 * API endpoints for monitoring authentication metrics:
 * - GET /api/auth/metrics - Get auth metrics (admin only)
 * - GET /api/auth/health - Health check for auth system
 *
 * @module AuthMonitoringRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getRecentEvents, getSecurityMetrics } from '../services/security-events.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAdmin } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'AuthMonitoringRoutes' });

// ============================================================================
// IN-MEMORY METRICS (simple implementation)
// ============================================================================

interface AuthMetrics {
  firebaseTokenVerifications: number;
  firebaseTokenFailures: number;
  legacyJwtVerifications: number;
  deviceIdAuthentications: number;
  anonymousLogins: number;
  accountLinkings: number;
  migrations: number;
  lastReset: string;
}

let metrics: AuthMetrics = {
  firebaseTokenVerifications: 0,
  firebaseTokenFailures: 0,
  legacyJwtVerifications: 0,
  deviceIdAuthentications: 0,
  anonymousLogins: 0,
  accountLinkings: 0,
  migrations: 0,
  lastReset: new Date().toISOString(),
};

// ============================================================================
// METRIC RECORDING FUNCTIONS
// ============================================================================

export function recordFirebaseTokenVerification(success: boolean): void {
  if (success) {
    metrics.firebaseTokenVerifications++;
  } else {
    metrics.firebaseTokenFailures++;
  }
}

export function recordLegacyJwtVerification(): void {
  metrics.legacyJwtVerifications++;
}

export function recordDeviceIdAuthentication(): void {
  metrics.deviceIdAuthentications++;
}

export function recordAnonymousLogin(): void {
  metrics.anonymousLogins++;
}

export function recordAccountLinking(): void {
  metrics.accountLinkings++;
}

export function recordMigration(): void {
  metrics.migrations++;
}

export function resetMetrics(): void {
  metrics = {
    firebaseTokenVerifications: 0,
    firebaseTokenFailures: 0,
    legacyJwtVerifications: 0,
    deviceIdAuthentications: 0,
    anonymousLogins: 0,
    accountLinkings: 0,
    migrations: 0,
    lastReset: new Date().toISOString(),
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle auth monitoring routes.
 * Returns true if request was handled, false otherwise.
 */
export async function handleAuthMonitoringRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // GET /api/auth/metrics - Get auth metrics (admin only)
  if (pathname === '/api/auth/metrics' && req.method === 'GET') {
    return await handleGetMetrics(req, res);
  }

  // GET /api/auth/health - Health check
  if (pathname === '/api/auth/health' && req.method === 'GET') {
    return handleHealthCheck(res);
  }

  // GET /api/auth/events - Recent auth events (admin only)
  if (pathname === '/api/auth/events' && req.method === 'GET') {
    return await handleGetEvents(req, res);
  }

  return false;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/auth/metrics - Get auth metrics
 */
async function handleGetMetrics(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Require admin for metrics
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // Get security metrics from security-events service
    const securityMetrics = await getSecurityMetrics();

    sendJSON(res, {
      auth: {
        ...metrics,
        successRate:
          metrics.firebaseTokenVerifications > 0
            ? (
                (metrics.firebaseTokenVerifications /
                  (metrics.firebaseTokenVerifications + metrics.firebaseTokenFailures)) *
                100
              ).toFixed(1) + '%'
            : 'N/A',
        firebaseAdoptionRate:
          metrics.firebaseTokenVerifications + metrics.deviceIdAuthentications > 0
            ? (
                (metrics.firebaseTokenVerifications /
                  (metrics.firebaseTokenVerifications + metrics.deviceIdAuthentications)) *
                100
              ).toFixed(1) + '%'
            : 'N/A',
      },
      security: securityMetrics,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    log.error({ error }, 'Failed to get auth metrics');
    sendError(res, 'Failed to get metrics', 500);
    return true;
  }
}

/**
 * GET /api/auth/health - Health check
 */
function handleHealthCheck(res: ServerResponse): boolean {
  const isHealthy = true; // Could add actual health checks here

  sendJSON(res, {
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks: {
      firebaseAdmin: 'ok', // Would check if Firebase Admin SDK is initialized
      securityEvents: 'ok',
    },
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * GET /api/auth/events - Recent auth events
 */
async function handleGetEvents(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Require admin for events
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // Get recent security events (all types, filter later if needed)
    const events = getRecentEvents({
      limit: 100,
    });

    // Filter to auth-related events
    const authEvents = events.filter((e) =>
      [
        'login_success',
        'login_failure',
        'jwt_invalid',
        'jwt_expired',
        'profile_delete',
        'api_key_invalid',
      ].includes(e.type)
    );

    sendJSON(res, {
      events: authEvents,
      count: authEvents.length,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    log.error({ error }, 'Failed to get auth events');
    sendError(res, 'Failed to get events', 500);
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleAuthMonitoringRoutes;
