/**
 * Agent-to-User Outreach Tools
 *
 * Proactive outreach FROM Ferni TO the user via SMS, email, or voice call.
 * This is different from communication/outreach which handles User→Contact outreach.
 *
 * Use cases:
 * - Reminders ("I'll text you tomorrow at 9am about your interview")
 * - Follow-ups ("Let me check in with you next week about your progress")
 * - Celebrations ("I'll send you a congrats when you hit your goal!")
 * - Accountability ("I'll call you if you haven't logged your workout by 8pm")
 *
 * "Better Than Human" - Ferni never forgets to follow up
 *
 * @module proactive/outreach
 */

import { getProfileStore } from '../../../../memory/profile-store.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext, Tool } from '../../../registry/types.js';

// Services
import {
  createReminder,
  type ReminderDeliveryMethod,
} from '../../../../services/scheduling/reminder-scheduler.js';
import { recordReminderPromise } from '../../../../services/superhuman/semantic-intelligence/promise-keeper.js';
import { sendEmail } from '../../../../services/communication-service.js';
import { callPlacedReply } from './call-placed-reply.js';
import { callMeMovesToPhone, callMovingToPhone } from './call-me-moves-to-phone.js';
import { getCallUserPort } from './call-user-port.js';
import { SAVED_NOT_VERIFIED } from './service.js';
import {
  getPersonaDisplayName,
  getCanonicalPersonaId,
} from '../../../../personas/voice-registry.js';
import { cleanForFirestore } from '../../../../utils/firestore-utils.js';

const log = createLogger({ module: 'proactive-outreach' });

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

// In-memory cache (backed by Firestore)
const userContactCache = new Map<string, UserContactInfo>();

// ============================================================================
// CONTACT INFO MANAGEMENT
// ============================================================================

/**
 * Store user's contact info for proactive outreach
 */
export async function setUserContactInfo(
  userId: string,
  contactInfo: UserContactInfo
): Promise<void> {
  userContactCache.set(userId, contactInfo);

  // Persist to Firestore via user profile's preferences
  try {
    const store = await getProfileStore();
    if (!store) {
      log.warn('No store available for persisting contact info');
      return;
    }

    const profile = await store.getProfile(userId);
    if (profile) {
      // Update preferences with contact info
      const updatedPreferences = {
        ...profile.preferences,
        proactiveContact: contactInfo,
      };

      await store.saveProfile({
        ...profile,
        preferences: updatedPreferences,
        updatedAt: new Date(),
      });

      log.info({ userId }, 'Saved user contact info');
    } else {
      log.warn({ userId }, 'No profile found to save contact info');
    }
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to persist contact info');
  }
}

/** The saved phone and email were written from whatever the model heard: never handed out. */
const withoutAddresses = ({ preferredMethod, timezone }: UserContactInfo): UserContactInfo => ({
  preferredMethod,
  timezone,
});

/**
 * The user's saved outreach preferences (preferred method, timezone). Their phone and
 * email for reaching them come only from the call-user port's verified ones.
 */
