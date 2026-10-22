/**
 * User Contact Service
 *
 * Manages user contact information for proactive outreach.
 * This service is the source of truth for contact info,
 * used by both the outreach tools and the services layer.
 *
 * ARCHITECTURE NOTE: This service exists at Level 60 (services)
 * and can be imported by both tools (Level 70) and other services.
 *
 * The phone and email it hands out are only the account's verified ones: the
 * verified phone (userReach: a phone: id or a proved linked phone) and the
 * email Firebase verified. profile.contactInfo is written by saveContactInfo
 * from whatever the model heard, so its phone and email are never used to
 * reach anyone; the rest of it (preferred method, timezone) still is.
 */

import { getProfileStore } from '../../memory/profile-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { createReminder } from '../scheduling/reminder-scheduler.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import { userReach } from './user-reach.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface UserContactInfo {
  phone?: string;
  email?: string;
  preferredMethod?: 'sms' | 'email' | 'call' | 'voice_message';
  timezone?: string;
}

// In-memory cache (backed by Firestore when available). Its phone and email are
// what was saved, never handed out: getUserContactInfo swaps in the verified ones.
const userContactCache = new Map<string, UserContactInfo>();

/** The verified phone and email on the account, never the saved contactInfo ones. */
async function verifiedReach(userId: string): Promise<Pick<UserContactInfo, 'phone' | 'email'>> {
  const [reach, user] = await Promise.all([
    userReach(userId, 'sms', { standingOptIn: false }).catch((error: unknown) => {
      log.warn({ error: String(error), userId }, 'Could not look up the verified phone');
      return undefined;
    }),
    userId.startsWith('phone:') ? null : getFirebaseUser(userId),
  ]);
  return {
    phone: reach?.phone,
    email: user?.emailVerified ? (user.email ?? undefined) : undefined,
  };
}

// ============================================================================
// CONTACT INFO MANAGEMENT
// ============================================================================

/**
 * Store user's contact information for proactive outreach.
 * Persists to Firestore via user profile for cross-session continuity.
 */
export async function setUserContactInfo(
  userId: string,
  info: Partial<UserContactInfo>
): Promise<void> {
  // Update local cache
  const existing = userContactCache.get(userId) || {};
  const updated = { ...existing, ...info };
  userContactCache.set(userId, updated);

  // Persist to user profile in Firestore
  try {
    const store = await getProfileStore();
    const profile = await store.getProfile(userId);
    if (profile) {
      profile.contactInfo = {
        ...profile.contactInfo,
        phone: updated.phone,
        email: updated.email,
        preferredContactMethod: updated.preferredMethod,
        timezone: updated.timezone,
      };
      await store.saveProfile(profile);
      log.info(
        { userId, hasPhone: !!updated.phone, hasEmail: !!updated.email },
        '📱 User contact info persisted to profile'
      );
    } else {
      log.warn({ userId }, 'No profile found to persist contact info');
    }
  } catch (error) {
    // Log but don't fail - cache still works for current session
    log.warn({ error, userId }, 'Failed to persist contact info to profile');
  }
}

/**
 * Get user's contact information.
 * Checks cache first, then loads from profile if not found.
 */
export async function getUserContactInfo(userId: string): Promise<UserContactInfo | undefined> {
  const saved = await savedContactInfo(userId);
  const verified = await verifiedReach(userId);
  if (!saved && !verified.phone && !verified.email) return undefined;
  return { ...saved, ...verified };
}

/** What was saved (preferred method, timezone; phone and email ignored by callers). */
async function savedContactInfo(userId: string): Promise<UserContactInfo | undefined> {
  // Check cache first
  const cached = userContactCache.get(userId);
  if (cached) return cached;

  // Load from profile if not in cache
  try {
    const store = await getProfileStore();
    const profile = await store.getProfile(userId);
    if (profile?.contactInfo) {
      // Preferences only: the saved phone and email are never read back.
      const info: UserContactInfo = {
        preferredMethod: profile.contactInfo
          .preferredContactMethod as UserContactInfo['preferredMethod'],
        timezone: profile.contactInfo.timezone,
      };
      // Cache it for future lookups
      userContactCache.set(userId, info);
      return info;
    }
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load contact info from profile');
  }

  return undefined;
}

/**
 * Check if we can reach a user via a specific method.
 */
export async function canReachUser(
  userId: string,
  method: 'sms' | 'email' | 'call' = 'sms'
): Promise<boolean> {
  const contact = await getUserContactInfo(userId);
  if (!contact) return false;

  switch (method) {
    case 'sms':
    case 'call':
      return !!contact.phone;
    case 'email':
      return !!contact.email;
    default:
      return false;
  }
}

