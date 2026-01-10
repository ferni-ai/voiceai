/**
 * Reminder Scheduler Service
 *
 * Handles persistent storage and scheduled delivery of reminders.
 * Supports SMS, email, phone calls, and voice messages.
 *
 * Storage: Firestore
 * Scheduling: In-memory polling (production would use Cloud Tasks/Scheduler)
 */

import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  removeCalendarSyncedItem,
  syncReminderToCalendar,
  syncScheduledCallToCalendar,
  syncScheduledEmailToCalendar,
  syncScheduledTextToCalendar,
} from '../calendar/calendar-bridge.js';

// Firestore access via superhuman firestore-utils for proper db instance
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onReminderChange } from '../data-layer/hooks/index.js';
import { sendEmail, sendReminder as sendReminderSMS, sendSMS } from '../communication-service.js';
import { recordOutcome } from '../contacts/optimal-timing.js';

// Logger instance for use throughout this module
const logger = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type ReminderDeliveryMethod = 'sms' | 'email' | 'call' | 'voice_message';

export interface ScheduledReminder {
  id: string;
  userId: string;

  // Content
  message: string;
  subject?: string; // For emails
  context?: string; // Additional context

  // Scheduling
  scheduledFor: Date;
  timezone: string;

  // Delivery
  deliveryMethod: ReminderDeliveryMethod;
  deliveryAddress: string; // Phone or email

  // Contact tracking (for ML timing learning)
  /** If this reminder is about reaching out to a contact, track their ID */
  contactId?: string;
  /** Name of the contact for display purposes */
  contactName?: string;
  /** Whether this is a direct message TO the contact (vs. reminder to self about contact) */
  isDirectToContact?: boolean;

  // Family coordination (for family-created reminders)
  /**
   * Sponsored identity ID if this reminder was created by a family phone caller.
   * When set, Ferni will attribute the reminder: "Your mom wanted me to remind you..."
   */
  sourceIdentityId?: string;
  /** Display name of the source for attribution (e.g., "Mom") */
  sourceIdentityName?: string;
  /** Relationship of source to user (e.g., "mother") */
  sourceRelationship?: string;

  // Status
  status: 'pending' | 'delivered' | 'failed' | 'cancelled';
  attempts: number;
  lastAttempt?: Date;
  error?: string;

  // Metadata
  createdAt: Date;
  createdBy: string; // Which persona created it (alex-chen, maya-santos, ferni, etc.)
  /** Persona ID for voice/formatting - defaults to createdBy if not set */
  personaId?: string;
}

export interface VoiceMessage {
  id: string;
  userId: string;
  message: string;
  voiceId?: string; // TTS voice to use
  audioUrl?: string; // Generated audio URL
  deliveredAt?: Date;
  status: 'generating' | 'ready' | 'sent' | 'failed';
}

// ============================================================================
// REMINDER STORAGE
// ============================================================================

// In-memory fallback storage for reminders
const reminderStore = new Map<string, ScheduledReminder>();
const voiceMessageStore = new Map<string, VoiceMessage>();

// ============================================================================
// REMINDER CRUD OPERATIONS
// ============================================================================

/**
 * Create and schedule a new reminder
 */
