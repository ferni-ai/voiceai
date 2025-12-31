/**
 * Apple Sign In Server-to-Server Notifications
 *
 * Handles notifications from Apple about user account events:
 * - consent-revoked: User revoked email relay consent
 * - account-delete: User deleted their Apple Account
 * - email-disabled: User disabled email forwarding
 * - email-enabled: User re-enabled email forwarding
 *
 * @see https://developer.apple.com/documentation/sign_in_with_apple/processing_changes_for_sign_in_with_apple_accounts
 */

import type { JWTPayload } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'apple-signin-notifications' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Apple notification event types
 */
export type AppleNotificationEventType =
  | 'consent-revoked'
  | 'account-delete'
  | 'email-disabled'
  | 'email-enabled';

/**
 * Decoded Apple notification payload
 */
export interface AppleNotificationPayload extends JWTPayload {
  /** The type of event */
  events: string;
  /** The user's Apple ID (subject) */
  sub: string;
  /** The email address (may be private relay) */
  email?: string;
  /** Whether email is verified */
  email_verified?: boolean;
  /** Whether email is a private relay address */
  is_private_email?: boolean;
  /** Real user status (0 = unsupported, 1 = unknown, 2 = likely real) */
  real_user_status?: number;
}

/**
 * Parsed event from the events claim
 */
export interface AppleNotificationEvent {
  type: AppleNotificationEventType;
  sub: string;
  event_time: number;
  email?: string;
  is_private_email?: boolean;
}

/**
 * Result of processing a notification
 */
export interface NotificationResult {
  success: boolean;
  eventType?: AppleNotificationEventType;
  userId?: string;
  action?: string;
  error?: string;
}

// ============================================================================
// APPLE JWKS CONFIGURATION
// ============================================================================

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

// Cache the JWKS for performance
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getAppleJWKS() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }
  return jwksCache;
}

// ============================================================================
// JWT VERIFICATION
// ============================================================================

/**
 * Verify an Apple notification JWT
 *
 * Apple sends notifications as JWTs signed with their private key.
 * We verify using their public keys from the JWKS endpoint.
 */
export async function verifyAppleNotificationJWT(
  token: string
): Promise<AppleNotificationPayload | null> {
  const servicesId = process.env.APPLE_SIGNIN_SERVICES_ID;

  if (!servicesId) {
    log.error('APPLE_SIGNIN_SERVICES_ID not configured');
    return null;
  }

  try {
    const jwks = getAppleJWKS();

    const { payload } = await jwtVerify(token, jwks, {
      issuer: APPLE_ISSUER,
      audience: servicesId,
    });

    return payload as AppleNotificationPayload;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to verify Apple notification JWT');
    return null;
  }
}

/**
 * Parse the events claim from the notification
 *
 * The events claim is a JSON string containing the event details
 */
export function parseNotificationEvents(
  payload: AppleNotificationPayload
): AppleNotificationEvent | null {
  try {
    // The events claim is a JSON string
    const eventsData = JSON.parse(payload.events);

    // Extract the event type (first key in the object)
    const eventType = Object.keys(eventsData)[0] as AppleNotificationEventType;
    const eventDetails = eventsData[eventType];

    return {
      type: eventType,
      sub: payload.sub,
      event_time: eventDetails?.event_time || Date.now() / 1000,
      email: payload.email,
      is_private_email: payload.is_private_email,
    };
  } catch (error) {
    log.error({ error: String(error), events: payload.events }, 'Failed to parse events claim');
    return null;
  }
}

// ============================================================================
// USER LOOKUP
// ============================================================================

/**
 * Find a user by their Apple subject ID
 *
 * When a user signs in with Apple, we store their Apple 'sub' in Firestore
 * so we can look them up when we receive notifications
 */
export async function findUserByAppleSubject(appleSub: string): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available for Apple user lookup');
    return null;
  }

  try {
    // Query users by Apple subject ID
    const usersRef = db.collection('bogle_users');
    const snapshot = await usersRef.where('appleSubjectId', '==', appleSub).limit(1).get();

    if (snapshot.empty) {
      log.debug({ appleSub: appleSub.substring(0, 8) + '...' }, 'No user found for Apple subject');
      return null;
    }

    return snapshot.docs[0].id;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to look up user by Apple subject');
    return null;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle consent-revoked event
 *
 * User revoked their consent for the app to use their data
 * We should stop using their private relay email
 */
async function handleConsentRevoked(userId: string, event: AppleNotificationEvent): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .update(
        cleanForFirestore({
          'appleAuth.consentRevoked': true,
          'appleAuth.consentRevokedAt': new Date().toISOString(),
          'appleAuth.emailEnabled': false,
          updatedAt: new Date().toISOString(),
        })
      );

    log.info({ userId }, 'Marked Apple consent as revoked');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update consent status');
    throw error;
  }
}

