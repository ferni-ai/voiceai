/**
 * User Contact Service
 *
 * Manages user contact information for proactive outreach.
 * This service is the source of truth for contact info,
 * used by both the outreach tools and the services layer.
 *
 * ARCHITECTURE NOTE: This service exists at Level 60 (services)
 * and can be imported by both tools (Level 70) and other services.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getDefaultStore } from '../../memory/index.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { createReminder } from '../scheduling/reminder-scheduler.js';

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

// In-memory cache (backed by Firestore when available)
const userContactCache = new Map<string, UserContactInfo>();

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
    const store = getDefaultStore();
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
  // Check cache first
  const cached = userContactCache.get(userId);
  if (cached) return cached;

  // Load from profile if not in cache
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    if (profile?.contactInfo) {
      const info: UserContactInfo = {
        phone: profile.contactInfo.phone,
        email: profile.contactInfo.email,
        preferredMethod: profile.contactInfo.preferredContactMethod as UserContactInfo['preferredMethod'],
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

/**
 * Get cached contact info without async lookup (for performance-critical paths)
 */
export function getCachedContactInfo(userId: string): UserContactInfo | undefined {
  return userContactCache.get(userId);
}

// ============================================================================
// SCHEDULING HELPERS
// ============================================================================

export interface ScheduleContactOptions {
  /** Contact ID for ML timing learning */
  contactId?: string;
  /** Contact name for display */
  contactName?: string;
  /** Whether this is a direct message TO the contact */
  isDirectToContact?: boolean;
  /** Phone to send to (overrides user's saved contact) */
  toPhone?: string;
  /** Email to send to (overrides user's saved contact) */
  toEmail?: string;
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
  // Use provided phone or fall back to user's saved contact
  const deliveryPhone = options?.toPhone || (await getUserContactInfo(userId))?.phone;
  const contact = await getUserContactInfo(userId);

  if (!deliveryPhone) {
    return { success: false, error: 'No phone number on file. Ask for their number first!' };
  }

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
  const deliveryEmail = options?.toEmail || (await getUserContactInfo(userId))?.email;
  const contact = await getUserContactInfo(userId);

  if (!deliveryEmail) {
    return { success: false, error: 'No email address on file. Ask for their email first!' };
  }

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
  const deliveryPhone = options?.toPhone || (await getUserContactInfo(userId))?.phone;
  const contact = await getUserContactInfo(userId);

  if (!deliveryPhone) {
    return { success: false, error: 'No phone number on file. Ask for their number first!' };
  }

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