export async function createReminder(params: {
  userId: string;
  message: string;
  subject?: string;
  context?: string;
  scheduledFor: Date;
  timezone?: string;
  deliveryMethod: ReminderDeliveryMethod;
  deliveryAddress: string;
  createdBy?: string;
  personaId?: string;
  // Contact tracking for ML timing
  contactId?: string;
  contactName?: string;
  isDirectToContact?: boolean;
  // Family coordination - for reminders created by family phone callers
  sourceIdentityId?: string;
  sourceIdentityName?: string;
  sourceRelationship?: string;
}): Promise<ScheduledReminder> {
  const reminder: ScheduledReminder = {
    id: `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: params.userId,
    message: params.message,
    subject: params.subject,
    context: params.context,
    scheduledFor: params.scheduledFor,
    timezone: params.timezone || 'America/New_York',
    deliveryMethod: params.deliveryMethod,
    deliveryAddress: params.deliveryAddress,
    // Contact tracking for ML
    contactId: params.contactId,
    contactName: params.contactName,
    isDirectToContact: params.isDirectToContact,
    // Family coordination
    sourceIdentityId: params.sourceIdentityId,
    sourceIdentityName: params.sourceIdentityName,
    sourceRelationship: params.sourceRelationship,
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
    createdBy: params.createdBy || 'alex',
    personaId: params.personaId,
  };

  // Store in memory map
  reminderStore.set(reminder.id, reminder);

  // Persist to Firestore for cross-session durability
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(params.userId)
        .collection('reminders')
        .doc(reminder.id)
        .set(
          cleanForFirestore({
            ...reminder,
            scheduledFor: reminder.scheduledFor.toISOString(),
            createdAt: reminder.createdAt.toISOString(),
          })
        );
      getLogger().info(
        { reminderId: reminder.id, userId: params.userId },
        '📅 Reminder saved to Firestore'
      );

      // Index to semantic memory
      void onReminderChange(
        params.userId,
        reminder.id,
        {
          title: reminder.message,
          description: reminder.context,
          scheduledFor: reminder.scheduledFor.toISOString(),
          recurrence: 'none',
          priority: undefined,
          status: reminder.status === 'pending' ? 'pending' : 'completed',
        },
        'create'
      );
    }
  } catch (error) {
    // Firestore not available, using in-memory only
    getLogger().warn(
      { error: String(error) },
      'Firestore not available for reminders, using in-memory'
    );
  }

  getLogger().info(
    {
      reminderId: reminder.id,
      userId: params.userId,
      scheduledFor: params.scheduledFor.toISOString(),
      method: params.deliveryMethod,
    },
    '📅 Reminder scheduled'
  );

  // Sync to calendar for unified visibility
  // Use the appropriate sync function based on delivery method and contact info
  // This ensures ALL scheduled items appear on the user's calendar
  try {
    let calendarResult;

    // For scheduled messages TO contacts, use specific sync functions for better visibility
    if (params.isDirectToContact && params.contactName) {
      switch (reminder.deliveryMethod) {
        case 'sms':
        case 'voice_message':
          calendarResult = await syncScheduledTextToCalendar(
            params.userId,
            reminder.id,
            params.contactName,
            params.message,
            params.scheduledFor,
            params.createdBy
          );
          break;
        case 'email':
          calendarResult = await syncScheduledEmailToCalendar(
            params.userId,
            reminder.id,
            params.contactName,
            params.subject || params.message.substring(0, 50),
            params.scheduledFor,
            params.createdBy
          );
          break;
        case 'call':
          calendarResult = await syncScheduledCallToCalendar(
            params.userId,
            reminder.id,
            params.contactName,
            params.context || 'Scheduled call',
            params.scheduledFor,
            15, // Default 15 min duration for calls
            params.createdBy
          );
          break;
        default:
          calendarResult = await syncReminderToCalendar(
            params.userId,
            reminder.id,
            params.message,
            params.scheduledFor,
            params.createdBy
          );
      }
    } else {
      // For personal reminders, use the generic reminder sync
      calendarResult = await syncReminderToCalendar(
        params.userId,
        reminder.id,
        params.message,
        params.scheduledFor,
        params.createdBy
      );
    }

    if (calendarResult.success) {
      getLogger().info(
        {
          reminderId: reminder.id,
          calendarEventId: calendarResult.calendarEventId,
          type: params.isDirectToContact ? `scheduled_${reminder.deliveryMethod}` : 'reminder',
        },
        '📅 Scheduled item synced to calendar'
      );
    } else if (calendarResult.conflicts && calendarResult.conflicts.length > 0) {
      getLogger().warn(
        {
          reminderId: reminder.id,
          conflicts: calendarResult.conflicts.length,
        },
        '⚠️ Scheduled item created with calendar conflicts'
      );
    }
  } catch (calendarError) {
    // Don't fail reminder creation if calendar sync fails
    getLogger().warn(
      { error: String(calendarError), reminderId: reminder.id },
      '⚠️ Failed to sync to calendar (item still created)'
    );
  }

  return reminder;
}

/**
 * Get all pending reminders for a user (from memory and Firestore)
 */
export function getPendingReminders(userId: string): ScheduledReminder[] {
  const reminders: ScheduledReminder[] = [];
  for (const reminder of reminderStore.values()) {
    if (reminder.userId === userId && reminder.status === 'pending') {
      reminders.push(reminder);
    }
  }
  return reminders.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

/**
 * Load pending reminders from Firestore into memory (call on startup)
 */
export async function loadRemindersFromFirestore(userId?: string): Promise<number> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return 0;

    // If userId is provided, query only that user's reminders
    // Otherwise, we can't query collectionGroup without proper indexes, so return 0
    if (!userId) {
      getLogger().debug('loadRemindersFromFirestore requires userId for scoped queries');
      return 0;
    }

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reminders')
      .where('status', '==', 'pending')
      .get();

    let loadedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const reminder: ScheduledReminder = {
        id: doc.id,
        userId: data.userId,
        message: data.message,
        subject: data.subject,
        context: data.context,
        scheduledFor: new Date(data.scheduledFor),
        timezone: data.timezone || 'America/New_York',
        deliveryMethod: data.deliveryMethod,
        deliveryAddress: data.deliveryAddress,
        contactId: data.contactId,
        contactName: data.contactName,
        isDirectToContact: data.isDirectToContact,
        status: data.status,
        attempts: data.attempts || 0,
        lastAttempt: data.lastAttempt ? new Date(data.lastAttempt) : undefined,
        error: data.error,
        createdAt: new Date(data.createdAt),
        createdBy: data.createdBy || 'ferni',
        personaId: data.personaId,
      };

      // Only load if not already in memory and still pending
      if (!reminderStore.has(reminder.id) && reminder.scheduledFor > new Date()) {
        reminderStore.set(reminder.id, reminder);
        loadedCount++;
      }
    }

    if (loadedCount > 0) {
      getLogger().info({ loadedCount, userId }, '📥 Loaded pending reminders from Firestore');
    }

    return loadedCount;
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to load reminders from Firestore');
    return 0;
  }
}

/**
 * Get all reminders that are due for delivery
 */
export function getDueReminders(): ScheduledReminder[] {
  const now = new Date();
  const due: ScheduledReminder[] = [];

  for (const reminder of reminderStore.values()) {
    if (reminder.status === 'pending' && reminder.scheduledFor <= now) {
      due.push(reminder);
    }
  }

  return due;
}

/**
 * Cancel a reminder
 */
export async function cancelReminder(reminderId: string): Promise<boolean> {
  const reminder = reminderStore.get(reminderId);
  if (reminder && reminder.status === 'pending') {
    reminder.status = 'cancelled';
    reminderStore.set(reminderId, reminder);
    getLogger().info({ reminderId }, '❌ Reminder cancelled');

    // Also update in Firestore
    try {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      const db = getFirestoreDb();
      if (db) {
        await db
          .collection('bogle_users')
          .doc(reminder.userId)
          .collection('reminders')
          .doc(reminderId)
          .update({ status: 'cancelled' });
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error), reminderId },
        'Failed to update reminder status in Firestore'
      );
    }

    // Also remove from calendar
    try {
      await removeCalendarSyncedItem(reminder.userId, reminderId);
      getLogger().info({ reminderId }, '📅 Reminder removed from calendar');
    } catch (calendarError) {
      getLogger().warn(
        { error: String(calendarError), reminderId },
        '⚠️ Failed to remove reminder from calendar'
      );
    }

    return true;
  }
  return false;
}

/**
 * Update reminder status after delivery attempt
 */
async function updateReminderStatus(
  reminderId: string,
  status: 'delivered' | 'failed',
  error?: string
): Promise<void> {
  const reminder = reminderStore.get(reminderId);
  if (reminder) {
    reminder.status = status;
    reminder.attempts += 1;
    reminder.lastAttempt = new Date();
    if (error) reminder.error = error;
    reminderStore.set(reminderId, reminder);

    // Also update in Firestore
    try {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      const db = getFirestoreDb();
      if (db) {
        const updateData: Record<string, unknown> = {
          status,
          attempts: reminder.attempts,
          lastAttempt: reminder.lastAttempt.toISOString(),
        };
        if (error) updateData.error = error;

        await db
          .collection('bogle_users')
          .doc(reminder.userId)
          .collection('reminders')
          .doc(reminderId)
          .update(updateData);
      }
    } catch (firestoreError) {
      getLogger().warn(
        { error: String(firestoreError), reminderId },
        'Failed to update reminder status in Firestore'
      );
    }
  }
}

// ============================================================================
// DELIVERY FUNCTIONS
// ============================================================================

/**
 * Deliver a reminder via the appropriate channel
 */
export async function deliverReminder(reminder: ScheduledReminder): Promise<boolean> {
  getLogger().info(
    {
      reminderId: reminder.id,
      method: reminder.deliveryMethod,
      address: reminder.deliveryAddress.replace(/.{4}$/, '****'),
    },
    '📤 Delivering reminder'
  );

  try {
    switch (reminder.deliveryMethod) {
      case 'sms': {
        const smsResult = await sendReminderSMS(
          reminder.deliveryAddress,
          reminder.message,
          reminder.context
        );
        if (smsResult.includes('trouble') || smsResult.includes('error')) {
          throw new Error(smsResult);
        }
        break;
      }

      case 'email': {
        // Use persona-specific email formatting
        const { getPersonaDisplayName } = await import('../../personas/voice-registry.js');
        const personaId = reminder.personaId || reminder.createdBy || 'ferni';
        const displayName = getPersonaDisplayName(personaId);
        const firstName = displayName.split(' ')[0];

        const emailResult = await sendEmail(
          reminder.deliveryAddress,
          reminder.subject || `⏰ Reminder from ${firstName}`,
          `${reminder.message}\n\n${reminder.context ? `Context: ${reminder.context}\n\n` : ''}— ${firstName}`
        );
        if (emailResult.includes('trouble') || emailResult.includes('error')) {
          throw new Error(emailResult);
        }
        break;
      }

      case 'call': {
        // Outbound call using persona's Cartesia voice
        const { callWithPersonaVoice } = await import('../voice/voice-call.js');
        const personaId = reminder.personaId || reminder.createdBy || 'ferni';

        const callResult = await callWithPersonaVoice(
          reminder.deliveryAddress,
          reminder.message,
          personaId,
          { fallbackToTwilioVoice: true }
        );
        if (!callResult.success) {
          throw new Error(callResult.message);
        }
        logger.info({ callSid: callResult.callSid, personaId }, '📞 Reminder call initiated');
        break;
      }

      case 'voice_message': {
        // Generate voice message with persona's Cartesia voice and send via MMS
        const { generatePersonaVoice } = await import('../voice/voice-call.js');
        const { getPersonaDisplayName } = await import('../../personas/voice-registry.js');
        const personaId = reminder.personaId || reminder.createdBy || 'ferni';
        const displayName = getPersonaDisplayName(personaId);
        const firstName = displayName.split(' ')[0];

        const audioBuffer = await generatePersonaVoice(reminder.message, personaId);

        if (audioBuffer) {
          // Try to upload to GCS and send via MMS
          const GCS_BUCKET =
            process.env.GCS_VOICE_BUCKET ||
            (process.env.GOOGLE_CLOUD_PROJECT
              ? `${process.env.GOOGLE_CLOUD_PROJECT}-voice-audio`
              : '');

          let audioUrl: string | null = null;

          if (GCS_BUCKET) {
            try {
              const gcs = await import('@google-cloud/storage');
              interface GcsModule {
                Storage?: new () => {
                  bucket: (name: string) => {
                    file: (path: string) => { save: (data: Buffer, opts: object) => Promise<void> };
                  };
                };
                default?: {
                  Storage?: new () => {
                    bucket: (name: string) => {
                      file: (path: string) => {
                        save: (data: Buffer, opts: object) => Promise<void>;
                      };
                    };
                  };
                };
              }
              const Storage = (gcs as GcsModule).Storage || (gcs as GcsModule).default?.Storage;
              if (Storage) {
                const storage = new Storage();
                const bucket = storage.bucket(GCS_BUCKET);
                const filename = `voice-reminders/${reminder.id}.mp3`;
                const file = bucket.file(filename);

                await file.save(audioBuffer, {
                  metadata: { contentType: 'audio/mpeg' },
                  public: true,
                });

                audioUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`;
                logger.info(
                  { reminderId: reminder.id, audioUrl },
                  '🎤 Voice audio uploaded to GCS'
                );
              }
            } catch (gcsError) {
              logger.warn({ error: String(gcsError) }, 'GCS upload failed, falling back to SMS');
            }
          }

          // If we have an audio URL, send via MMS
          if (audioUrl) {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const fromNumber = process.env.TWILIO_PHONE_NUMBER;

            if (accountSid && authToken && fromNumber) {
              const cleanPhone = reminder.deliveryAddress.replace(/\D/g, '');
              const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

              const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
              const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    To: e164Phone,
                    From: fromNumber,
                    Body: `🎤 Voice message from ${firstName}`,
                    MediaUrl: audioUrl,
                  }),
                }
              );

              if (response.ok) {
                logger.info({ personaId, audioUrl }, '🎤 Voice message sent via MMS');
                break;
              } else {
                const errorText = await response.text();
                logger.warn({ error: errorText }, 'MMS send failed, falling back to SMS');
              }
            }
          }

          // Fallback to SMS with text if MMS failed
          await sendSMS(
            reminder.deliveryAddress,
            `🎤 Voice message from ${firstName}: "${reminder.message}"`
          );
          logger.info({ personaId }, '🎤 Voice message sent as SMS (MMS unavailable)');
        } else {
          // Fallback if TTS fails
          await sendSMS(
            reminder.deliveryAddress,
            `🎤 Voice message from ${firstName}: "${reminder.message}"`
          );
          logger.info({ personaId }, '🎤 Voice message sent as SMS (TTS unavailable)');
        }
        break;
      }

      default:
        throw new Error(`Unknown delivery method: ${reminder.deliveryMethod}`);
    }

    await updateReminderStatus(reminder.id, 'delivered');
    getLogger().info({ reminderId: reminder.id }, '✅ Reminder delivered');

    // Record outcome for ML timing learning (if this reminder is about a contact)
    if (reminder.contactId && reminder.isDirectToContact) {
      try {
        const channel =
          reminder.deliveryMethod === 'sms' || reminder.deliveryMethod === 'voice_message'
            ? 'sms'
            : reminder.deliveryMethod === 'email'
              ? 'email'
              : 'voice';

        await recordOutcome(reminder.userId, {
          contactId: reminder.contactId,
          sentAt: new Date(),
          channel,
          gotResponse: false, // Will be updated when/if they respond
        });

        getLogger().debug(
          { contactId: reminder.contactId, channel },
          '📊 Recorded outcome for timing ML'
        );
      } catch (error) {
        // Don't fail delivery if ML tracking fails
        getLogger().warn({ error: String(error) }, 'Failed to record timing outcome');
      }
    }

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateReminderStatus(reminder.id, 'failed', errorMsg);
    getLogger().error({ reminderId: reminder.id, error: errorMsg }, '❌ Reminder delivery failed');
    return false;
  }
}