/**
 * Handle account-delete event
 *
 * User deleted their Apple Account
 * We should delete all their data (GDPR compliance)
 */
async function handleAccountDelete(userId: string, event: AppleNotificationEvent): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    // Mark the account for deletion first (for audit trail)
    await db
      .collection('bogle_users')
      .doc(userId)
      .update(
        cleanForFirestore({
          'appleAuth.accountDeleted': true,
          'appleAuth.accountDeletedAt': new Date().toISOString(),
          scheduledForDeletion: true,
          scheduledDeletionAt: new Date().toISOString(),
          deletionReason: 'apple_account_deleted',
          updatedAt: new Date().toISOString(),
        })
      );

    log.warn({ userId }, 'Apple Account deleted - executing GDPR deletion');

    // Execute comprehensive GDPR deletion across all data stores
    try {
      const { getDataExportService } = await import('../data-export.js');
      const dataExportService = getDataExportService();
      await dataExportService.deleteAllData(userId);

      // Also delete Firebase user account
      try {
        const { deleteFirebaseUser } = await import('../identity/firebase-auth.js');
        await deleteFirebaseUser(userId);
        log.info({ userId: `${userId.substring(0, 8)}...` }, 'Firebase user deleted');
      } catch (firebaseErr) {
        log.warn(
          { error: String(firebaseErr), userId: `${userId.substring(0, 8)}...` },
          'Firebase user deletion failed (non-fatal)'
        );
      }

      // Mark deletion as complete
      await db
        .collection('bogle_users')
        .doc(userId)
        .update(
          cleanForFirestore({
            deletionCompletedAt: new Date().toISOString(),
            deletionStatus: 'completed',
          })
        );

      log.info({ userId: `${userId.substring(0, 8)}...` }, 'GDPR deletion completed for Apple account');
    } catch (deletionError) {
      log.error(
        { error: String(deletionError), userId: `${userId.substring(0, 8)}...` },
        'GDPR deletion failed - manual cleanup required'
      );

      // Mark as failed for manual review
      await db
        .collection('bogle_users')
        .doc(userId)
        .update(
          cleanForFirestore({
            deletionStatus: 'failed',
            deletionError: String(deletionError),
          })
        );

      throw deletionError;
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to handle account deletion');
    throw error;
  }
}

/**
 * Handle email-disabled event
 *
 * User disabled email forwarding for their private relay address
 */
async function handleEmailDisabled(userId: string, event: AppleNotificationEvent): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .update(
        cleanForFirestore({
          'appleAuth.emailEnabled': false,
          'appleAuth.emailDisabledAt': new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

    log.info({ userId }, 'Apple email forwarding disabled');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update email status');
    throw error;
  }
}

/**
 * Handle email-enabled event
 *
 * User re-enabled email forwarding for their private relay address
 */
async function handleEmailEnabled(userId: string, event: AppleNotificationEvent): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .update(
        cleanForFirestore({
          'appleAuth.emailEnabled': true,
          'appleAuth.emailEnabledAt': new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

    log.info({ userId }, 'Apple email forwarding enabled');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update email status');
    throw error;
  }
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process an Apple notification
 *
 * @param rawPayload - The raw JWT payload from Apple
 * @returns Result of processing
 */
export async function processAppleNotification(rawPayload: string): Promise<NotificationResult> {
  // Verify the JWT
  const payload = await verifyAppleNotificationJWT(rawPayload);
  if (!payload) {
    return { success: false, error: 'Invalid JWT signature' };
  }

  // Parse the events claim
  const event = parseNotificationEvents(payload);
  if (!event) {
    return { success: false, error: 'Failed to parse events' };
  }

  log.info(
    { eventType: event.type, appleSub: event.sub.substring(0, 8) + '...' },
    'Processing Apple notification'
  );

  // Find the user
  const userId = await findUserByAppleSubject(event.sub);
  if (!userId) {
    // User not found - this is OK, they may have never signed up
    log.debug(
      { appleSub: event.sub.substring(0, 8) + '...', eventType: event.type },
      'No user found for Apple notification'
    );
    return {
      success: true,
      eventType: event.type,
      action: 'no_user_found',
    };
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'consent-revoked':
        await handleConsentRevoked(userId, event);
        break;

      case 'account-delete':
        await handleAccountDelete(userId, event);
        break;

      case 'email-disabled':
        await handleEmailDisabled(userId, event);
        break;

      case 'email-enabled':
        await handleEmailEnabled(userId, event);
        break;

      default:
        log.warn({ eventType: event.type }, 'Unknown Apple notification event type');
    }

    return {
      success: true,
      eventType: event.type,
      userId,
      action: `handled_${event.type}`,
    };
  } catch (error) {
    return {
      success: false,
      eventType: event.type,
      userId,
      error: String(error),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processAppleNotification,
  verifyAppleNotificationJWT,
  parseNotificationEvents,
  findUserByAppleSubject,
};
