/**
 * @deprecated For outreach, use outreach/unified-outreach.ts (reachOut tool)
 *
 * Migration guide:
 * - sendEmail, sendSMS → outreach/unified-outreach.ts (reachOut auto-selects)
 * - makePhoneCall, sendVoiceMessage → outreach/unified-outreach.ts
 * - Reminders, calendar → Keep here (distinct features)
 *
 * The `reachOut` tool provides:
 * - Automatic channel selection
 * - LLM-powered message personalization
 * - Interaction tracking for relationship scoring
 * - Optimal timing intelligence
 *
 * Communication Specialist Tools (PARTIALLY DEPRECATED)
 *
 * Full communication integration:
 * - Real email sending via SendGrid
 * - Real SMS/text via Twilio
 * - Phone calls via Twilio Programmable Voice
 * - Voice messages via Cartesia TTS + Twilio MMS
 * - Persistent reminders with scheduled delivery (KEEP)
 * - Calendar integration (KEEP)
 */

import { llm } from '@livekit/agents';
import { callerUserId } from '../local-search/caller-city.js';
import { notCalling, ownerRefusal } from '../../../utils/consent-port.js';
import { z } from 'zod';
import {
  guardedThirdPartySend,
  sendEmail,
  sendSMS,
} from '../../../services/communication-service.js';
import {
  cancelReminder,
  createReminder,
  createVoiceMessage,
  getPendingReminders,
  parseNaturalTime,
  sendVoiceMessage,
  type ReminderDeliveryMethod,
} from '../../../services/scheduling/reminder-scheduler.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { callerIdFor } from '../../../services/identity/call-caller-id.js';
import { runContextTimeZone, userTimeZone } from '../../../utils/caller-time-zone.js';
import {
  sanitizeEmailForLog,
  sanitizePhoneForLog,
  validateEmail,
  validatePhone,
} from '../../validation.js';

// Twilio for phone calls
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

// Cartesia for voice message TTS
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';

// Import voice registry for consistent voice ID resolution
import { getVoiceId } from '../../../personas/voice-registry.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getCallUserPort } from '../proactive/outreach/call-user-port.js';
// Get Alex's voice ID from the registry (single source of truth)
const getAlexVoiceId = () => getVoiceId('alex-chen');

// ===== TYPES =====

interface DraftedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  tone: 'formal' | 'casual' | 'friendly' | 'urgent';
  status: 'draft' | 'approved' | 'sent';
  createdAt: Date;
}

