/**
 * Proactive Outreach Tools
 *
 * Enables agents (Alex, Maya, Joel, etc.) to proactively reach out to users via:
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
 * The user's contact info is stored in their profile and persisted to Firestore.
 */

import { z } from 'zod';
import { getLogger } from '../utils/safe-logger.js';
import {
  createReminder,
  startReminderScheduler,
  type ReminderDeliveryMethod,
} from '../services/reminder-scheduler.js';
import { sendEmail, sendSMS } from '../services/communication-service.js';
import { callWithAlexVoice } from '../services/voice-call.js';
import { getDefaultStore } from '../memory/index.js';

/**
 * Make a phone call using Twilio with persona voice (via Cartesia TTS)
 * Falls back to Twilio's built-in voice if Cartesia is not configured
 */
async function makePhoneCall(
  phone: string,
  message: string
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  try {
    const result = await callWithAlexVoice(phone, message, { fallbackToTwilioVoice: true });
    if (result.success) {
      return { success: true, callSid: result.callSid };
    }
    return { success: false, error: result.message };
  } catch (error) {
    getLogger().error({ error }, 'makePhoneCall failed');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Simple tool definition for proactive outreach tools
interface SimpleToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

interface ToolContext {
  userId?: string;
  personaId?: string;
}

// ============================================================================
// TYPES
// ============================================================================

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
    return !!info.phone;
  }
  if (method === 'email') {
    return !!info.email;
  }

  // Any method - check if we have any contact info
  return !!info.phone || !!info.email;
}

// ============================================================================
// IMMEDIATE OUTREACH
// ============================================================================

/**
 * Send an immediate text message to the user
 */
