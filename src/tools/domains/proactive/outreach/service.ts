/**
 * Proactive Outreach Service - Agent to User Communication
 *
 * Core service functions for agents (Ferni, Maya, Alex, etc.) to proactively
 * reach out to USERS via:
 * - SMS text messages
 * - Email
 * - Phone calls (with voice message using persona voices via Cartesia TTS)
 *
 * Use cases:
 * - Reminders ("I'll text you tomorrow at 9am about your interview")
 * - Follow-ups ("Let me check in with you next week about your progress")
 * - Celebrations ("I'll send you a congrats when you hit your goal!")
 * - Accountability ("I'll call you if you haven't logged your workout by 8pm")
 *
 * NOTE: This is for Agent → User communication.
 * For User → Contact communication, see: communication/outreach/
 *
 * The user's contact info is stored in their profile and persisted to Firestore.
 *
 * @module proactive/outreach/service
 */

import { getProfileStore } from '../../../../memory/profile-store.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import {
  createReminder,
  startReminderScheduler,
  type ReminderDeliveryMethod,
} from '../../../../services/scheduling/reminder-scheduler.js';
import { sendEmail } from '../../../../services/communication-service.js';
import { callWithPersonaVoice } from '../../../../services/voice/voice-call.js';
import {
  getPersonaDisplayName,
  getCanonicalPersonaId,
} from '../../../../personas/voice-registry.js';
import { recordOutcome } from '../../../../services/contacts/optimal-timing.js';
import { cleanForFirestore } from '../../../../utils/firestore-utils.js';
import { getCallUserPort } from './call-user-port.js';

/**
 * The number we text or ring the user on: the verified phone (the call-user port, as callUser
 * uses), never contactInfo.phone, which saveContactInfo writes from whatever the model heard.
 */
const verifiedPhone = async (userId: string): Promise<string | undefined> =>
  getCallUserPort()?.verifiedPhone(userId);
/** The same for email: only the address Firebase verified, never contactInfo.email. */
const verifiedEmail = async (userId: string): Promise<string | undefined> =>
  getCallUserPort()?.verifiedEmail?.(userId);
export const NO_VERIFIED_PHONE = 'No verified phone number on this account';
export const NO_VERIFIED_EMAIL = 'No verified email address on this account';
/** What saveContactInfo says: a saved number or address is never used to reach them. */
export const SAVED_NOT_VERIFIED =
  'I only text, call or email the phone number and email verified on your account, so if this is new, verify it in Settings first.';

/** A Twilio call in the persona's voice (Cartesia, else Twilio's); a held userId stops it. */
async function makePhoneCall(
  phone: string,
  message: string,
  personaId: string,
  userId: string
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  try {
    const result = await callWithPersonaVoice(phone, message, personaId, {
      fallbackToTwilioVoice: true,
      ownerUid: userId,
      userId,
    });
    if (result.success) return { success: true, callSid: result.callSid };
    return { success: false, error: result.message };
  } catch (error) {
    getLogger().error({ error, personaId }, 'makePhoneCall failed');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// --- TYPES ---

export interface UserContactInfo {
  phone?: string;
  email?: string;
  preferredMethod?: 'sms' | 'email' | 'call' | 'voice_message';
  timezone?: string;
}

export interface OutreachRequest {
  userId: string;
  agentId: string;
  type: 'reminder' | 'follow_up' | 'check_in' | 'celebration' | 'accountability';
  message: string;
  scheduledFor: Date;
  method: ReminderDeliveryMethod;
  contactInfo: UserContactInfo;
  context?: string;
}

// In-memory cache (backed by Firestore when available)
const userContactCache = new Map<string, UserContactInfo>();

// ============================================================================
// CONTACT INFO MANAGEMENT (Persisted to UserProfile)
// ============================================================================

/**
 * Store user's contact information for proactive outreach.
 * Persists to Firestore via user profile for cross-session continuity.
 */
export async function setUserContactInfo(
  userId: string,
  info: Partial<UserContactInfo>
): Promise<void> {
  const existing = userContactCache.get(userId) || {};
  const updated = { ...existing, ...info };
  userContactCache.set(userId, updated);

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
      getLogger().info(
        { userId, hasPhone: !!updated.phone, hasEmail: !!updated.email },
        '📱 User contact info persisted to profile'
      );
    } else {
      getLogger().warn({ userId }, 'No profile found to persist contact info');
    }
  } catch (error) {
    // Log but don't fail - cache still works for current session
    getLogger().warn({ error, userId }, 'Failed to persist contact info to profile');
  }
}

