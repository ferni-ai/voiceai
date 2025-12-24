/**
 * Scheduling Domain Tools
 *
 * Voice-accessible tools for scheduling messages, calls, and emails.
 * Bridges the proactive outreach system to the voice agent.
 *
 * DOMAIN: scheduling
 * TOOLS:
 *   scheduleMessage - Schedule a text message for later
 *   scheduleCall - Schedule a phone call for later
 *   scheduleEmail - Schedule an email for later
 *   sendMessageNow - Send an immediate text message
 *   listScheduled - View pending scheduled actions
 *   cancelScheduled - Cancel a scheduled action
 *   getOptimalSendTime - Get ML-recommended best time to reach someone
 *   scheduleAtBestTime - Schedule using intelligent timing
 *
 * USAGE:
 *   "Text John tomorrow at 9am saying I'll be late"
 *   "Call my doctor's office at 2pm"
 *   "Send an email to the team Friday morning about the project"
 *   "What messages do I have scheduled?"
 *   "When's the best time to reach Sarah?"
 *   "Schedule this text for the best time"
 *
 * INTELLIGENT SCHEDULING:
 *   Uses Thompson Sampling ML to learn when each contact is most responsive.
 *   Learns from response rates, engagement quality, and timing patterns.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

// Import proactive outreach functions
import {
  scheduleText,
  scheduleEmail,
  scheduleCall,
  textUser,
  getUserContactInfo,
  setUserContactInfo,
} from '../../proactive-outreach.js';
import {
  getPendingReminders,
  cancelReminder,
  parseNaturalTime,
} from '../../../services/scheduling/reminder-scheduler.js';

// Import intelligent timing ML
import {
  getTimingRecommendation,
  type TimingRecommendation,
} from '../../../services/contacts/optimal-timing.js';

const log = getLogger();

// ============================================================================
// HELPER: Parse time from natural language
// ============================================================================

function parseScheduleTime(timeStr: string, timezone = 'America/New_York'): Date | null {
  // First try our enhanced parser
  const parsed = parseNaturalTime(timeStr, timezone);
  if (parsed) return parsed;

  // Fallback to basic parsing
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

  // Default: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}

// ============================================================================
// SCHEDULE TEXT MESSAGE TOOL
// ============================================================================

const scheduleMessageTool: ToolDefinition = {
  id: 'scheduleMessage',
  name: 'Schedule Text Message',
  description:
    'Schedule a text message to be sent at a specific time. Great for reminders, follow-ups, or time-sensitive messages.',
  domain: 'scheduling',
  tags: ['scheduling', 'sms', 'text', 'message', 'reminder', 'later'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Schedule a text message for later delivery.
Use when the user says things like:
- "Text John tomorrow at 9am saying I'll be late"
- "Send me a reminder text in 2 hours"
- "Text myself next week about the report"

Extracts: recipient (optional), time, and message content.
If no recipient specified, sends to the user themselves.`,
      parameters: z.object({
        message: z.string().describe('The text message content to send'),
        when: z
          .string()
          .describe(
            'When to send - natural language like "tomorrow at 9am", "in 2 hours", "next Monday"'
          ),
        recipient: z
          .string()
          .optional()
          .describe(
            'Who to send to - defaults to the user if not specified. Can be a name or "me/myself"'
          ),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';
        const personaId = ctx.agentId || 'ferni';

        log.info(
          { userId, when: params.when, hasRecipient: !!params.recipient },
          '📱 Scheduling text message'
        );

        // Parse the time
        const contact = await getUserContactInfo(userId);
        const scheduledFor = parseScheduleTime(params.when, contact?.timezone);

        if (!scheduledFor) {
          return "I couldn't understand that time. Could you say it differently? Like 'tomorrow at 9am' or 'in 2 hours'?";
        }

        // For now, all scheduled messages go to the user
        // Future: resolve recipient from contacts
        const result = await scheduleText(userId, params.message, scheduledFor, personaId);

        if (result.success) {
          const timeStr = scheduledFor.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          return `Got it! I'll text you on ${timeStr}: "${params.message}"`;
        } else {
          if (result.error?.includes('phone')) {
            return "I don't have your phone number yet. What's a good number to reach you at?";
          }
          return `I couldn't schedule that: ${result.error}`;
        }
      },
    }),
};

// ============================================================================
// SCHEDULE CALL TOOL
// ============================================================================

const scheduleCallTool: ToolDefinition = {
  id: 'scheduleCall',
  name: 'Schedule Phone Call',
  description: 'Schedule a phone call for a specific time. The AI will call with a voice message.',
  domain: 'scheduling',
  tags: ['scheduling', 'call', 'phone', 'reminder', 'later'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`,
      parameters: z.object({
        message: z.string().describe('What to say when the call is answered'),
        when: z
          .string()
          .describe(
            'When to call - natural language like "at 2pm", "tomorrow morning", "in 30 minutes"'
          ),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';
        const personaId = ctx.agentId || 'ferni';

        log.info({ userId, when: params.when }, '📞 Scheduling phone call');

        const contact = await getUserContactInfo(userId);
        const scheduledFor = parseScheduleTime(params.when, contact?.timezone);

        if (!scheduledFor) {
          return "I couldn't understand that time. Try something like 'at 2pm' or 'tomorrow morning'.";
        }

        const result = await scheduleCall(userId, params.message, scheduledFor, personaId);

        if (result.success) {
          const timeStr = scheduledFor.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          return `I'll call you on ${timeStr}. When you answer, you'll hear: "${params.message}"`;
        } else {
          if (result.error?.includes('phone')) {
            return "I don't have your phone number yet. What's your number?";
          }
          return `I couldn't schedule that call: ${result.error}`;
        }
      },
    }),
};

// ============================================================================
// SCHEDULE EMAIL TOOL
// ============================================================================

const scheduleEmailTool: ToolDefinition = {
  id: 'scheduleEmail',
  name: 'Schedule Email',
  description: 'Schedule an email to be sent at a specific time.',
  domain: 'scheduling',
  tags: ['scheduling', 'email', 'message', 'later'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Schedule an email for later delivery.
Use when the user says things like:
- "Send me an email Friday morning with the project summary"
- "Email me next week about renewing my subscription"
- "Send an email reminder about the deadline"`,
      parameters: z.object({
        subject: z.string().describe('Email subject line'),
        message: z.string().describe('The email body content'),
        when: z
          .string()
          .describe(
            'When to send - natural language like "Friday morning", "next week", "in 3 days"'
          ),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';
        const personaId = ctx.agentId || 'ferni';

        log.info({ userId, when: params.when, subject: params.subject }, '📧 Scheduling email');

        const contact = await getUserContactInfo(userId);
        const scheduledFor = parseScheduleTime(params.when, contact?.timezone);

        if (!scheduledFor) {
          return "I couldn't parse that time. Try 'Friday morning' or 'in 3 days'.";
        }

        const result = await scheduleEmail(
          userId,
          params.subject,
          params.message,
          scheduledFor,
          personaId
        );

        if (result.success) {
          const timeStr = scheduledFor.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          return `Email scheduled for ${timeStr} with subject: "${params.subject}"`;
        } else {
          if (result.error?.includes('email')) {
            return "I don't have your email address. What's your email?";
          }
          return `I couldn't schedule that email: ${result.error}`;
        }
      },
    }),
};

// ============================================================================
// SEND MESSAGE NOW TOOL
// ============================================================================

const sendMessageNowTool: ToolDefinition = {
  id: 'sendMessageNow',
  name: 'Send Message Now',
  description: 'Send an immediate text message to the user.',
  domain: 'scheduling',
  tags: ['messaging', 'sms', 'text', 'immediate', 'now'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Send an immediate text message.
Use when the user says:
- "Text me that"
- "Send that to my phone"
- "Text me the summary"`,
      parameters: z.object({
        message: z.string().describe('The text message to send immediately'),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';
        const personaId = ctx.agentId || 'ferni';

        log.info({ userId }, '📱 Sending immediate text');

        const result = await textUser(userId, params.message, personaId);

        if (result.success) {
          return `Done! I just texted you: "${params.message}"`;
        } else {
          if (result.error?.includes('phone')) {
            return "I don't have your phone number. What's your number?";
          }
          return `I couldn't send that text: ${result.error}`;
        }
      },
    }),
};

// ============================================================================
// LIST SCHEDULED ACTIONS TOOL
// ============================================================================

const listScheduledTool: ToolDefinition = {
  id: 'listScheduled',
  name: 'List Scheduled Actions',
  description: 'View all pending scheduled messages, calls, and emails.',
  domain: 'scheduling',
  tags: ['scheduling', 'list', 'pending', 'view'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `List all pending scheduled actions (messages, calls, emails).
Use when the user asks:
- "What do I have scheduled?"
- "Show my pending reminders"
- "What messages are queued up?"`,
      parameters: z.object({}),
      execute: async () => {
        const userId = ctx.userId || 'unknown';

        log.info({ userId }, '📋 Listing scheduled actions');

        const pending = getPendingReminders(userId);

        if (pending.length === 0) {
          return "You don't have any scheduled messages, calls, or emails pending.";
        }

        const items = pending.map((r, i) => {
          const timeStr = r.scheduledFor.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          const typeEmoji =
            r.deliveryMethod === 'sms' ? '📱' : r.deliveryMethod === 'call' ? '📞' : '📧';
          return `${i + 1}. ${typeEmoji} ${timeStr}: "${r.message.slice(0, 50)}${r.message.length > 50 ? '...' : ''}"`;
        });

        return `You have ${pending.length} scheduled:\n${items.join('\n')}`;
      },
    }),
};

// ============================================================================
// CANCEL SCHEDULED ACTION TOOL
// ============================================================================

const cancelScheduledTool: ToolDefinition = {
  id: 'cancelScheduled',
  name: 'Cancel Scheduled Action',
  description: 'Cancel a pending scheduled message, call, or email.',
  domain: 'scheduling',
  tags: ['scheduling', 'cancel', 'remove', 'delete'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Cancel a scheduled action.
Use when the user says:
- "Cancel my scheduled text"
- "Don't send that reminder"
- "Remove the scheduled call"

If multiple items exist, asks which one to cancel.`,
      parameters: z.object({
        which: z
          .string()
          .optional()
          .describe('Which scheduled item to cancel - can be number (1, 2) or description'),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';

        log.info({ userId, which: params.which }, '❌ Cancelling scheduled action');

        const pending = getPendingReminders(userId);

        if (pending.length === 0) {
          return "You don't have any scheduled actions to cancel.";
        }

        // If only one item, cancel it
        if (pending.length === 1) {
          const cancelled = cancelReminder(pending[0].id);
          if (cancelled) {
            return `Cancelled: "${pending[0].message.slice(0, 50)}..."`;
          }
          return 'I had trouble cancelling that. Try again?';
        }

        // Multiple items - try to match by number or content
        if (params.which) {
          const num = parseInt(params.which);
          if (!isNaN(num) && num >= 1 && num <= pending.length) {
            const item = pending[num - 1];
            const cancelled = cancelReminder(item.id);
            if (cancelled) {
              return `Cancelled #${num}: "${item.message.slice(0, 50)}..."`;
            }
          }

          // Try matching by content
          const match = pending.find(
            (r) =>
              r.message.toLowerCase().includes(params.which!.toLowerCase()) ||
              r.deliveryMethod.includes(params.which!.toLowerCase())
          );
          if (match) {
            const cancelled = cancelReminder(match.id);
            if (cancelled) {
              return `Cancelled: "${match.message.slice(0, 50)}..."`;
            }
          }
        }

        // Show list and ask which one
        const items = pending.map((r, i) => {
          const timeStr = r.scheduledFor.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          });
          return `${i + 1}. ${timeStr}: "${r.message.slice(0, 30)}..."`;
        });

        return `Which one should I cancel?\n${items.join('\n')}`;
      },
    }),
};

// ============================================================================
// SAVE CONTACT INFO TOOL
// ============================================================================

const saveContactInfoTool: ToolDefinition = {
  id: 'saveContactInfo',
  name: 'Save Contact Info',
  description: "Save the user's phone number or email for future messages.",
  domain: 'scheduling',
  tags: ['contact', 'phone', 'email', 'save'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Save user's contact information for scheduling messages.
Use when the user shares their phone or email:
- "My number is 555-123-4567"
- "Email me at john@example.com"`,
      parameters: z.object({
        phone: z.string().optional().describe('Phone number in any format'),
        email: z.string().optional().describe('Email address'),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';

        if (!params.phone && !params.email) {
          return 'I need at least a phone number or email to save.';
        }

        await setUserContactInfo(userId, {
          phone: params.phone,
          email: params.email,
        });

        const saved: string[] = [];
        if (params.phone) saved.push('phone number');
        if (params.email) saved.push('email');

        return `Got it! I saved your ${saved.join(' and ')}. Now I can send you texts, emails, or calls.`;
      },
    }),
};

// ============================================================================
// INTELLIGENT SCHEDULING: GET OPTIMAL SEND TIME
// ============================================================================

const getOptimalSendTimeTool: ToolDefinition = {
  id: 'getOptimalSendTime',
  name: 'Get Optimal Send Time',
  description:
    'Get ML-recommended best time to reach a contact based on learned response patterns.',
  domain: 'scheduling',
  tags: ['scheduling', 'optimal', 'best-time', 'intelligent', 'ml', 'timing'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Get the best time to reach someone based on learned patterns.
Use when the user asks things like:
- "When's the best time to reach Sarah?"
- "What time does John usually respond?"
- "When should I text my mom?"
- "What's the optimal time to contact them?"

Returns the ML-learned optimal time slot and day with confidence level.`,
      parameters: z.object({
        contactName: z.string().describe('Name of the person to check timing for'),
        contactId: z
          .string()
          .optional()
          .describe('Contact ID if known, otherwise will lookup by name'),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';

        log.info({ userId, contactName: params.contactName }, '🧠 Getting optimal send time');

        try {
          // Use contactId if provided, otherwise generate from name
          const contactId =
            params.contactId || `contact_${params.contactName.toLowerCase().replace(/\s+/g, '_')}`;

          const recommendation = await getTimingRecommendation(
            userId,
            contactId,
            params.contactName
          );

          // Format human-friendly response
          const confidenceText = {
            high: "I'm confident about this",
            medium: "I'm learning their patterns",
            low: 'Still gathering data',
            learning: 'Using smart defaults while I learn',
          }[recommendation.confidenceLevel];

          const responseRateText =
            recommendation.expectedResponseRate > 0
              ? ` They respond about ${recommendation.expectedResponseRate}% of the time in this window.`
              : '';

          return `Best time to reach ${params.contactName}: **${recommendation.recommendedTimeLabel}**

${confidenceText} (${recommendation.dataPoints} interactions tracked).${responseRateText}

Next optimal window: ${recommendation.suggestedSendTime.toLocaleString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}

Want me to schedule something for then?`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to get optimal timing');
          return `I don't have enough data yet to suggest optimal timing for ${params.contactName}. I'll learn their patterns over time!`;
        }
      },
    }),
};

// ============================================================================
// INTELLIGENT SCHEDULING: SCHEDULE AT BEST TIME
// ============================================================================

const scheduleAtBestTimeTool: ToolDefinition = {
  id: 'scheduleAtBestTime',
  name: 'Schedule At Best Time',
  description:
    'Schedule a message, call, or email at the ML-recommended optimal time for the recipient.',
  domain: 'scheduling',
  tags: ['scheduling', 'optimal', 'best-time', 'intelligent', 'smart', 'ml'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: `Schedule a message for the optimal time based on ML-learned patterns.
Use when the user says things like:
- "Text Sarah at the best time"
- "Schedule this for when John usually responds"
- "Send this email at the optimal time"
- "Message them when they're most likely to see it"

Automatically picks the best time based on learned response patterns.`,
      parameters: z.object({
        message: z.string().describe('The message content to send'),
        contactName: z.string().describe('Name of the recipient'),
        contactId: z.string().optional().describe('Contact ID if known'),
        channel: z
          .enum(['text', 'email', 'call'])
          .default('text')
          .describe('How to send: text (SMS), email, or call'),
        subject: z.string().optional().describe('Email subject line (required for email channel)'),
      }),
      execute: async (params) => {
        const userId = ctx.userId || 'unknown';
        const personaId = ctx.agentId || 'ferni';

        log.info(
          { userId, contactName: params.contactName, channel: params.channel },
          '🧠 Scheduling at optimal time'
        );

        try {
          // Get optimal timing
          const contactId =
            params.contactId || `contact_${params.contactName.toLowerCase().replace(/\s+/g, '_')}`;
          const recommendation = await getTimingRecommendation(
            userId,
            contactId,
            params.contactName
          );

          const scheduledFor = recommendation.suggestedSendTime;
          let result: { success: boolean; error?: string };

          // Contact tracking options for ML learning
          const contactOptions = {
            contactId,
            contactName: params.contactName,
            isDirectToContact: false, // For now, reminders to self about contact
          };

          // Schedule based on channel
          switch (params.channel) {
            case 'email':
              if (!params.subject) {
                return 'I need a subject line for the email. What should it say?';
              }
              result = await scheduleEmail(
                userId,
                params.subject,
                params.message,
                scheduledFor,
                personaId,
                contactOptions
              );
              break;
            case 'call':
              result = await scheduleCall(
                userId,
                params.message,
                scheduledFor,
                personaId,
                contactOptions
              );
              break;
            case 'text':
            default:
              result = await scheduleText(
                userId,
                params.message,
                scheduledFor,
                personaId,
                contactOptions
              );
              break;
          }

          if (result.success) {
            const timeStr = scheduledFor.toLocaleString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            const channelEmoji =
              params.channel === 'text' ? '📱' : params.channel === 'email' ? '📧' : '📞';
            const confidenceNote =
              recommendation.confidenceLevel === 'high'
                ? " - that's when they usually respond best!"
                : recommendation.confidenceLevel === 'medium'
                  ? " - based on what I've learned so far."
                  : ' - using smart defaults while I learn their patterns.';

            return `${channelEmoji} Got it! Scheduled for **${timeStr}**${confidenceNote}

Message: "${params.message.slice(0, 100)}${params.message.length > 100 ? '...' : ''}"`;
          } else {
            if (result.error?.includes('phone')) {
              return "I don't have your phone number yet. What's a good number?";
            }
            if (result.error?.includes('email')) {
              return "I don't have an email address on file. What's your email?";
            }
            return `Couldn't schedule that: ${result.error}`;
          }
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to schedule at optimal time');
          return 'Something went wrong scheduling that. Want to try specifying a time instead?';
        }
      },
    }),
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const schedulingTools: ToolDefinition[] = [
  scheduleMessageTool,
  scheduleCallTool,
  scheduleEmailTool,
  sendMessageNowTool,
  listScheduledTool,
  cancelScheduledTool,
  saveContactInfoTool,
  // Intelligent scheduling tools
  getOptimalSendTimeTool,
  scheduleAtBestTimeTool,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'scheduling',
  schedulingTools
);

export default getToolDefinitions;
