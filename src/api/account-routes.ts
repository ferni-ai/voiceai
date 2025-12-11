// @ts-nocheck - WIP file, type definitions need updating
/**
 * Account Routes
 *
 * API endpoints for account management:
 * - GET /api/account - Get account info
 * - DELETE /api/account - Delete account (GDPR)
 * - PUT /api/account/profile - Update profile info
 *
 * @module AccountRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getDefaultStore } from '../memory/index.js';
import { deleteFirebaseUser, getFirebaseUser } from '../services/firebase-auth.js';
import { recordSecurityEvent } from '../services/security-events.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';

// Alias for compatibility
const sendJson = sendJSON;
const parseJsonBody = parseBody;

const log = createLogger({ module: 'AccountRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle account routes.
 * Returns true if request was handled, false otherwise.
 */
export async function handleAccountRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/account routes
  if (!pathname.startsWith('/api/account')) {
    return false;
  }

  // Rate limit account operations
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) {
    return true;
  }

  // All account routes require authentication
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  const userId = auth.userId;
  const method = req.method || 'GET';

  try {
    // GET /api/account - Get account info
    if (pathname === '/api/account' && method === 'GET') {
      return await handleGetAccount(res, userId, auth.firebaseUid);
    }

    // DELETE /api/account - Delete account
    if (pathname === '/api/account' && method === 'DELETE') {
      return await handleDeleteAccount(req, res, userId);
    }

    // PUT /api/account/profile - Update profile
    if (pathname === '/api/account/profile' && method === 'PUT') {
      return await handleUpdateProfile(req, res, userId);
    }

    // Route not found
    sendError(res, 'Account endpoint not found', 404);
    return true;
  } catch (error) {
    log.error({ error, pathname, userId }, 'Account route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/account - Get account information
 */
async function handleGetAccount(
  res: ServerResponse,
  userId: string,
  firebaseUid?: string
): Promise<boolean> {
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    // Get Firebase user info if available
    let firebaseInfo: {
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
      photoURL?: string;
      providers?: string[];
      isAnonymous?: boolean;
    } | null = null;

    if (firebaseUid) {
      const firebaseUser = await getFirebaseUser(firebaseUid);
      if (firebaseUser) {
        firebaseInfo = {
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          providers: firebaseUser.providerData.map((p) => p.providerId),
          isAnonymous:
            firebaseUser.providerData.length === 0 ||
            firebaseUser.providerData.every((p) => p.providerId === 'anonymous'),
        };
      }
    }

    sendJson(res, {
      userId,
      firebaseUid: firebaseUid || null,
      profile: profile
        ? {
            name: profile.name,
            email: profile.email,
            createdAt: profile.createdAt,
            lastActiveAt: profile.lastActiveAt,
            totalConversations: profile.totalConversations,
            hasVoiceProfile: !!profile.voiceProfile,
          }
        : null,
      firebase: firebaseInfo,
      links: {
        export: '/api/gdpr/export',
        delete: '/api/account (DELETE)',
        update: '/api/account/profile (PUT)',
      },
    });

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to get account');
    sendError(res, 'Failed to get account info', 500);
    return true;
  }
}

/**
 * DELETE /api/account - Delete account and all data
 */
async function handleDeleteAccount(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  // Extra rate limiting for deletion (expensive operation)
  if (rateLimit(req, res, { maxRequests: 3, windowMs: 3600000, keyPrefix: 'delete-account' })) {
    return true;
  }

  // Parse confirmation from body
  const body = await parseJsonBody(req);

  if (!body || body.confirmation !== 'DELETE_MY_ACCOUNT') {
    sendError(
      res,
      'Account deletion requires confirmation. Send { "confirmation": "DELETE_MY_ACCOUNT" }',
      400
    );
    return true;
  }

  log.warn({ userId: userId.substring(0, 15) + '...' }, 'Account deletion requested');

  // Record this critical event
  await recordSecurityEvent({
    type: 'profile_delete',
    actorId: userId,
    targetId: userId,
    action: 'User requested account deletion via /api/account',
    outcome: 'success',
    ip: req.socket.remoteAddress,
  });

  try {
    const store = getDefaultStore();
    await store.initialize();

    // Delete profile and all associated data
    const profileDeleted = await store.deleteProfile(userId);

    // Delete Firebase user if this looks like a Firebase UID
    let firebaseDeleted = false;
    if (!userId.startsWith('device:') && userId.length >= 20) {
      try {
        firebaseDeleted = await deleteFirebaseUser(userId);
        if (firebaseDeleted) {
          log.info({ userId: userId.substring(0, 8) + '...' }, 'Firebase user deleted');
        }
      } catch (firebaseErr) {
        log.warn(
          { error: String(firebaseErr), userId: userId.substring(0, 8) + '...' },
          'Firebase user deletion failed (non-fatal)'
        );
      }
    }

    if (profileDeleted || firebaseDeleted) {
      sendJson(res, {
        success: true,
        message: 'Your account and all associated data have been deleted.',
        deletedAt: new Date().toISOString(),
        details: {
          profileDeleted,
          firebaseDeleted,
        },
      });
    } else {
      sendJson(res, {
        success: false,
        message: 'No account found to delete.',
      });
    }

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Account deletion failed');
    sendError(res, 'Failed to delete account. Please contact support.', 500);
    return true;
  }
}

/**
 * PUT /api/account/profile - Update profile information
 */
async function handleUpdateProfile(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  const body = await parseJsonBody(req);

  if (!body) {
    sendError(res, 'Missing request body', 400);
    return true;
  }

  const { name, email, preferences } = body as {
    name?: string;
    email?: string;
    preferences?: Record<string, unknown>;
  };

  try {
    const store = getDefaultStore();
    let profile = await store.getProfile(userId);

    if (!profile) {
      // Create new profile
      profile = {
        userId,
        name: name || 'Friend',
        email,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        totalConversations: 0,
        preferences: preferences || {},
        linkedIdentifiers: [],
        voiceProfile: undefined,
      };
    } else {
      // Update existing profile
      if (name !== undefined) profile.name = name;
      if (email !== undefined) profile.email = email;
      if (preferences) {
        profile.preferences = { ...profile.preferences, ...preferences };
      }
      profile.lastActiveAt = new Date().toISOString();
    }

    await store.saveProfile(profile);

    sendJson(res, {
      success: true,
      profile: {
        name: profile.name,
        email: profile.email,
        preferences: profile.preferences,
        updatedAt: profile.lastActiveAt,
      },
    });

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Profile update failed');
    sendError(res, 'Failed to update profile', 500);
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleAccountRoutes;
