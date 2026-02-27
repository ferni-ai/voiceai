/**
 * Migration Routes
 *
 * API endpoints for user data migration from device IDs to Firebase UIDs.
 *
 * Endpoints:
 * - POST /api/auth/migrate - Migrate user data to Firebase UID
 * - GET /api/auth/migration-status - Check migration status for a device
 *
 * @module MigrationRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { verifyFirebaseToken, isVerifiedToken } from '../services/identity/firebase-auth.js';
import {
  getMigratedUid,
  isAlreadyMigrated,
  migrateUserData,
  validateMigrationRequest,
} from '../services/user-migration.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';

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
    handleMigrationStatus(req, res);
    return true;
  }

  return false;
}

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/**
 * POST /api/auth/migrate
 *
 * Migrate user data from device ID to Firebase UID.
 *
 * Body:
 * {
 *   deviceId: string,
 *   firebaseUid: string,
 *   displayName?: string,
 *   email?: string
 * }
 *
 * OR if Authorization header is present, just:
 * {
 *   deviceId: string
 * }
 * And firebaseUid is extracted from the verified token.
 */
async function handleMigrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Rate limit: 5 migrations per hour per IP
  if (rateLimit(req, res, { maxRequests: 5, windowMs: 3600000 })) {
    return;
  }

  interface MigrationRequestBody {
    deviceId?: string;
    device_id?: string;
    firebaseUid?: string;
    firebase_uid?: string;
    email?: string;
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

    // Get Firebase UID from token or body
    let firebaseUid: string | undefined;
    let email: string | undefined;
    let displayName: string | undefined;

    // Try to get Firebase UID from Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const verified = await verifyFirebaseToken(token);
      if (isVerifiedToken(verified)) {
        firebaseUid = verified.uid;
        email = verified.email;
        // Note: displayName would need to be fetched from Firebase User record
      }
    }

    // Fall back to body if not in token
    if (!firebaseUid) {
      firebaseUid = body.firebaseUid || body.firebase_uid;
    }
    if (!email && body.email) {
      email = body.email;
    }
    if (body.displayName || body.display_name) {
      displayName = body.displayName || body.display_name;
    }

    // Validate request
    const validation = validateMigrationRequest({ deviceId, firebaseUid });
    if (!validation.valid) {
      sendError(res, validation.error || 'Invalid request', 400);
      return;
    }

    // Perform migration
    log.info('Migration requested', {
      deviceId: `${deviceId.substring(0, 15)}...`,
      firebaseUid: `${firebaseUid!.substring(0, 8)}...`,
    });

    const result = await migrateUserData({
      deviceId,
      firebaseUid: firebaseUid!,
      displayName,
      email,
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
function handleMigrationStatus(req: IncomingMessage, res: ServerResponse): void {
  const deviceId = getQueryParam(req, 'deviceId') || getQueryParam(req, 'device_id');

  if (!deviceId) {
    sendError(res, 'Missing deviceId query parameter', 400);
    return;
  }

  const legacyUserId = deviceId.startsWith('device:') ? deviceId : `device:${deviceId}`;
  const isMigrated = isAlreadyMigrated(legacyUserId);
  const migratedTo = getMigratedUid(legacyUserId);

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