// ============================================================================
// VOICE MESSAGE FUNCTIONS
// ============================================================================

/**
 * Create a voice message using TTS
 * Actually generates audio using Cartesia TTS and uploads to GCS
 */
export async function createVoiceMessage(params: {
  userId: string;
  message: string;
  voiceId?: string;
}): Promise<VoiceMessage> {
  const voiceMessage: VoiceMessage = {
    id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: params.userId,
    message: params.message,
    voiceId: params.voiceId,
    status: 'generating',
  };

  voiceMessageStore.set(voiceMessage.id, voiceMessage);

  getLogger().info(
    { voiceMessageId: voiceMessage.id },
    '🎤 Voice message generating with Cartesia TTS'
  );

  try {
    // Generate audio with Cartesia TTS
    const { generateAlexVoice } = await import('../voice/voice-call.js');
    const audioBuffer = await generateAlexVoice(params.message);

    if (audioBuffer) {
      // Try to upload to GCS for public URL
      const GCS_BUCKET =
        process.env.GCS_VOICE_BUCKET ||
        (process.env.GOOGLE_CLOUD_PROJECT ? `${process.env.GOOGLE_CLOUD_PROJECT}-voice-audio` : '');

      if (GCS_BUCKET) {
        try {
          const gcs = await import('@google-cloud/storage');

          interface GcsModule {
            Storage?: new () => any;
            default?: { Storage?: new () => any };
          }
          const Storage = (gcs as GcsModule).Storage || (gcs as GcsModule).default?.Storage;
          if (Storage) {
            const storage = new Storage();
            const bucket = storage.bucket(GCS_BUCKET);
            const filename = `voice-messages/${voiceMessage.id}.mp3`;
            const file = bucket.file(filename);

            await file.save(audioBuffer, {
              metadata: { contentType: 'audio/mpeg' },
              public: true,
            });

            voiceMessage.audioUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`;
            getLogger().info(
              { voiceMessageId: voiceMessage.id, audioUrl: voiceMessage.audioUrl },
              '🎤 Voice message uploaded to GCS'
            );
          }
        } catch (gcsError) {
          getLogger().warn(
            { error: String(gcsError) },
            'GCS upload failed, voice message will be text-only'
          );
        }
      }

      voiceMessage.status = 'ready';
    } else {
      getLogger().warn(
        { voiceMessageId: voiceMessage.id },
        'Cartesia TTS failed, marking as ready for text fallback'
      );
      voiceMessage.status = 'ready';
    }
  } catch (error) {
    getLogger().error(
      { error: String(error), voiceMessageId: voiceMessage.id },
      'Voice message generation failed'
    );
    voiceMessage.status = 'failed';
  }

  voiceMessageStore.set(voiceMessage.id, voiceMessage);
  return voiceMessage;
}

/**
 * Send a voice message via MMS (with audio) or SMS (text fallback)
 */
export async function sendVoiceMessage(voiceMessageId: string, toPhone: string): Promise<string> {
  const voiceMessage = voiceMessageStore.get(voiceMessageId);

  if (!voiceMessage) {
    return "I couldn't find that voice message. Let me create a new one.";
  }

  if (voiceMessage.status === 'generating') {
    return 'The voice message is still being prepared. Give me a moment.';
  }

  if (voiceMessage.status === 'failed') {
    return 'I had trouble generating that voice message. Let me try again.';
  }

  // If we have an audio URL, send via MMS
  if (voiceMessage.audioUrl) {
    try {
      // Send MMS with audio attachment via Twilio
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (accountSid && authToken && fromNumber) {
        const cleanPhone = toPhone.replace(/\D/g, '');
        const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: e164Phone,
              From: fromNumber,
              Body: `🎤 Voice message from Alex`,
              MediaUrl: voiceMessage.audioUrl,
            }),
          }
        );

        if (response.ok) {
          voiceMessage.status = 'sent';
          voiceMessage.deliveredAt = new Date();
          voiceMessageStore.set(voiceMessageId, voiceMessage);
          getLogger().info(
            { voiceMessageId, audioUrl: voiceMessage.audioUrl },
            '🎤 Voice message sent via MMS'
          );
          return "Voice message sent! They'll receive an audio message.";
        }
      }
    } catch (mmsError) {
      getLogger().warn({ error: String(mmsError) }, 'MMS send failed, falling back to SMS');
    }
  }

  // Fallback to SMS with text
  const result = await sendSMS(toPhone, `🎤 Voice message from Alex: "${voiceMessage.message}"`);

  if (!result.includes('trouble') && !result.includes('error')) {
    voiceMessage.status = 'sent';
    voiceMessage.deliveredAt = new Date();
    voiceMessageStore.set(voiceMessageId, voiceMessage);
  }

  return result;
}

// ============================================================================
// SCHEDULER (In-Memory Polling)
// ============================================================================

let schedulerInterval: NodeJS.Timeout | null = null;
let cleanupCounter = 0;
const CLEANUP_EVERY_N_INTERVALS = 60; // Run cleanup every 60 intervals (hourly if intervalMs=60000)

/**
 * Start the reminder scheduler
 * Checks for due reminders every minute
 * Runs cleanup every hour to prevent memory leaks
 */
export function startReminderScheduler(intervalMs = 60000): void {
  if (schedulerInterval) {
    getLogger().warn('Reminder scheduler already running');
    return;
  }

  getLogger().info({ intervalMs }, '🕐 Starting reminder scheduler');
  cleanupCounter = 0;

  registerInterval(
    'reminder-scheduler',
    () => {
      void (async () => {
        const dueReminders = getDueReminders();

        if (dueReminders.length > 0) {
          getLogger().info({ count: dueReminders.length }, '📬 Processing due reminders');

          for (const reminder of dueReminders) {
            await deliverReminder(reminder);
          }
        }

        // Periodic cleanup to prevent memory leaks
        cleanupCounter++;
        if (cleanupCounter >= CLEANUP_EVERY_N_INTERVALS) {
          cleanupCounter = 0;
          cleanupOldReminders();
        }
      })();
    },
    intervalMs
  );
  schedulerInterval = 1 as unknown as ReturnType<typeof setInterval>; // Marker
}

/**
 * Stop the reminder scheduler
 */
export function stopReminderScheduler(): void {
  if (schedulerInterval) {
    clearNamedInterval('reminder-scheduler');
    schedulerInterval = null;
    getLogger().info('🛑 Reminder scheduler stopped');
  }
}

/**
 * Clean up old reminders and voice messages to prevent memory leaks.
 * Removes items that are either:
 * - Delivered/failed/cancelled and older than maxAgeMs
 * - Voice messages older than maxAgeMs
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 7 days)
 */
export function cleanupOldReminders(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoffTime = Date.now() - maxAgeMs;
  let cleanedCount = 0;

  // Clean up old reminders
  for (const [id, reminder] of reminderStore.entries()) {
    const isComplete = reminder.status !== 'pending';
    const isOld = reminder.scheduledFor.getTime() < cutoffTime;

    if (isComplete && isOld) {
      reminderStore.delete(id);
      cleanedCount++;
    }
  }

  // Clean up old voice messages
  for (const [id, voiceMessage] of voiceMessageStore.entries()) {
    const isComplete = voiceMessage.status === 'sent' || voiceMessage.status === 'failed';
    // Use deliveredAt if available, otherwise just clean up old completed ones
    const deliveryTime = voiceMessage.deliveredAt?.getTime() ?? 0;
    const isOld = deliveryTime > 0 && deliveryTime < cutoffTime;

    if (isComplete && isOld) {
      voiceMessageStore.delete(id);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    getLogger().info({ cleanedCount }, '🧹 Cleaned up old reminders and voice messages');
  }

  return cleanedCount;
}

// ============================================================================
// HELPER: Natural Language Time Parsing
// ============================================================================

/**
 * Parse natural language time expressions
 */
export function parseNaturalTime(expression: string, timezone = 'America/New_York'): Date | null {
  const now = new Date();
  const lower = expression.toLowerCase().trim();

  // Handle relative time expressions
  const inMatch = lower.match(/in\s+(\d+)\s*(minute|min|hour|hr|day|week)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const result = new Date(now);

    switch (unit) {
      case 'minute':
      case 'min':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hour':
      case 'hr':
        result.setHours(result.getHours() + amount);
        break;
      case 'day':
        result.setDate(result.getDate() + amount);
        break;
      case 'week':
        result.setDate(result.getDate() + amount * 7);
        break;
    }
    return result;
  }

  // Handle "tomorrow at X"
  if (lower.includes('tomorrow')) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);

    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2] || '0');
      const meridiem = timeMatch[3];

      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;

      result.setHours(hour, minute, 0, 0);
    } else {
      result.setHours(9, 0, 0, 0); // Default to 9 AM
    }
    return result;
  }

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const result = new Date(now);
      const currentDay = now.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);

      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2] || '0');
        const meridiem = timeMatch[3];

        if (meridiem === 'pm' && hour < 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;

        result.setHours(hour, minute, 0, 0);
      } else {
        result.setHours(9, 0, 0, 0);
      }
      return result;
    }
  }

  // Handle "next week", "next month"
  if (lower.includes('next week')) {
    const result = new Date(now);
    result.setDate(result.getDate() + 7);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  if (lower.includes('next month')) {
    const result = new Date(now);
    result.setMonth(result.getMonth() + 1);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  // Handle "end of day", "this evening"
  if (lower.includes('end of day') || lower.includes('this evening')) {
    const result = new Date(now);
    result.setHours(18, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // Handle "this afternoon"
  if (lower.includes('this afternoon')) {
    const result = new Date(now);
    result.setHours(14, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // Handle "this morning"
  if (lower.includes('this morning') || lower.includes('morning')) {
    const result = new Date(now);
    result.setHours(9, 0, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // Try parsing as a date string
  const parsed = new Date(expression);
  if (!isNaN(parsed.getTime()) && parsed > now) {
    return parsed;
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createReminder,
  getPendingReminders,
  getDueReminders,
  cancelReminder,
  deliverReminder,
  createVoiceMessage,
  sendVoiceMessage,
  startReminderScheduler,
  stopReminderScheduler,
  cleanupOldReminders,
  parseNaturalTime,
  loadRemindersFromFirestore,
};
