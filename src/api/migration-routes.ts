/**
 * Migration Routes
 *
 * API endpoints for user data migration from device IDs to Firebase UIDs.
 *
 * Endpoints:
 * - POST /api/auth/migrate - Retired: always 410 Gone
 * - GET /api/auth/migration-status - Check migration status for a device
 * - POST /api/identity/merge-anonymous - Move an anonymous account (identity-merge-routes.ts)
 *
 * @module MigrationRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getMigratedUid } from '../services/user-migration.js';
import { sendError, sendJSON } from './helpers.js';
import { handleIdentityMergeRoutes } from './identity-merge-routes.js';

// Alias for compatibility
const sendJson = sendJSON;

// Helper to get query param from request URL
function getQueryParam(req: IncomingMessage, param: string): string | null {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get(param);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle migration routes.
 * Returns true if request was handled, false otherwise.
 */
export async function handleMigrationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // POST /api/auth/migrate - retired. Still answered here so old clients get
  // a clean 410 instead of falling through to another handler.
  if (pathname === '/api/auth/migrate' && req.method === 'POST') {
    sendJson(res, { error: 'gone' }, 410);
    return true;
  }

  // GET /api/auth/migration-status - Check migration status
  if (pathname === '/api/auth/migration-status' && req.method === 'GET') {
    await handleMigrationStatus(req, res);
    return true;
  }

  return handleIdentityMergeRoutes(req, res, pathname);
}

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/**
 * GET /api/auth/migration-status
 *
 * Check if a device has been migrated.
 *
 * Query params:
 * - deviceId: The device ID to check
 */
async function handleMigrationStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const deviceId = getQueryParam(req, 'deviceId') || getQueryParam(req, 'device_id');

  if (!deviceId) {
    sendError(res, 'Missing deviceId query parameter', 400);
    return;
  }

  const legacyUserId = deviceId.startsWith('device:') ? deviceId : `device:${deviceId}`;
  const migratedTo = await getMigratedUid(legacyUserId);
  const isMigrated = migratedTo !== null;

  sendJson(res, {
    deviceId,
    isMigrated,
    migratedTo: migratedTo ? `${migratedTo.substring(0, 8)}...` : null,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleMigrationRoutes;