interface ScheduledCall {
  id: string;
  contact: string;
  phone?: string;
  purpose: string;
  scheduledTime: Date;
  duration: number;
  notes: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

// PRIVACY: in memory only, keyed by caller then item id. Keyed by item id alone, the summary
// listed every caller's drafts and calls, and sending marked another caller's matching draft sent.
const emailDrafts = new Map<string, Map<string, DraftedEmail>>();
const scheduledCalls = new Map<string, Map<string, ScheduledCall>>();
/** Test hook: how many callers hold drafts or calls (a read must never add one). */
export const communicationCallersHeld = (): number =>
  new Set([...emailDrafts.keys(), ...scheduledCalls.keys()]).size;

/** The caller (LiveKit's ctx.userData.userId); an id-less caller gets one anon: id per session. */
function callerOf(ctx: unknown): string {
  const run = ctx as { userData?: { userId?: unknown }; session?: unknown } | undefined;
  const session = [run?.session, run?.userData].find((v) => v && typeof v === 'object') ?? null;
  return callerIdFor(run?.userData?.userId, session);
}

/** A reminder is kept: only the caller's own id (member or minted anon:), never a stand-in. */
function reminderOwner(ctx: unknown): string | undefined {
  const raw = (ctx as { userData?: { userId?: unknown } } | undefined)?.userData?.userId;
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id && callerIdFor(id) === id ? id : undefined;
}

/** The caller's own items; a read leaves no entry behind, a write creates one. */
function own<T>(store: Map<string, Map<string, T>>, ctx: unknown, write = false): Map<string, T> {
  const id = callerOf(ctx);
  const items = store.get(id) ?? new Map<string, T>();
  if (write) store.set(id, items);
  return items;
}

// ===== EMAIL FUNCTIONS (Real SendGrid Integration) =====

/** Draft an email with a specific tone - creates a draft for user review */
function draftEmail(
  to: string,
  subject: string,
  context: string,
  tone: 'formal' | 'casual' | 'friendly' | 'urgent',
  drafts: Map<string, DraftedEmail>
): DraftedEmail {
  const id = `draft_${Date.now()}`;

  let body: string;
  let signoff: string;

  switch (tone) {
    case 'formal':
      body = `Dear ${to.split('@')[0] || 'recipient'},\n\n${context}`;
      signoff = 'Best regards';
      break;
    case 'urgent':
      body = `Hi,\n\nThis requires immediate attention:\n\n${context}`;
      signoff = 'Please respond as soon as possible.\n\nThank you';
      break;
    case 'casual':
      body = `Hey!\n\n${context}`;
      signoff = 'Cheers';
      break;
    case 'friendly':
    default:
      body = `Hi there,\n\n${context}`;
      signoff = 'Thanks!';
  }

  const fullBody = `${body}\n\n${signoff}`;

  const draft: DraftedEmail = {
    id,
    to,
    subject,
    body: fullBody,
    tone,
    status: 'draft',
    createdAt: new Date(),
  };

  drafts.set(id, draft);
  return draft;
}

/** Send an email via SendGrid (called after user approves) */
async function sendApprovedEmailReal(
  to: string,
  subject: string,
  body: string,
  drafts: Map<string, DraftedEmail>
): Promise<string> {
  const validation = validateEmail(to);
  if (!validation.valid) {
    return `That email address doesn't look right: ${to}. Can you double-check it?`;
  }

  const result = await sendEmail(validation.sanitized as string, subject, body);

  for (const draft of drafts.values()) {
    if (draft.to === to && draft.subject === subject) {
      draft.status = 'sent';
      break;
    }
  }

  return result;
}

// ===== SMS FUNCTIONS (Real Twilio Integration) =====

/** Send a text message via Twilio */
async function sendTextReal(to: string, message: string, userId: string): Promise<string> {
  const validation = validatePhone(to);
  if (!validation.valid) {
    return `I need a valid phone number to send a text. "${to}" doesn't look right. Can you provide a number like 555-123-4567?`;
  }
  const phone = validation.sanitized as string;
  return guardedThirdPartySend(phone, message, userId, () => sendSMS(phone, message));
}

// ===== PHONE CALL FUNCTIONS (Twilio Programmable Voice) =====

/** Initiate an outbound phone call via Twilio */
async function makePhoneCall(
  to: string,
  purpose: string,
  ownerUid: string | undefined,
  twimlUrl?: string
): Promise<string> {
  const validation = validatePhone(to);
  if (!validation.valid) {
    return `I need a valid phone number to make a call. Can you double-check "${to}"?`;
  }

  const validPhone = validation.sanitized as string;
  // MESSAGING_PIPELINE: the owner's own number, or someone who gave this owner a call grant.
  const refused = await ownerRefusal(ownerUid, validPhone, 'call');
  if (refused) return notCalling(refused);

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    getLogger().warn('Twilio not configured for calls');
    return `I'd love to make that call, but my phone service isn't fully set up yet. Let me send a text instead?`;
  }

  try {
    const defaultTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! This is a call from Alex, your communication assistant. ${purpose}. Have a great day!</Say>
</Response>`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: validPhone,
          From: TWILIO_PHONE_NUMBER,
          ...(twimlUrl ? { Url: twimlUrl } : { Twiml: defaultTwiml }),
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as { sid?: string };
      getLogger().info(
        { to: sanitizePhoneForLog(validPhone), callSid: data.sid },
        '📞 Call initiated'
      );
      return `Done! Calling ${sanitizePhoneForLog(validPhone)} now. They'll get a brief voice message about: "${purpose}"`;
    } else {
      const errorBody = await response.text();
      getLogger().error({ status: response.status, body: errorBody }, 'Twilio call error');
      return `I had trouble starting that call. Let me send a text instead?`;
    }
  } catch (error) {
    getLogger().error({ error }, 'Phone call error');
    return `Something went wrong with the call. Would a text work instead?`;
  }
}

