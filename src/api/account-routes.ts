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
import { deleteOAuthLinkStatesFor } from '../servers/token/oauth-link-state.js';
import { tombstoneTransactionOwnersFor } from '../services/billing/apple-signed-data.js';
import { deleteFirebaseUser, getFirebaseUser } from '../services/identity/firebase-auth.js';
import { erasePushRecordsFor } from '../services/push-endpoint-owners.js';
import { recordSecurityEvent } from '../services/security-events.js';
import { createUserProfile } from '../types/user-profile.js';
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

  const { userId } = auth;
  const method = req.method || 'GET';

  try {
    // GET /api/account - Get account info
    if (pathname === '/api/account' && method === 'GET') {
      return await handleGetAccount(res, userId, auth.firebaseUid);
    }

    // DELETE /api/account - Delete account
    if (pathname === '/api/account' && method === 'DELETE') {
      return await handleDeleteAccount(req, res, userId, auth.firebaseUid);
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
          providers: firebaseUser.providerData.map((p: { providerId: string }) => p.providerId),
          isAnonymous:
            firebaseUser.providerData.length === 0 ||
            firebaseUser.providerData.every(
              (p: { providerId: string }) => p.providerId === 'anonymous'
            ),
        };
      }
    }

    sendJson(res, {
      userId,
      firebaseUid: firebaseUid || null,
      profile: profile
        ? {
            name: profile.name,
            email: profile.contactInfo?.email,
            createdAt: profile.firstContact,
            lastActiveAt: profile.lastContact,
            totalConversations: profile.totalConversations,
            hasVoiceProfile: !!profile.voiceSketch,
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
 * Records about the user kept outside their own documents (keyed by an
 * endpoint hash, an OAuth state hash or an Apple transaction id), so the
 * deleteAllData sweep can't reach them.
 */
const LINKED_RECORDS: ReadonlyArray<readonly [string, (userId: string) => Promise<unknown>]> = [
  ['push_subscriptions', erasePushRecordsFor],
  ['oauth_link_states', deleteOAuthLinkStatesFor],
  ['apple_transaction_owners', tombstoneTransactionOwnersFor],
];

/** Best effort: every sweep runs; returns the names of those that failed. */
async function eraseLinkedRecords(userId: string): Promise<string[]> {
  const results = await Promise.allSettled(LINKED_RECORDS.map(async ([, erase]) => erase(userId)));
  return LINKED_RECORDS.flatMap(([name], i) => {
    const result = results[i];
    if (result?.status !== 'rejected') return [];
    log.error({ error: String(result.reason), userId, records: name }, 'Records left behind');
    return [name];
  });
}

/**
 * DELETE /api/account - Delete account and all data
 *
 * Erases every data store (same sweep as DELETE /api/export/all) and the
 * records linked to the user elsewhere, then the Firebase sign-in. Success is
 * reported only when the data sweep and the sign-in deletion happened; linked
 * records that couldn't be removed are listed in details.failures.
 */
async function handleDeleteAccount(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  firebaseUid?: string
): Promise<boolean> {
  // Extra rate limiting for deletion (expensive operation)
  if (rateLimit(req, res, { maxRequests: 3, windowMs: 3600000, keyPrefix: 'delete-account' })) {
    return true;
  }

  // Parse confirmation from body
  const body = await parseJsonBody<{ confirmation?: string }>(req);

  if (body.confirmation !== 'DELETE_MY_ACCOUNT') {
    sendError(
      res,
      'Account deletion requires confirmation. Send { "confirmation": "DELETE_MY_ACCOUNT" }',
      400
    );
    return true;
  }

  log.warn({ userId: `${userId.substring(0, 15)}...` }, 'Account deletion requested');

  await recordSecurityEvent({
    type: 'profile_delete',
    actorId: userId,
    targetId: userId,
    action: 'User requested account deletion via /api/account',
    outcome: 'success',
    ip: req.socket.remoteAddress,
  });

  try {
    const { getDataExportService } = await import('../services/data-export.js');
    await getDataExportService().deleteAllData(userId);
  } catch (error) {
    log.error({ error, userId }, 'Account deletion failed while erasing data');
    sendError(res, "Couldn't delete your account. Nothing was closed. Try again?", 500);
    return true;
  }

  const failures = await eraseLinkedRecords(userId);

  const firebaseDeleted = firebaseUid ? await deleteFirebaseUser(firebaseUid) : false;
  if (firebaseUid && !firebaseDeleted) {
    log.error({ userId }, 'Data erased but Firebase user deletion failed');
    sendError(res, "Your data was deleted, but we couldn't close your sign-in. Try again?", 500);
    return true;
  }

  sendJson(res, {
    success: true,
    message:
      failures.length === 0
        ? 'Your account and all associated data have been deleted.'
        : "Your account is deleted, but some records couldn't be removed.",
    deletedAt: new Date().toISOString(),
    details: { dataDeleted: true, firebaseDeleted, failures },
  });
  return true;
}

/**
 * PUT /api/account/profile - Update profile information
 */
async function handleUpdateProfile(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  interface UpdateProfileBody {
    name?: string;
    email?: string;
    preferences?: Partial<{
      verbosity: 'concise' | 'balanced' | 'storytelling';
      topicsToAvoid: string[];
      wantsProactiveAdvice: boolean;
    }>;
  }

  const body = await parseJsonBody<UpdateProfileBody>(req);
  const { name, email, preferences } = body;

  try {
    const store = getDefaultStore();
    let profile = await store.getProfile(userId);

    if (!profile) {
      // Create new profile using the proper factory function
      profile = createUserProfile(userId, name || 'Friend');
      if (email) {
        profile.contactInfo = { ...profile.contactInfo, email };
      }
    } else {
      // Update existing profile
      if (name !== undefined) profile.name = name;
      if (email !== undefined) {
        profile.contactInfo = { ...profile.contactInfo, email };
      }
      if (preferences) {
        // Only update specific preference fields that are provided
        if (preferences.verbosity !== undefined) {
          profile.preferences.verbosity = preferences.verbosity;
        }
        if (preferences.topicsToAvoid !== undefined) {
          profile.preferences.topicsToAvoid = preferences.topicsToAvoid;
        }
        if (preferences.wantsProactiveAdvice !== undefined) {
          profile.preferences.wantsProactiveAdvice = preferences.wantsProactiveAdvice;
        }
      }
      profile.lastContact = new Date();
    }

    await store.saveProfile(profile);

    sendJson(res, {
      success: true,
      profile: {
        name: profile.name,
        email: profile.contactInfo?.email,
        preferences: profile.preferences,
        updatedAt: profile.lastContact,
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