/**
 * The user's contact info: the verified phone and email (the call-user port), with the
 * saved preferred method and timezone. The saved phone and email are never handed out.
 */
export async function getUserContactInfo(userId: string): Promise<UserContactInfo | undefined> {
  const saved = await savedContactInfo(userId);
  const [phone, email] = await Promise.all([verifiedPhone(userId), verifiedEmail(userId)]);
  return saved || phone || email ? { ...saved, phone, email } : undefined;
}

/** What saveContactInfo stored (cached); only its preferred method and timezone are used. */
async function savedContactInfo(userId: string): Promise<UserContactInfo | undefined> {
  const cached = userContactCache.get(userId);
  if (cached) return cached;

  try {
    const store = await getProfileStore();
    const profile = await store.getProfile(userId);
    if (profile?.contactInfo) {
      // Preferences only: the saved phone and email are never read back.
      const info: UserContactInfo = {
        preferredMethod: profile.contactInfo.preferredContactMethod,
        timezone: profile.contactInfo.timezone,
      };
      userContactCache.set(userId, info);
      return info;
    }
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load contact info from profile');
  }

  return undefined;
}

/**
 * Check if we can reach the user (async - loads from profile if needed)
 */
export async function canReachUser(
  userId: string,
  method?: ReminderDeliveryMethod
): Promise<boolean> {
  const info = await getUserContactInfo(userId);
  if (!info) return false;

  if (method === 'sms' || method === 'call' || method === 'voice_message') {
    return !!(await verifiedPhone(userId));
  }
  if (method === 'email') {
    return !!(await verifiedEmail(userId));
  }

  // Any method - check if we have any contact info
  return !!(await verifiedPhone(userId)) || !!(await verifiedEmail(userId));
}

// ============================================================================
// IMMEDIATE OUTREACH
// ============================================================================

/** Options for immediate sends with contact ML tracking */
export interface ImmediateContactOptions {
  /** Contact ID for ML timing learning (if this message is ABOUT a contact) */
  contactId?: string;
  /** If true, this is a direct message TO the contact (not to user about contact) */
  isDirectToContact?: boolean;
  /** They asked for this text just now ("text me that"), so quiet hours don't hold it. */
  askedNow?: boolean;
}

/**
 * Send an immediate text message to the user, through the guarded sender (STOP, texts off)
 */
