/**
 * Migration Routes
 *
 * API endpoints for user data migration from device IDs to Firebase UIDs.
 *
 * Endpoints:
 * - POST /api/auth/migrate - Migrate user data to Firebase UID
 * - GET /api/auth/migration-status - Check migration status for a device
 * - POST /api/identity/merge-anonymous - Move an anonymous account (identity-merge-routes.ts)
 *
 * @module MigrationRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getMigratedUid,
  migrateUserData,
  validateMigrationRequest,
} from '../services/user-migration.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';
import { handleIdentityMergeRoutes } from './identity-merge-routes.js';

// Alias for compatibility
const sendJson = sendJSON;
const parseJsonBody = parseBody;

// Helper to get query param from request URL
function getQueryParam(req: IncomingMessage, param: string): string | null {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get(param);
}

const log = createLogger({ module: 'MigrationRoutes' });

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
  // POST /api/auth/migrate - Migrate user data
  if (pathname === '/api/auth/migrate' && req.method === 'POST') {
    await handleMigrate(req, res);
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
 * POST /api/auth/migrate
 *
 * Migrate the caller's legacy device data into their own Firebase account.
 *
 * Requires `Authorization: Bearer <Firebase ID token>`. The target uid is the
 * token's uid, never the body's: a body uid let anyone overwrite any profile.
 * A body `firebaseUid` that names another account is refused with 403.
 * The device id is the only credential a legacy device profile ever had, so
 * holding it is the proof of ownership of the source.
 *
 * Body: { deviceId: string, firebaseUid?: string, displayName?: string }
 */
async function handleMigrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Rate limit: 5 migrations per hour per IP
  if (rateLimit(req, res, { maxRequests: 5, windowMs: 3600000 })) {
    return;
  }

  const auth = await requireAuth(req, res, { allowDevMode: false });
  if (!auth) return;
  if (auth.authMethod !== 'firebase' || !auth.firebaseUid) {
    log.warn('Migration refused: caller is not a signed-in user', { method: auth.authMethod });
    sendError(res, 'Sign in to move your data to your account', 403);
    return;
  }
  const firebaseUid = auth.firebaseUid;

  interface MigrationRequestBody {
    deviceId?: string;
    device_id?: string;
    firebaseUid?: string;
    firebase_uid?: string;
    displayName?: string;
    display_name?: string;
  }

  try {
    const body = await parseJsonBody<MigrationRequestBody>(req);

    // Get device ID from body
    const deviceId = body.deviceId || body.device_id;
    if (!deviceId || typeof deviceId !== 'string') {
      sendError(res, 'Missing deviceId in request body', 400);
      return;
    }

    const claimedUid = body.firebaseUid || body.firebase_uid;
    if (claimedUid && claimedUid !== firebaseUid) {
      log.warn('Migration refused: body names another account', {
        caller: `${firebaseUid.substring(0, 8)}...`,
      });
      sendError(res, 'You can only move data into your own account', 403);
      return;
    }
    const displayName = body.displayName || body.display_name;

    // Validate request
    const validation = validateMigrationRequest({ deviceId, firebaseUid });
    if (!validation.valid) {
      sendError(res, validation.error || 'Invalid request', 400);
      return;
    }

    // Perform migration
    log.info('Migration requested', {
      deviceId: `${deviceId.substring(0, 15)}...`,
      firebaseUid: `${firebaseUid.substring(0, 8)}...`,
    });

    const result = await migrateUserData({
      deviceId,
      firebaseUid,
      displayName,
      email: auth.email,
    });

    if (result.success) {
      sendJson(res, {
        success: true,
        conversationsMigrated: result.conversationsMigrated,
        memoriesMigrated: result.memoriesMigrated,
        profileAction: result.profileAction,
      });
    } else {
      sendError(res, result.error || 'Migration failed', 400);
    }
  } catch (error) {
    log.error('Migration endpoint error', { error: String(error) });
    sendError(res, 'Migration failed', 500);
  }
}

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