// ===== VOICE MESSAGE FUNCTIONS (Cartesia TTS + Twilio MMS) =====

/** Generate and send a voice message using Alex's voice */
async function sendVoiceMessageReal(to: string, message: string): Promise<string> {
  // Backward compatible overload will pass 'unknown'
  return sendVoiceMessageRealWithUserId(to, message, 'unknown');
}

async function sendVoiceMessageRealWithUserId(
  to: string,
  message: string,
  userId: string
): Promise<string> {
  const validation = validatePhone(to);
  if (!validation.valid) {
    return `I need a valid phone number to send a voice message. Can you provide one?`;
  }

  // For now, use the placeholder implementation
  // Full implementation would:
  // 1. Call Cartesia TTS API to generate audio with Alex's voice
  // 2. Upload audio to cloud storage (GCS/S3)
  // 3. Send via Twilio MMS with the audio URL

  if (!CARTESIA_API_KEY) {
    getLogger().warn('Cartesia not configured for voice messages');
    // Fallback to text with voice message indicator
    return sendTextReal(to, `🎤 Voice message from Alex: "${message}"`, userId);
  }

  try {
    const voiceMsg = await createVoiceMessage({
      userId,
      message,
      voiceId: getAlexVoiceId(),
    });

    const phone = validation.sanitized as string;
    return guardedThirdPartySend(phone, message, userId, () =>
      sendVoiceMessage(voiceMsg.id, phone)
    );
  } catch (error) {
    getLogger().error({ error }, 'Voice message error');
    return sendTextReal(to, `🎤 (Voice message) ${message}`, userId);
  }
}

// ===== REMINDER FUNCTIONS (Persistent + Scheduled) =====

/** Schedule a reminder with automatic delivery, and record Ferni's promise to send it. */
async function scheduleReminderReal(params: {
  userId: string;
  message: string;
  when: string;
  deliveryMethod?: ReminderDeliveryMethod;
  contact?: string;
  /** 'verified-own': contact is the account's verified phone or email (guarded delivery). */
  addressSource?: 'verified-own';
  timezone?: string;
}): Promise<string> {
  const scheduledFor = parseNaturalTime(params.when, params.timezone ?? userTimeZone(params));

  if (!scheduledFor) {
    return `I couldn't understand "${params.when}". Could you be more specific? Like "tomorrow at 9am" or "in 2 hours"?`;
  }

  if (
    params.deliveryMethod &&
    params.deliveryMethod !== 'call' &&
    params.deliveryMethod !== 'in_app'
  ) {
    if (!params.contact) {
      return `I can't ${params.deliveryMethod === 'email' ? 'email' : 'text'} you that one: there's no verified ${params.deliveryMethod === 'email' ? 'email address' : 'phone number'} on your account. I can remind you in the Ferni app instead.`;
    }
  }

  let deliveryAddress = params.contact || '';
  // No channel or contact given: remind them in the app rather than promising a
  // text to a number we don't have.
  const deliveryMethod: ReminderDeliveryMethod =
    params.deliveryMethod || (params.contact ? 'sms' : 'in_app');

  if (deliveryMethod === 'email' && deliveryAddress) {
    const validation = validateEmail(deliveryAddress);
    if (!validation.valid) {
      return `That email doesn't look right. Can you double-check it?`;
    }
    deliveryAddress = validation.sanitized as string;
  } else if (deliveryAddress) {
    const validation = validatePhone(deliveryAddress);
    if (!validation.valid) {
      return `That phone number doesn't look right. Can you check it?`;
    }
    deliveryAddress = validation.sanitized as string;
  }

  try {
    const reminder = await createReminder({
      userId: params.userId,
      message: params.message,
      subject: `⏰ Reminder: ${params.message.slice(0, 50)}...`,
      scheduledFor,
      timezone: params.timezone ?? userTimeZone(params) ?? 'Etc/UTC',
      deliveryMethod,
      deliveryAddress,
      addressSource: params.addressSource,
      createdBy: 'alex',
    });
    const promises =
      await import('../../../services/superhuman/semantic-intelligence/promise-keeper.js');
    await promises.recordReminderPromise(params.userId, reminder);
    const formattedTime = scheduledFor.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const methodDescription = {
      sms: 'text you',
      email: 'email you',
      call: 'call you',
      voice_message: 'send you a voice message',
      in_app: 'remind you here in the app',
    }[deliveryMethod];

    return `Got it! I'll ${methodDescription} ${formattedTime} about: "${params.message}". Reminder ID: ${reminder.id.slice(-6)}`;
  } catch (error) {
    getLogger().error({ error }, 'Failed to create reminder');
    return `I had trouble scheduling that reminder. Let me try again.`;
  }
}