export async function getUserContactInfo(userId: string): Promise<UserContactInfo | null> {
  // Check cache first
  if (userContactCache.has(userId)) {
    return withoutAddresses(userContactCache.get(userId)!);
  }

  // Try to load from Firestore
  try {
    const store = await getProfileStore();
    if (!store) return null;

    const profile = await store.getProfile(userId);
    if (!profile?.preferences) return null;

    const prefs = profile.preferences as unknown as Record<string, unknown>;
    const contactInfo = prefs?.proactiveContact as UserContactInfo | undefined;

    if (contactInfo) {
      userContactCache.set(userId, contactInfo);
      return withoutAddresses(contactInfo);
    }
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to load contact info');
  }

  return null;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Save user contact info for proactive outreach
 */
export const saveContactInfoDef: ToolDefinition = {
  id: 'saveContactInfo',
  name: 'Save Contact Info',
  description: "Save the user's contact information so we can reach out proactively",
  domain: 'proactive',
  tags: ['proactive', 'contact', 'setup'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save the user's phone number or email for proactive outreach like reminders, 
follow-ups, and celebrations. Only ask for this when they want to receive messages from you.`,
      parameters: z.object({
        phone: z.string().optional().describe('Phone number for SMS or calls'),
        email: z.string().optional().describe('Email address'),
        preferredMethod: z
          .enum(['sms', 'email', 'call', 'voice_message'])
          .optional()
          .describe('How they prefer to be contacted'),
        timezone: z.string().optional().describe('Their timezone (e.g., "America/New_York")'),
      }),
      execute: async ({ phone, email, preferredMethod, timezone }) => {
        if (!ctx.userId) {
          return "I'd need to know who you are to save your contact info.";
        }

        if (!phone && !email) {
          return 'I need at least a phone number or email to stay in touch with you.';
        }

        const contactInfo: UserContactInfo = {
          phone,
          email,
          preferredMethod: preferredMethod || (phone ? 'sms' : 'email'),
          timezone,
        };

        await setUserContactInfo(ctx.userId, contactInfo);

        return `Saved. ${SAVED_NOT_VERIFIED}`;
      },
    });
  },
};

/**
 * Schedule a proactive reminder
 */
export const scheduleReminderDef: ToolDefinition = {
  id: 'scheduleProactiveReminder',
  name: 'Schedule Proactive Reminder',
  description: 'Schedule a reminder to reach out to the user',
  domain: 'proactive',
  tags: ['proactive', 'reminder', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Schedule a reminder to text, email, or call the user at a specific time.
Use for: follow-ups, accountability check-ins, celebrations, and scheduled reminders.`,
      parameters: z.object({
        message: z.string().describe('The message to send'),
        when: z.string().describe('When to send (e.g., "tomorrow at 9am", "in 2 hours")'),
        method: z
          .enum(['sms', 'email', 'voice'])
          .optional()
          .describe('Delivery method (default: user preference or sms)'),
        type: z
          .enum(['reminder', 'follow_up', 'check_in', 'celebration', 'accountability'])
          .optional()
          .describe('Type of outreach'),
      }),
      execute: async ({ message, when, method, type = 'reminder' }) => {
        if (!ctx.userId) {
          return "I'd need to know who you are to send you reminders.";
        }

        // Delivery method (voice → call for API compatibility); their saved preference, else a text
        const preferred = (await getUserContactInfo(ctx.userId))?.preferredMethod;
        const deliveryMethod: ReminderDeliveryMethod =
          method === 'voice' ? 'call' : method || (preferred === 'email' ? 'email' : 'sms');
        // Only the verified phone or email, never the model-written contactInfo.
        const port = getCallUserPort();
        const byEmail = deliveryMethod === 'email';
        const address = byEmail
          ? await port?.verifiedEmail?.(ctx.userId)
          : await port?.verifiedPhone(ctx.userId);
        if (!address) {
          const what = byEmail ? 'email you' : 'text or call you';
          const which = byEmail ? 'email address' : 'phone number';
          return `I can't ${what} yet: there's no verified ${which} on your account, so I didn't schedule it.`;
        }

        // Parse the time
        const now = new Date();
        let scheduledFor: Date;

        try {
          // Simple time parsing
          const lowerWhen = when.toLowerCase();
          if (lowerWhen.includes('tomorrow')) {
            scheduledFor = new Date(now);
            scheduledFor.setDate(scheduledFor.getDate() + 1);
            const timeMatch = lowerWhen.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1], 10);
              const minutes = parseInt(timeMatch[2] || '0', 10);
              const ampm = timeMatch[3]?.toLowerCase();
              if (ampm === 'pm' && hours < 12) hours += 12;
              if (ampm === 'am' && hours === 12) hours = 0;
              scheduledFor.setHours(hours, minutes, 0, 0);
            } else {
              scheduledFor.setHours(9, 0, 0, 0); // Default 9am
            }
          } else if (lowerWhen.includes('hour')) {
            const hoursMatch = lowerWhen.match(/(\d+)\s*hour/);
            const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 1;
            scheduledFor = new Date(now.getTime() + hours * 60 * 60 * 1000);
          } else if (lowerWhen.includes('minute')) {
            const minMatch = lowerWhen.match(/(\d+)\s*minute/);
            const mins = minMatch ? parseInt(minMatch[1], 10) : 30;
            scheduledFor = new Date(now.getTime() + mins * 60 * 1000);
          } else {
            // Default to 1 hour from now
            scheduledFor = new Date(now.getTime() + 60 * 60 * 1000);
          }
        } catch {
          scheduledFor = new Date(now.getTime() + 60 * 60 * 1000);
        }

        // Create the reminder
        const personaName = getPersonaDisplayName(ctx.agentId || 'ferni');
        const reminder = await createReminder({
          userId: ctx.userId,
          personaId: ctx.agentId || 'ferni',
          message: `${personaName}: ${message}`,
          scheduledFor,
          deliveryMethod,
          deliveryAddress: address,
        });

        if (!reminder?.id) {
          return "I couldn't schedule that reminder. Check your contact info is correct?";
        }
        // "I won't forget!" is a promise: the delivery job keeps or misses it.
        await recordReminderPromise(ctx.userId, reminder);

        const timeStr = scheduledFor.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dateStr =
          scheduledFor.toDateString() !== now.toDateString()
            ? ` on ${scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
            : '';

        return `📅 I'll ${deliveryMethod === 'email' ? 'email' : 'text'} you at ${timeStr}${dateStr}. I won't forget!`;
      },
    });
  },
};

/**
 * Send immediate outreach
 */
export const sendImmediateOutreachDef: ToolDefinition = {
  id: 'sendImmediateOutreach',
  name: 'Send Immediate Outreach',
  description: 'Send an immediate message to the user via their preferred method',
  domain: 'proactive',
  tags: ['proactive', 'send', 'immediate'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Send an immediate message to the user via SMS, email, or voice call.
Use when you need to reach them right now outside of the conversation.`,
      parameters: z.object({
        message: z.string().describe('The message to send'),
        method: z.enum(['sms', 'email', 'call']).optional().describe('Delivery method'),
      }),
      execute: async ({ message, method }) => {
        if (!ctx.userId) {
          return "I'd need to know who you are to message you.";
        }

        const contactInfo = await getUserContactInfo(ctx.userId);
        const deliveryMethod = method || contactInfo?.preferredMethod || 'sms';
        const personaId = getCanonicalPersonaId(ctx.agentId || 'ferni');
        const personaName = getPersonaDisplayName(personaId);

        try {
          // Only the account's verified email, phone (as callUser does) and guarded
          // texts: saveContactInfo writes contactInfo from whatever the model heard.
          const port = getCallUserPort();
          if (deliveryMethod === 'email') {
            const email = await port?.verifiedEmail?.(ctx.userId);
            if (!email)
              return "I can't email you yet: there's no verified email address on your account.";
            await sendEmail(email, `Message from ${personaName}`, message);
            return `📧 Email sent!`;
          }

          const phone = port ? await port.verifiedPhone(ctx.userId) : undefined;
          const how = deliveryMethod === 'call' ? 'call' : 'text';
          if (!port || !phone) {
            return `I can't ${how} you yet: there's no verified phone number on your account, so nothing was sent.`;
          }

          if (deliveryMethod === 'call') {
            const result = await port.call({
              userId: ctx.userId,
              phoneNumber: phone,
              message,
              personaId,
            });
            if (!result.success) {
              return `I couldn't place the call, so no call is coming: ${result.error ?? 'unknown error'}`;
            }
            return callPlacedReply(result);
          }

          // Ferni reaching out unasked: STOP, texts off and quiet hours all hold it.
          const text = await port.textOwner?.(ctx.userId, `${personaName}: ${message}`, {
            askedNow: false,
          });
          return text?.sent
            ? `📱 Text sent!`
            : `I didn't text you: ${text?.reason ?? "texting isn't set up here"}.`;
        } catch (error) {
          log.error({ error: String(error), method: deliveryMethod }, 'Outreach failed');
          return `I couldn't send that message: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    });
  },
};

/**
 * Call the user. Registered by the telephony domain (behind
 * TOOLS_REAL_CALL_USER), not here, so there is one callUser.
 *
 * It only rings the verified phone on the account, never the model-written
 * contactInfo.phone, and calling hours and quiet hours decide when it rings
 * (call-user-port.ts; the call session installs the outreach adapter).
 */
export const callUserDef: ToolDefinition = {
  id: 'callUser',
  name: 'Call User',
  description: 'Place a phone call to the user with a voice message',
  domain: 'proactive',
  tags: ['proactive', 'call', 'voice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Call the user and deliver a voice message using your persona's voice.
Use for important check-ins or when a phone call is more personal than text.`,
      parameters: z.object({
        message: z.string().describe('What to say when they answer'),
      }),
      execute: async ({ message }, opts) => {
        if (!ctx.userId) {
          return "I'd need to know who you are to call you.";
        }

        const port = getCallUserPort();
        if (!port) {
          return "I can't place calls from here, so no call is coming.";
        }
        const phone = await port.verifiedPhone(ctx.userId);
        if (!phone) {
          return "I can't call you yet: there's no verified phone number on your account, so no call is coming.";
        }

        const request = {
          userId: ctx.userId,
          phoneNumber: phone,
          message,
          personaId: getCanonicalPersonaId(ctx.agentId || 'ferni'),
        };
        // CALL_ME_MOVES_TO_PHONE: an answered call ends this one (call-me-moves-to-phone.ts)
        if (callMeMovesToPhone()) return callMovingToPhone(port, request, opts?.ctx);
        const result = await port.call(request);

        if (!result.success) {
          return `I couldn't place the call, so no call is coming: ${result.error ?? 'unknown error'}`;
        }
        return callPlacedReply(result);
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export function getAgentToUserOutreachDefinitions(): ToolDefinition[] {
  return [saveContactInfoDef, scheduleReminderDef, sendImmediateOutreachDef];
}

export default getAgentToUserOutreachDefinitions;
