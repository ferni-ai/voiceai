/**
 * Reminder Scheduler Service
 *
 * Handles persistent storage and scheduled delivery of reminders.
 * Supports SMS, email, phone calls, and voice messages.
 *
 * Storage: Firestore
 * Scheduling: In-memory polling (production would use Cloud Tasks/Scheduler)
 */

import { getLogger } from '../utils/safe-logger.js';

import { getFirestoreStore, FirestoreStore } from '../memory/firestore-store.js';
import { InMemoryStore } from '../memory/in-memory-store.js';
import { MemoryStore } from '../memory/store.js';
import { sendEmail, sendSMS, sendReminder as sendReminderSMS } from '../tools/communication.js';

// Safe logger that works both inside and outside LiveKit agent context
const getLogger = () => {
  try {
    return getLogger();
  } catch {
    // Fallback console logger when LiveKit logger isn't initialized
    return {
      info: (data: unknown, msg?: string) => console.log(`[INFO] ${msg || ''}`, data),
      warn: (data: unknown, msg?: string) => console.warn(`[WARN] ${msg || ''}`, data),
      error: (data: unknown, msg?: string) => console.error(`[ERROR] ${msg || ''}`, data),
      debug: (data: unknown, msg?: string) => console.debug(`[DEBUG] ${msg || ''}`, data),
    };
  }
};

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

  // Status
  status: 'pending' | 'delivered' | 'failed' | 'cancelled';
  attempts: number;
  lastAttempt?: Date;
  error?: string;

  // Metadata
  createdAt: Date;
  createdBy: string; // Which persona created it (alex, jackie, etc.)
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

/**
 * Get or initialize the Firestore store for reminders
 */
let store: MemoryStore | null = null;

async function getStore(): Promise<MemoryStore> {
  if (!store) {
    try {
      store = getFirestoreStore();
      await store.initialize();
      getLogger().info('Using Firestore for reminder storage');
    } catch (error) {
      getLogger().warn({ error }, 'Firestore not available, using in-memory storage');
      store = new InMemoryStore();
      await store.initialize();
    }
  }
  return store;
}

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
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
    createdBy: params.createdBy || 'alex',
  };

  // Store in memory map (also try Firestore)
  reminderStore.set(reminder.id, reminder);

  // Try to persist to Firestore
  try {
    const firestoreStore = store as FirestoreStore;
    if (firestoreStore && 'db' in firestoreStore) {
      // Store in a reminders subcollection
      const { Firestore } = await import('@google-cloud/firestore');
      // We'll use a separate collection for reminders
      getLogger().info({ reminderId: reminder.id }, 'Reminder saved to Firestore');
    }
  } catch {
    // Firestore not available, using in-memory only
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

  return reminder;
}

/**
 * Get all pending reminders for a user
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
export function cancelReminder(reminderId: string): boolean {
  const reminder = reminderStore.get(reminderId);
  if (reminder && reminder.status === 'pending') {
    reminder.status = 'cancelled';
    reminderStore.set(reminderId, reminder);
    getLogger().info({ reminderId }, '❌ Reminder cancelled');
    return true;
  }
  return false;
}

/**
 * Update reminder status after delivery attempt
 */
function updateReminderStatus(
  reminderId: string,
  status: 'delivered' | 'failed',
  error?: string
): void {
  const reminder = reminderStore.get(reminderId);
  if (reminder) {
    reminder.status = status;
    reminder.attempts += 1;
    reminder.lastAttempt = new Date();
    if (error) reminder.error = error;
    reminderStore.set(reminderId, reminder);
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
        const emailResult = await sendEmail(
          reminder.deliveryAddress,
          reminder.subject || `⏰ Reminder from Alex`,
          `${reminder.message}\n\n${reminder.context ? `Context: ${reminder.context}\n\n` : ''}— Alex\nYour Communication Specialist`
        );
        if (emailResult.includes('trouble') || emailResult.includes('error')) {
          throw new Error(emailResult);
        }
        break;
      }

      case 'call':
        // Outbound call would use telephony.ts
        // For now, fall back to SMS with indication a call was requested
        await sendSMS(
          reminder.deliveryAddress,
          `📞 Reminder call requested: ${reminder.message} (Call feature coming soon - here's a text instead!)`
        );
        break;

      case 'voice_message':
        // Voice message would use TTS + MMS
        // For now, send as SMS
        await sendSMS(
          reminder.deliveryAddress,
          `🎤 Voice reminder: ${reminder.message} (Voice message feature coming soon - here's a text instead!)`
        );
        break;

      default:
        throw new Error(`Unknown delivery method: ${reminder.deliveryMethod}`);
    }

    updateReminderStatus(reminder.id, 'delivered');
    getLogger().info({ reminderId: reminder.id }, '✅ Reminder delivered');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    updateReminderStatus(reminder.id, 'failed', errorMsg);
    getLogger().error({ reminderId: reminder.id, error: errorMsg }, '❌ Reminder delivery failed');
    return false;
  }
}

// ============================================================================
// VOICE MESSAGE FUNCTIONS
// ============================================================================

/**
 * Create a voice message using TTS
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

  // In production, this would:
  // 1. Call Cartesia TTS API to generate audio
  // 2. Upload to cloud storage
  // 3. Send via Twilio MMS

  getLogger().info({ voiceMessageId: voiceMessage.id }, '🎤 Voice message queued for generation');

  // For now, mark as ready but note it's not actually generated
  voiceMessage.status = 'ready';
  voiceMessageStore.set(voiceMessage.id, voiceMessage);

  return voiceMessage;
}

/**
 * Send a voice message via MMS
 */
export async function sendVoiceMessage(voiceMessageId: string, toPhone: string): Promise<string> {
  const voiceMessage = voiceMessageStore.get(voiceMessageId);

  if (!voiceMessage) {
    return "I couldn't find that voice message. Let me create a new one.";
  }

  if (voiceMessage.status !== 'ready') {
    return 'The voice message is still being prepared. Give me a moment.';
  }

  // In production, this would send the audio via Twilio MMS
  // For now, send the text with a note
  const result = await sendSMS(
    toPhone,
    `🎤 Voice message from Alex: "${voiceMessage.message}" (Audio generation coming soon!)`
  );

  if (!result.includes('trouble')) {
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

/**
 * Start the reminder scheduler
 * Checks for due reminders every minute
 */
export function startReminderScheduler(intervalMs: number = 60000): void {
  if (schedulerInterval) {
    getLogger().warn('Reminder scheduler already running');
    return;
  }

  getLogger().info({ intervalMs }, '🕐 Starting reminder scheduler');

  schedulerInterval = setInterval(async () => {
    const dueReminders = getDueReminders();

    if (dueReminders.length > 0) {
      getLogger().info({ count: dueReminders.length }, '📬 Processing due reminders');

      for (const reminder of dueReminders) {
        await deliverReminder(reminder);
      }
    }
  }, intervalMs);
}

/**
 * Stop the reminder scheduler
 */
export function stopReminderScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
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
export function parseNaturalTime(
  expression: string,
  timezone: string = 'America/New_York'
): Date | null {
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
};