export async function textUser(
  userId: string,
  message: string,
  agentName = 'Ferni'
): Promise<{ success: boolean; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.phone) {
    return { success: false, error: 'No phone number on file for this user' };
  }

  try {
    const fullMessage = `${message}\n\n— ${agentName}`;
    const result = await sendSMS(contact.phone, fullMessage);

    if (result.includes('trouble') || result.includes('error')) {
      return { success: false, error: result };
    }

    getLogger().info({ userId, agentName }, '📱 Text sent to user');
    return { success: true };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to text user');
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
  agentName = 'Ferni'
): Promise<{ success: boolean; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.email) {
    return { success: false, error: 'No email address on file for this user' };
  }

  try {
    const fullMessage = `${message}\n\n— ${agentName}\nYour AI Life Coach`;
    const result = await sendEmail(contact.email, subject, fullMessage);

    if (result.includes('trouble') || result.includes('error')) {
      return { success: false, error: result };
    }

    getLogger().info({ userId, agentName, subject }, '📧 Email sent to user');
    return { success: true };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to email user');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Call the user immediately
 */
export async function callUser(
  userId: string,
  message: string,
  agentName = 'Ferni'
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.phone) {
    return { success: false, error: 'No phone number on file for this user' };
  }

  try {
    const result = await makePhoneCall(contact.phone, message);

    if ('error' in result) {
      return { success: false, error: result.error };
    }

    getLogger().info({ userId, agentName, callSid: result.callSid }, '📞 Call initiated to user');
    return { success: true, callSid: result.callSid };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to call user');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// SCHEDULED OUTREACH
// ============================================================================

/**
 * Schedule a future text message
 */
export async function scheduleText(
  userId: string,
  message: string,
  scheduledFor: Date,
  agentName = 'Ferni'
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.phone) {
    return { success: false, error: 'No phone number on file. Ask for their number first!' };
  }

  try {
    const reminder = await createReminder({
      userId,
      message: `${message}\n\n— ${agentName}`,
      scheduledFor,
      timezone: contact.timezone || 'America/New_York',
      deliveryMethod: 'sms',
      deliveryAddress: contact.phone,
      createdBy: agentName.toLowerCase(),
    });

    getLogger().info(
      { userId, reminderId: reminder.id, scheduledFor: scheduledFor.toISOString() },
      '📅 Text scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to schedule text');
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
  agentName = 'Ferni'
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.email) {
    return { success: false, error: 'No email address on file. Ask for their email first!' };
  }

  try {
    const reminder = await createReminder({
      userId,
      message: `${message}\n\n— ${agentName}\nYour AI Life Coach`,
      subject,
      scheduledFor,
      timezone: contact.timezone || 'America/New_York',
      deliveryMethod: 'email',
      deliveryAddress: contact.email,
      createdBy: agentName.toLowerCase(),
    });

    getLogger().info(
      { userId, reminderId: reminder.id, scheduledFor: scheduledFor.toISOString() },
      '📅 Email scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to schedule email');
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
  agentName = 'Ferni'
): Promise<{ success: boolean; reminderId?: string; error?: string }> {
  const contact = await getUserContactInfo(userId);

  if (!contact?.phone) {
    return { success: false, error: 'No phone number on file. Ask for their number first!' };
  }

  try {
    const reminder = await createReminder({
      userId,
      message,
      scheduledFor,
      timezone: contact.timezone || 'America/New_York',
      deliveryMethod: 'call',
      deliveryAddress: contact.phone,
      createdBy: agentName.toLowerCase(),
      context: `Scheduled call from ${agentName}`,
    });

    getLogger().info(
      { userId, reminderId: reminder.id, scheduledFor: scheduledFor.toISOString() },
      '📅 Call scheduled'
    );

    return { success: true, reminderId: reminder.id };
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to schedule call');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// TOOL DEFINITIONS FOR AGENTS
// ============================================================================

/**
 * Parse natural language time into a Date
 */
function parseScheduleTime(timeStr: string, timezone = 'America/New_York'): Date {
  const now = new Date();
  const lower = timeStr.toLowerCase();

  // Handle relative times
  if (lower.includes('minute')) {
    const match = lower.match(/(\d+)\s*minute/);
    const minutes = match ? parseInt(match[1]) : 5;
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  if (lower.includes('hour')) {
    const match = lower.match(/(\d+)\s*hour/);
    const hours = match ? parseInt(match[1]) : 1;
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  if (lower === 'tomorrow' || lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check for time in tomorrow
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      tomorrow.setHours(hours, minutes, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    }

    return tomorrow;
  }

  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  // Try to parse as absolute time
  const parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Default: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export const proactiveOutreachTools: SimpleToolDefinition[] = [
  {
    name: 'save_user_contact',
    description: `Save the user's contact information so you can reach out to them later.
Use this when the user shares their phone number or email.
Example: "My number is 555-123-4567" → save their phone
Example: "Email me at john@example.com" → save their email`,
    parameters: z.object({
      phone: z.string().optional().describe('Phone number (any format - will be normalized)'),
      email: z.string().optional().describe('Email address'),
      preferredMethod: z
        .enum(['sms', 'email', 'call'])
        .optional()
        .describe('How they prefer to be contacted'),
      timezone: z.string().optional().describe('Their timezone (e.g., America/New_York)'),
    }),
    handler: async (params: Record<string, unknown>, context: ToolContext) => {
      const userId = context?.userId || 'unknown';

      if (!params.phone && !params.email) {
        return 'I need at least a phone number or email to save.';
      }

      await setUserContactInfo(userId, {
        phone: params.phone as string | undefined,
        email: params.email as string | undefined,
        preferredMethod: params.preferredMethod as 'sms' | 'email' | 'call' | undefined,
        timezone: params.timezone as string | undefined,
      });

      const saved: string[] = [];
      if (params.phone) saved.push('phone number');
      if (params.email) saved.push('email');

      return `Got it! I've saved your ${saved.join(' and ')}. Now I can text, email, or call you for reminders and follow-ups.`;
    },
  },

  {
    name: 'send_text_now',
    description: `Send an immediate text message to the user.
Use for urgent updates or when they ask you to text them something right now.
Requires: User's phone number must be saved first.`,
    parameters: z.object({
      message: z.string().describe('The text message to send'),
    }),
    handler: async (params: Record<string, unknown>, context: ToolContext) => {
      const userId = context?.userId || 'unknown';
      const agentName = context?.personaId || 'Ferni';

      const result = await textUser(userId, params.message as string, agentName);

      if (result.success) {
        return `Done! I just texted you: "${params.message}"`;
      } else {
        return `I couldn't send that text: ${result.error}. Could you share your phone number?`;
      }
    },
  },

  {
    name: 'send_email_now',
    description: `Send an immediate email to the user.
Use for sending detailed information, summaries, or resources.
Requires: User's email must be saved first.`,
    parameters: z.object({
      subject: z.string().describe('Email subject line'),
      message: z.string().describe('The email body content'),
    }),
    handler: async (params: Record<string, unknown>, context: ToolContext) => {
      const userId = context?.userId || 'unknown';
      const agentName = context?.personaId || 'Ferni';

      const result = await emailUser(
        userId,
        params.subject as string,
        params.message as string,
        agentName
      );

      if (result.success) {
        return `Done! I just emailed you with subject: "${params.subject}"`;
      } else {
        return `I couldn't send that email: ${result.error}. Could you share your email address?`;
      }
    },
  },

  {
    name: 'schedule_reminder',
    description: `Schedule a future reminder via text, email, or call.
Use when the user wants to be reminded about something later.
Examples:
- "Remind me tomorrow at 9am about my interview"
- "Text me in 2 hours to check on my progress"
- "Send me an email next week with a summary"
- "Call me tonight at 8pm if I haven't worked out"`,
    parameters: z.object({
      message: z.string().describe('The reminder message'),
      when: z
        .string()
        .describe('When to send (e.g., "tomorrow at 9am", "in 2 hours", "next Monday")'),
      method: z
        .enum(['sms', 'email', 'call'])
        .default('sms')
        .describe('How to deliver the reminder'),
      subject: z.string().optional().describe('Email subject (only for email reminders)'),
    }),
    handler: async (params: Record<string, unknown>, context: ToolContext) => {
      const userId = context?.userId || 'unknown';
      const agentName = context?.personaId || 'Ferni';
      const contact = await getUserContactInfo(userId);
      const message = params.message as string;
      const when = params.when as string;
      const method = (params.method as 'sms' | 'email' | 'call') || 'sms';
      const subject = params.subject as string | undefined;
      const scheduledFor = parseScheduleTime(when, contact?.timezone);

      let result: { success: boolean; reminderId?: string; error?: string };

      switch (method) {
        case 'email':
          result = await scheduleEmail(
            userId,
            subject || '⏰ Reminder',
            message,
            scheduledFor,
            agentName
          );
          break;
        case 'call':
          result = await scheduleCall(userId, message, scheduledFor, agentName);
          break;
        default:
          result = await scheduleText(userId, message, scheduledFor, agentName);
      }

      if (result.success) {
        const methodText =
          method === 'call' ? 'call you' : method === 'email' ? 'email you' : 'text you';
        const timeStr = scheduledFor.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        return `All set! I'll ${methodText} on ${timeStr}: "${message}"`;
      } else {
        const methodText = method === 'email' ? 'email address' : 'phone number';
        return `I couldn't schedule that reminder: ${result.error}. Could you share your ${methodText}?`;
      }
    },
  },

  {
    name: 'call_user_now',
    description: `Initiate a phone call to the user right now.
Use sparingly - only for urgent matters or when explicitly requested.
The call will play a voice message when they answer.`,
    parameters: z.object({
      message: z.string().describe('The voice message to play when they answer'),
    }),
    handler: async (params: Record<string, unknown>, context: ToolContext) => {
      const userId = context?.userId || 'unknown';
      const agentName = context?.personaId || 'Ferni';

      const result = await callUser(userId, params.message as string, agentName);

      if (result.success) {
        return `Calling you now! When you answer, you'll hear: "${params.message}"`;
      } else {
        return `I couldn't make that call: ${result.error}. Could you share your phone number?`;
      }
    },
  },
];

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

  // Tools for agents
  proactiveOutreachTools,

  // Initialization
  initializeProactiveOutreach,
};