/**
 * Clear contact cache for a user (useful for testing or logout)
 */
export function clearContactCache(userId?: string): void {
  if (userId) {
    userContactCache.delete(userId);
  } else {
    userContactCache.clear();
  }
}

// ============================================================================
// SCHEDULING HELPERS
// ============================================================================

export const NO_VERIFIED_PHONE = 'No verified phone number on this account';
export const NO_VERIFIED_EMAIL = 'No verified email address on this account';

export interface ScheduleContactOptions {
  /** Contact ID for ML timing learning */
  contactId?: string;
  /** Contact name for display */
  contactName?: string;
  /** Whether this is a direct message TO the contact */
  isDirectToContact?: boolean;
}

/**
 * Schedule a future text message
 */
export async function scheduleText(
  userId: string,
  message: string,
  scheduledFor: Date,
  personaId = 'ferni',
  options?: ScheduleContactOptions
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);
  const deliveryPhone = contact?.phone; // the verified phone only
  if (!deliveryPhone) return { success: false, error: NO_VERIFIED_PHONE };

  try {
    const canonicalId = getCanonicalPersonaId(personaId);
    const displayName = getPersonaDisplayName(canonicalId);
    const firstName = displayName.split(' ')[0];

    const reminder = await createReminder({
      userId,
      message: `${message}\n\n— ${firstName}`,
      scheduledFor,
      timezone: contact?.timezone || 'America/New_York',
      deliveryMethod: 'sms',
      deliveryAddress: deliveryPhone,
      createdBy: canonicalId,
      personaId: canonicalId,
      // ML tracking
      contactId: options?.contactId,
      contactName: options?.contactName,
      isDirectToContact: options?.isDirectToContact,
    });

    log.info(
      {
        userId,
        reminderId: reminder.id,
        personaId: canonicalId,
        scheduledFor: scheduledFor.toISOString(),
        contactId: options?.contactId,
      },
      '📅 Text scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to schedule text');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Schedule a future email
 */
export async function scheduleEmail(
  userId: string,
  subject: string,
  message: string,
  scheduledFor: Date,
  personaId = 'ferni',
  options?: ScheduleContactOptions
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);
  const deliveryEmail = contact?.email; // the verified email only
  if (!deliveryEmail) return { success: false, error: NO_VERIFIED_EMAIL };

  try {
    const canonicalId = getCanonicalPersonaId(personaId);
    const displayName = getPersonaDisplayName(canonicalId);
    const firstName = displayName.split(' ')[0];

    const reminder = await createReminder({
      userId,
      message: `${message}\n\n— ${firstName}`,
      subject,
      scheduledFor,
      timezone: contact?.timezone || 'America/New_York',
      deliveryMethod: 'email',
      deliveryAddress: deliveryEmail,
      createdBy: canonicalId,
      personaId: canonicalId,
      // ML tracking
      contactId: options?.contactId,
      contactName: options?.contactName,
      isDirectToContact: options?.isDirectToContact,
    });

    log.info(
      {
        userId,
        reminderId: reminder.id,
        personaId: canonicalId,
        scheduledFor: scheduledFor.toISOString(),
        contactId: options?.contactId,
      },
      '📅 Email scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to schedule email');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Schedule a future phone call
 */
export async function scheduleCall(
  userId: string,
  message: string,
  scheduledFor: Date,
  personaId = 'ferni',
  options?: ScheduleContactOptions
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);
  const deliveryPhone = contact?.phone; // the verified phone only
  if (!deliveryPhone) return { success: false, error: NO_VERIFIED_PHONE };

  try {
    const canonicalId = getCanonicalPersonaId(personaId);
    const displayName = getPersonaDisplayName(canonicalId);
    const firstName = displayName.split(' ')[0];

    const reminder = await createReminder({
      userId,
      message,
      scheduledFor,
      timezone: contact?.timezone || 'America/New_York',
      deliveryMethod: 'call',
      deliveryAddress: deliveryPhone,
      createdBy: canonicalId,
      personaId: canonicalId,
      context: `Scheduled call from ${firstName}`,
      // ML tracking
      contactId: options?.contactId,
      contactName: options?.contactName,
      isDirectToContact: options?.isDirectToContact,
    });

    log.info(
      {
        userId,
        reminderId: reminder.id,
        personaId: canonicalId,
        scheduledFor: scheduledFor.toISOString(),
        contactId: options?.contactId,
      },
      '📅 Call scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to schedule call');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