export async function textUser(
  userId: string,
  message: string,
  personaId = 'ferni',
  options?: ImmediateContactOptions
): Promise<{ success: boolean; error?: string }> {
  const phone = await verifiedPhone(userId);
  if (!phone) return { success: false, error: NO_VERIFIED_PHONE };

  try {
    // Get the persona's display name for the signature
    const canonicalId = getCanonicalPersonaId(personaId);
    const displayName = getPersonaDisplayName(canonicalId);
    const firstName = displayName.split(' ')[0];

    const body = `${message}\n\n— ${firstName}`;
    const askedNow = options?.askedNow === true;
    const text = await getCallUserPort()?.textOwner?.(userId, body, { askedNow });
    if (!text?.sent) return { success: false, error: text?.reason ?? 'no guarded sender here' };

    getLogger().info({ userId, personaId: canonicalId }, '📱 Text sent to user');

    // Record outcome for ML timing learning if this message is about a contact
    if (options?.contactId) {
      try {
        await recordOutcome(userId, {
          contactId: options.contactId,
          sentAt: new Date(),
          channel: 'sms',
          gotResponse: false, // Will be updated via webhooks if they respond
        });
        getLogger().debug(
          { contactId: options.contactId, channel: 'sms' },
          '📊 Recorded immediate text outcome for timing ML'
        );
      } catch (mlError) {
        // Don't fail the send if ML tracking fails
        getLogger().warn({ error: String(mlError) }, 'Failed to record timing outcome');
      }
    }

    return { success: true };
  } catch (error) {
    getLogger().error({ error, userId, personaId }, 'Failed to text user');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send an immediate email to the user
 */
export async function emailUser(
  userId: string,
  subject: string,
  message: string,
  personaId = 'ferni',
  options?: ImmediateContactOptions
): Promise<{ success: boolean; error?: string }> {
  const email = await verifiedEmail(userId);
  if (!email) return { success: false, error: NO_VERIFIED_EMAIL };

  try {
    // Get the persona's display name for the signature
    const canonicalId = getCanonicalPersonaId(personaId);
    const displayName = getPersonaDisplayName(canonicalId);
    const firstName = displayName.split(' ')[0];

    const fullMessage = `${message}\n\n— ${firstName}`;
    const result = await sendEmail(email, subject, fullMessage);

    if (result.includes('trouble') || result.includes('error')) {
      return { success: false, error: result };
    }

    getLogger().info({ userId, personaId: canonicalId }, '📧 Email sent to user');

    // Record outcome for ML timing learning if this message is about a contact
    if (options?.contactId) {
      try {
        await recordOutcome(userId, {
          contactId: options.contactId,
          sentAt: new Date(),
          channel: 'email',
          gotResponse: false, // Will be updated via webhooks if they respond
        });
        getLogger().debug(
          { contactId: options.contactId, channel: 'email' },
          '📊 Recorded immediate email outcome for timing ML'
        );
      } catch (mlError) {
        // Don't fail the send if ML tracking fails
        getLogger().warn({ error: String(mlError) }, 'Failed to record timing outcome');
      }
    }

    return { success: true };
  } catch (error) {
    getLogger().error({ error, userId, personaId }, 'Failed to email user');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Call the user immediately using the specified persona's voice
 */
export async function callUser(
  userId: string,
  message: string,
  personaId = 'ferni',
  options?: ImmediateContactOptions
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  const phone = await verifiedPhone(userId);
  if (!phone) return { success: false, error: NO_VERIFIED_PHONE };

  try {
    // Normalize persona ID and use for voice
    const canonicalPersonaId = getCanonicalPersonaId(personaId);
    const result = await makePhoneCall(phone, message, canonicalPersonaId, userId);

    if ('error' in result) {
      return { success: false, error: result.error };
    }

    getLogger().info(
      { userId, personaId: canonicalPersonaId, callSid: result.callSid },
      '📞 Call initiated to user'
    );

    // Record outcome for ML timing learning if this message is about a contact
    if (options?.contactId) {
      try {
        await recordOutcome(userId, {
          contactId: options.contactId,
          sentAt: new Date(),
          channel: 'voice',
          gotResponse: false, // Will be updated via call completion webhooks
        });
        getLogger().debug(
          { contactId: options.contactId, channel: 'voice' },
          '📊 Recorded immediate call outcome for timing ML'
        );
      } catch (mlError) {
        // Don't fail the call if ML tracking fails
        getLogger().warn({ error: String(mlError) }, 'Failed to record timing outcome');
      }
    }

    return { success: true, callSid: result.callSid };
  } catch (error) {
    getLogger().error({ error, userId, personaId }, 'Failed to call user');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// SCHEDULED OUTREACH
// ============================================================================

/** Options for scheduling with contact ML tracking */
export interface ScheduleContactOptions {
  /** Contact ID for ML timing learning */
  contactId?: string;
  /** Contact name for display */
  contactName?: string;
  /** If true, message goes directly TO the contact (not as reminder to self) */
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
  const deliveryPhone = await verifiedPhone(userId);
  const contact = await getUserContactInfo(userId);

  if (!deliveryPhone) {
    return { success: false, error: NO_VERIFIED_PHONE };
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

    getLogger().info(
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
    getLogger().error({ error, userId, personaId }, 'Failed to schedule text');
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
  const deliveryEmail = await verifiedEmail(userId);
  const contact = await getUserContactInfo(userId);

  if (!deliveryEmail) {
    return { success: false, error: NO_VERIFIED_EMAIL };
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

    getLogger().info(
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
    getLogger().error({ error, userId, personaId }, 'Failed to schedule email');
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
  const deliveryPhone = await verifiedPhone(userId);
  const contact = await getUserContactInfo(userId);

  if (!deliveryPhone) {
    return { success: false, error: NO_VERIFIED_PHONE };
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

    getLogger().info(
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
    getLogger().error({ error, userId, personaId }, 'Failed to schedule call');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let schedulerStarted = false;

/**
 * Initialize proactive outreach system
 * Call this when the agent starts
 */
export function initializeProactiveOutreach(): void {
  if (schedulerStarted) return;

  // Start the reminder scheduler (checks for due reminders every minute)
  startReminderScheduler(60000);
  schedulerStarted = true;

  getLogger().info('🚀 Proactive outreach system initialized');
}

export default {
  // Contact management
  setUserContactInfo,
  getUserContactInfo,
  canReachUser,

  // Immediate outreach
  textUser,
  emailUser,
  callUser,

  // Scheduled outreach
  scheduleText,
  scheduleEmail,
  scheduleCall,

  // Initialization
  initializeProactiveOutreach,
};