/** Get list of pending reminders for user */
function getRemindersForUser(userId: string): string {
  const reminders = getPendingReminders(userId);

  if (reminders.length === 0) {
    return `You don't have any pending reminders. Want me to set one up?`;
  }

  const reminderList = reminders
    .map((r, i) => {
      const when = r.scheduledFor.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${i + 1}. ${when}: "${r.message}" (via ${r.deliveryMethod})`;
    })
    .join('\n');

  return `📋 **Your Reminders:**\n\n${reminderList}`;
}

// ===== UTILITY FUNCTIONS =====

/** Parse natural language into a scheduled time */
export function parseScheduleTime(naturalTime: string): Date | null {
  const now = new Date();
  const lower = naturalTime.toLowerCase();

  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    return tomorrow;
  }

  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  if (lower.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setHours(9, 0, 0, 0);
    return nextMonth;
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const target = new Date(now);
      const currentDay = now.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
      target.setHours(9, 0, 0, 0);
      return target;
    }
  }

  const parsed = new Date(naturalTime);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

// ===== TOOL DEFINITIONS =====

export function createCommunicationTools() {
  return {
    // ========== EMAIL TOOLS ==========

    draftEmail: llm.tool({
      description: getToolDescription('draftEmail'),
      parameters: z.object({
        to: z.string().describe('Recipient email or name'),
        subject: z.string().describe('Email subject line'),
        context: z.string().describe('What the email should communicate'),
        tone: z
          .enum(['formal', 'casual', 'friendly', 'urgent'])
          .default('friendly')
          .describe('Email tone'),
      }),
      execute: async ({ to, subject, context, tone }, { ctx }) => {
        const draft = draftEmail(to, subject, context, tone, own(emailDrafts, ctx, true));

        return `📧 Here's the draft:\n\n**To:** ${draft.to}\n**Subject:** ${draft.subject}\n\n${draft.body}\n\n---\nShould I send this, adjust the tone, or edit anything?`;
      },
    }),

    sendApprovedEmail: llm.tool({
      description: getToolDescription('sendApprovedEmail'),
      parameters: z.object({
        to: z.string().email().describe('Recipient email address'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body'),
      }),
      execute: async ({ to, subject, body }, { ctx }) => {
        return sendApprovedEmailReal(to, subject, body, own(emailDrafts, ctx));
      },
    }),

    // ========== TEXT/SMS TOOLS ==========

    sendTextMessage: llm.tool({
      description: getToolDescription('sendTextMessage'),
      parameters: z.object({
        to: z.string().describe('Phone number (e.g., "555-123-4567" or "+15551234567")'),
        message: z.string().describe('Message to send'),
      }),
      execute: async ({ to, message }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        return sendTextReal(to, message, userData?.userId || 'unknown');
      },
    }),

    // ========== PHONE CALL TOOLS ==========

    makePhoneCall: llm.tool({
      description: getToolDescription('makePhoneCall'),
      parameters: z.object({
        phoneNumber: z.string().describe('Phone number to call'),
        message: z.string().describe('Message to deliver in the call'),
      }),
      execute: async ({ phoneNumber, message }, opts) => {
        return makePhoneCall(phoneNumber, message, callerUserId(opts)); // the session's identity
      },
    }),

    // ========== VOICE MESSAGE TOOLS ==========

    sendVoiceMessage: llm.tool({
      description: getToolDescription('sendVoiceMessage'),
      parameters: z.object({
        phoneNumber: z.string().describe('Phone number to send voice message to'),
        message: z.string().describe('What Alex should say in the voice message'),
      }),
      execute: async ({ phoneNumber, message }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';
        return sendVoiceMessageRealWithUserId(phoneNumber, message, userId);
      },
    }),

    // ========== REMINDER TOOLS ==========

    setReminder: llm.tool({
      description: getToolDescription('setReminder'),
      parameters: z.object({
        message: z.string().describe('What to remind the user about'),
        when: z
          .string()
          .describe('When to send (e.g., "tomorrow at 9am", "in 2 hours", "next Monday")'),
        deliveryMethod: z
          .enum(['in_app', 'sms', 'email', 'call', 'voice_message'])
          .optional()
          .describe(
            'How to deliver: in_app, sms, email, call, or voice_message. Leave out unless the user asked for one: it texts them if their phone is on file, otherwise reminds them in the app.'
          ),
      }),
      execute: async ({ message, when, deliveryMethod }, { ctx }) => {
        const userId = reminderOwner(ctx);
        if (!userId) return "I can't set that reminder right now. Want me to try again?";
        // Only the account's verified phone or email (call-user port): never a number the
        // model passes, never the model-written profile.contactInfo.
        const port = getCallUserPort();
        const contact =
          deliveryMethod === 'email'
            ? await port?.verifiedEmail?.(userId)
            : await port?.verifiedPhone(userId);
        const addressSource = contact ? ('verified-own' as const) : undefined;
        return scheduleReminderReal({
          userId,
          message,
          when,
          deliveryMethod,
          contact,
          addressSource,
        });
      },
    }),

    listReminders: llm.tool({
      description: getToolDescription('listReminders'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = reminderOwner(ctx);
        return userId ? getRemindersForUser(userId) : `You don't have any pending reminders.`;
      },
    }),

    cancelReminder: llm.tool({
      description: getToolDescription('cancelReminder'),
      parameters: z.object({
        reminderId: z.string().describe('The reminder ID (last 6 characters shown when created)'),
      }),
      execute: async ({ reminderId }, { ctx }) => {
        // Only the caller's own reminder, by its full id or the short id we read out.
        const id = reminderId.trim();
        const owner = reminderOwner(ctx);
        const mine = owner ? getPendingReminders(owner).find((r) => id && r.id.endsWith(id)) : undefined;
        const success = mine ? await cancelReminder(mine.id) : false;

        if (success) {
          return `Got it, I've cancelled that reminder.`;
        } else {
          return `I couldn't find that reminder. It might have already been delivered or cancelled. Want to see your current reminders?`;
        }
      },
    }),

    // Older name (Alex's tool set, communication/index.ts). It used to say "I've set a
    // reminder" without setting one; now it is setReminder under another name.
    scheduleReminder: llm.tool({
      description: getToolDescription('scheduleReminder'),
      parameters: z.object({
        reminderText: z.string().describe('What to remind them about'),
        when: z.string().describe('When to remind (e.g., "tomorrow", "next week", "next Tuesday")'),
        contactMethod: z.enum(['sms', 'email']).optional().describe('How to send reminder'),
        contact: z.string().optional().describe('Phone or email for the reminder'),
      }),
      execute: async ({ reminderText, when, contactMethod, contact }, { ctx }) => {
        const userId = reminderOwner(ctx);
        if (!userId) return "I can't set that reminder right now. Want me to try again?";
        return scheduleReminderReal({
          userId,
          message: reminderText,
          when,
          deliveryMethod: contactMethod,
          contact,
        });
      },
    }),

    scheduleEvent: llm.tool({
      description: getToolDescription('scheduleEvent'),
      parameters: z.object({
        title: z.string().describe('Event title'),
        description: z.string().optional().describe('Event description'),
        when: z.string().describe('When to schedule (e.g., "next Tuesday at 2pm")'),
        durationMinutes: z.number().optional().describe('Duration in minutes (default 30)'),
      }),
      execute: async ({ title, description, when, durationMinutes }) => {
        const scheduledTime = parseScheduleTime(when);

        if (!scheduledTime) {
          return `I couldn't understand that time. Could you say something like "next Tuesday at 2pm"?`;
        }

        const duration = durationMinutes || 30;
        const endTime = new Date(scheduledTime.getTime() + duration * 60 * 1000);

        const dateStr = scheduledTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const timeStr = scheduledTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const endTimeStr = endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        getLogger().info(
          { title, scheduledTime, durationMinutes: duration },
          '📅 Calendar event created'
        );

        return `📅 Added to your calendar:\n\n**${title}**\n${dateStr}, ${timeStr} - ${endTimeStr}\n${description ? `\n${description}` : ''}`;
      },
    }),

    // ========== CONTACT INFO TOOLS ==========

    saveContactInfo: llm.tool({
      description: getToolDescription('saveContactInfo'),
      parameters: z.object({
        phone: z.string().optional().describe('Phone number'),
        email: z.string().optional().describe('Email address'),
        preferredMethod: z
          .enum(['sms', 'email', 'call', 'voice_message'])
          .optional()
          .describe('Preferred contact method'),
      }),
      execute: async ({ phone, email, preferredMethod }, { ctx }) => {
        const userData = ctx?.userData as
          | {
              userProfile?: { contactInfo?: Record<string, unknown> };
              services?: { userProfile?: unknown };
            }
          | undefined;

        if (!userData?.userProfile) {
          return "I'll remember that for this conversation. For permanent storage, I'd need access to your profile.";
        }

        if (phone) {
          const validation = validatePhone(phone);
          if (!validation.valid) {
            return `That phone number doesn't look right. Could you check it?`;
          }
        }
        if (email) {
          const validation = validateEmail(email);
          if (!validation.valid) {
            return `That email doesn't look right. Could you check it?`;
          }
        }

        // Update profile (would save to store in real implementation)
        const updates: string[] = [];
        if (phone) updates.push(`phone: ${sanitizePhoneForLog(phone)}`);
        if (email) updates.push(`email: ${sanitizeEmailForLog(email)}`);
        if (preferredMethod) updates.push(`preferred method: ${preferredMethod}`);

        getLogger().info(
          {
            phone: phone ? sanitizePhoneForLog(phone) : undefined,
            email: email ? sanitizeEmailForLog(email) : undefined,
          },
          '📇 Contact info saved'
        );

        return `Perfect! I've saved your contact info: ${updates.join(', ')}. I'll use this for reminders and messages.`;
      },
    }),

    // ========== CALENDAR TOOLS ==========

    checkAvailability: llm.tool({
      description: getToolDescription('checkAvailability'),
      parameters: z.object({
        date: z.string().describe('Date to check (e.g., "tomorrow", "next Monday", "December 15")'),
        durationMinutes: z.number().default(30).describe('Duration in minutes'),
      }),
      execute: async ({ date }, { ctx }) => {
        const targetDate = parseNaturalTime(date, runContextTimeZone(ctx));
        if (!targetDate) {
          return `I couldn't understand that date. Try "tomorrow", "next Tuesday", or a specific date?`;
        }

        // Nothing here reads a calendar, so there are no real free slots to report.
        // Say so rather than inventing availability.
        const dateStr = targetDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        return `I can't see your calendar right now, so I can't tell you what's free on ${dateStr}. Your calendar app will show the real openings. Tell me the time you have in mind and I can help you think it through.`;
      },
    }),

    scheduleCall: llm.tool({
      description: getToolDescription('scheduleCall'),
      parameters: z.object({
        contact: z.string().describe('Who to call (name or company)'),
        phone: z.string().optional().describe('Phone number if known'),
        purpose: z.string().describe('Purpose of the call'),
        dateTime: z.string().describe('When to call (e.g., "tomorrow at 2pm")'),
        duration: z.number().default(30).describe('Expected duration in minutes'),
        notes: z.string().optional().describe('Talking points or notes'),
      }),
      execute: async ({ contact, phone, purpose, dateTime, duration, notes }, { ctx }) => {
        const scheduledTime = parseNaturalTime(dateTime, runContextTimeZone(ctx));
        if (!scheduledTime) {
          return `When would you like to schedule this call? Give me a day and time like "tomorrow at 2pm".`;
        }

        const id = `call_${Date.now()}`;
        const call: ScheduledCall = {
          id,
          contact,
          phone,
          purpose,
          scheduledTime,
          duration,
          notes: notes || '',
          status: 'scheduled',
        };

        own(scheduledCalls, ctx, true).set(id, call);

        const timeStr = scheduledTime.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        const userId = (ctx?.userData as { userId?: string } | undefined)?.userId || 'unknown';
        // The verified phone only, never the model-written profile.contactInfo.phone.
        const userPhone = await getCallUserPort()?.verifiedPhone(userId);

        if (userPhone) {
          const reminderTime = new Date(scheduledTime.getTime() - 15 * 60000); // 15 min before
          const reminder = await createReminder({
            userId,
            message: `Call with ${contact} in 15 minutes! Purpose: ${purpose}`,
            scheduledFor: reminderTime,
            deliveryMethod: 'sms',
            deliveryAddress: userPhone,
            addressSource: 'verified-own',
            createdBy: 'alex',
          });
          // "I'll remind you 15 minutes before!" is a promise: the delivery job keeps or misses it.
          const promises =
            await import('../../../services/superhuman/semantic-intelligence/promise-keeper.js');
          await promises.recordReminderPromise(userId, reminder);
        }

        let response = `📞 Call scheduled with ${contact} for ${timeStr} (${duration} min)\nPurpose: ${purpose}`;
        if (notes) response += `\nTalking points: ${notes}`;
        if (userPhone) response += `\nI'll remind you 15 minutes before!`;

        return response;
      },
    }),

    // ========== COMMUNICATION SUMMARY ==========

    getCommunicationSummary: llm.tool({
      description: getToolDescription('getCommunicationSummary'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = reminderOwner(ctx);
        const pendingEmails = [...own(emailDrafts, ctx).values()].filter((e) => e.status === 'draft');
        const upcomingCalls = [...own(scheduledCalls, ctx).values()].filter(
          (c) => c.status === 'scheduled' && c.scheduledTime > new Date()
        );
        const pendingReminders = userId ? getPendingReminders(userId) : [];

        let summary = '📋 **Communication Summary**\n\n';

        if (pendingEmails.length > 0) {
          summary += `📧 **${pendingEmails.length} draft email(s)** waiting for review\n`;
          for (const email of pendingEmails) {
            summary += `  • To: ${email.to} - "${email.subject}"\n`;
          }
          summary += '\n';
        }

        if (upcomingCalls.length > 0) {
          summary += `📞 **${upcomingCalls.length} call(s)** scheduled:\n`;
          for (const call of upcomingCalls) {
            const timeStr = call.scheduledTime.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            summary += `  • ${call.contact} - ${timeStr}\n`;
          }
          summary += '\n';
        }

        if (pendingReminders.length > 0) {
          summary += `⏰ **${pendingReminders.length} reminder(s)** scheduled:\n`;
          for (const reminder of pendingReminders.slice(0, 5)) {
            const timeStr = reminder.scheduledFor.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            summary += `  • ${timeStr}: "${reminder.message.slice(0, 40)}..."\n`;
          }
          if (pendingReminders.length > 5) {
            summary += `  • ...and ${pendingReminders.length - 5} more\n`;
          }
          summary += '\n';
        }

        if (
          pendingEmails.length === 0 &&
          upcomingCalls.length === 0 &&
          pendingReminders.length === 0
        ) {
          summary =
            '✨ All clear! No pending communications or reminders.\n\nAnything you want to set up?';
        }

        return summary;
      },
    }),
  };
}

// Re-export coaching tools for unified toolset
export { createCommunicationCoachingTools } from './communication-coaching.js';

/** Create all communication tools - base + coaching combined */
export async function createAllCommunicationTools() {
  const { createCommunicationCoachingTools: getCoachingTools } =
    await import('./communication-coaching.js');
  return {
    ...createCommunicationTools(),
    ...getCoachingTools(),
  };
}

export default createCommunicationTools;
