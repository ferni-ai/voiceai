/**
 * Reminder Tools
 *
 * General-purpose reminder tools for the voice agent.
 * "Remind me to..." - simple, human-friendly reminders.
 *
 * Uses the reminder-scheduler service for persistent storage and delivery.
 *
 * @module tools/domains/productivity/reminders
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  createReminder,
  getPendingReminders,
  cancelReminder,
  parseNaturalTime,
  userTimeZone,
  type ReminderDeliveryMethod,
} from '../../../services/scheduling/reminder-scheduler.js';
import { recordReminderPromise } from '../../../services/superhuman/semantic-intelligence/promise-keeper.js';
import { userReach } from '../../../services/outreach/user-reach.js';
import { isAssistantActionsReal } from '../../../config/assistant-actions-flag.js';
import { isReminderSmsDefaultOn } from '../../../config/reminder-sms-flag.js';
import { formatStoredLocalTime } from '../../../utils/time-zone.js';
import { asksToRepeat, NO_REPEAT_YET } from '../../utils/honest-schedule.js';
import { withOutreachConfirmation } from '../communication/outreach/outreach-confirm.js';
import { WHERE_TO_ADD_NUMBER } from '../../shared/where-to-add-number.js';
import { reminderConfirm } from '../communication/outreach/outreach-confirm-specs.js';
import {
  earlierReminderFor,
  holdUnsaidReminderTime,
  rememberReminderSet,
  reminderTimeFromCallerOn,
} from './reminder-time-heard.js';

const log = getLogger();

// ============================================================================
// SET REMINDER TOOL
// ============================================================================

/** The user asked for a text but there's no verified number to send it to. */
export const NO_NUMBER_TO_TEXT = `I don't have a verified number for you, so I can't text this one. ${WHERE_TO_ADD_NUMBER} For now I can keep it in the app. Want that?`;

/** REMINDER_SMS_DEFAULT: they asked for a text, there's no verified number, so it was kept in the app. */
export const KEPT_IN_APP_NO_NUMBER = `I don't have a verified number for you, so I'll leave this one in the Ferni app instead of texting it. ${WHERE_TO_ADD_NUMBER}`;

/**
 * With ASSISTANT_ACTIONS_REAL on, where a reminder for the user is texted: only
 * the verified number on their account, never one the model passes in. Asking
 * for a text, or having a phone-first account (the app inbox is somewhere they
 * never look), is consent for this one text; otherwise texts need the user's
 * standing opt-in. null = no text, keep the in-app reminder.
 */
async function textAddress(userId: string, askedForText: boolean): Promise<string | null> {
  const phoneFirst = userId.startsWith('phone:');
  try {
    const reach = await userReach(userId, 'sms', { standingOptIn: !askedForText && !phoneFirst });
    return reach.phone ?? null;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not look up where to text the reminder');
    return null;
  }
}

const SET_REMINDER_TEXT = `Set a reminder for the user. Supports natural language times like "in 30 minutes", "tomorrow at 2pm", "next Monday morning". The reminder will be delivered via the specified method (defaults to voice message in the next conversation).`;
const CALLER_TIME_TEXT =
  'Use only a time the caller said. If they did not say when, leave "when" out and ask them. If they correct the time of a reminder you just set, call this again with the same message and the new time: it moves that reminder.';
const WHEN_TEXT =
  'When to send the reminder in natural language (e.g., "in 30 minutes", "tomorrow at 2pm", "next Monday")';
const WHEN_HEARD_TEXT = "in the caller's own words. Leave out if they didn't say when.";

/**
 * Natural language reminder tool
 * "Remind me to call mom tomorrow at 2pm"
 * "Set a reminder for 30 minutes from now to check the oven"
 */
const setReminderDef: ToolDefinition = {
  id: 'setReminder',
  name: 'Set Reminder',
  description: 'Set a personal reminder with natural language time',
  domain: 'productivity',
  tags: ['reminders', 'notifications', 'scheduling'],

  create: (ctx: ToolContext): Tool => {
    // REMINDER_TIME_FROM_CALLER: `when` is the caller's own words, or left out (#2289).
    const heard = reminderTimeFromCallerOn();
    return llm.tool({
      description: heard ? `${SET_REMINDER_TEXT} ${CALLER_TIME_TEXT}` : SET_REMINDER_TEXT,
      parameters: z.object({
        message: z
          .string()
          .describe(
            'What to remind the user about (e.g., "call mom", "take medication", "check the oven")'
          ),
        when: heard
          ? z.string().optional().describe(`${WHEN_TEXT}, ${WHEN_HEARD_TEXT}`)
          : z.string().describe(WHEN_TEXT),
        deliveryMethod: z
          .enum(['sms', 'email', 'voice_message'])
          .optional()
          .describe(
            'How to deliver the reminder. Use sms only when the user asks to be texted. Defaults to voice_message (the app inbox)'
          ),
        deliveryAddress: z
          .string()
          .optional()
          .describe('Phone number or email for delivery. Only needed for sms/email.'),
      }),
      execute: async (params, opts?: { ctx?: unknown }) => {
        const { message, when: asked, deliveryMethod = 'voice_message', deliveryAddress } = params;
        log.info({ userId: ctx.userId, message, when: asked, deliveryMethod }, 'Setting reminder');

        const unsaid = holdUnsaidReminderTime(asked, opts?.ctx);
        if (unsaid) {
          log.info({ userId: ctx.userId, when: asked }, 'Reminder time not said by caller');
          return unsaid;
        }
        const when = asked ?? '';

        // Parse the natural language time
        const zone = userTimeZone(ctx);
        const scheduledFor = parseNaturalTime(when, zone);
        if (!scheduledFor) {
          return `I couldn't understand "${when}" as a time. Try something like "in 30 minutes", "tomorrow at 2pm", or "next Monday morning".`;
        }

        let method: ReminderDeliveryMethod = deliveryMethod;
        let address = deliveryAddress || '';
        let keptInApp = '';
        // A number from textAddress is the account's verified phone; delivery checks it still is.
        let addressSource: 'verified-own' | undefined;
        if (!isAssistantActionsReal() && isReminderSmsDefaultOn() && deliveryMethod === 'sms') {
          // Only the account's verified number, never deliveryAddress from the model.
          const phone = await textAddress(ctx.userId, true);
          method = phone ? 'sms' : 'voice_message';
          address = phone ?? '';
          addressSource = phone ? 'verified-own' : undefined;
          keptInApp = phone ? '' : ` ${KEPT_IN_APP_NO_NUMBER}`;
        } else if (isAssistantActionsReal() && deliveryMethod !== 'email') {
          const phone = await textAddress(ctx.userId, deliveryMethod === 'sms');
          if (phone) {
            method = 'sms';
            address = phone;
            addressSource = 'verified-own';
          } else if (deliveryMethod === 'sms') {
            return NO_NUMBER_TO_TEXT;
          }
        }

        // For SMS/email, we need a delivery address
        // For voice_message, we'll use the user's session to deliver it
        if ((method === 'sms' || method === 'email') && !address) {
          return `I need a ${method === 'sms' ? 'phone number' : 'email address'} to send the reminder. What should I use?`;
        }

        // For voice_message, store a marker that gets checked on session start
        if (method === 'voice_message') {
          address = `voice:${ctx.userId}`;
        }

        try {
          const reminder = await createReminder({
            userId: ctx.userId,
            message,
            scheduledFor,
            timezone: zone,
            deliveryMethod: method,
            deliveryAddress: address,
            addressSource,
            createdBy: ctx.agentId || 'ferni',
            personaId: ctx.agentId,
          });
          // Ferni just said "I'll remind you": the delivery job keeps or misses it.
          await recordReminderPromise(ctx.userId, reminder);

          // A new time for a reminder set earlier in this call moves it (cancelling
          // also removes its calendar item and releases its promise).
          const earlier = earlierReminderFor(message, opts?.ctx);
          const moved =
            earlier && earlier.id !== reminder.id && (await cancelReminder(earlier.id))
              ? ` It replaces the one for ${formatStoredLocalTime(earlier.scheduledFor, zone)}, which is cancelled.`
              : '';
          rememberReminderSet(opts?.ctx, { id: reminder.id, message, scheduledFor });

          // Read back exactly what was stored: the user's local time, one
          // occurrence, and where it lands (a voice reminder is an app message).
          // With texts on, the delivery job texts an app reminder to their verified number.
          const how =
            method === 'voice_message' && isReminderSmsDefaultOn() && !keptInApp
              ? "by text, or in the Ferni app if I can't text you"
              : method === 'voice_message'
                ? 'as a message in the Ferni app'
                : method === 'sms'
                  ? 'by text'
                  : 'by email';

          log.info(
            { reminderId: reminder.id, scheduledFor: scheduledFor.toISOString() },
            'Reminder created'
          );

          const repeat = asksToRepeat(message, when) ? NO_REPEAT_YET : '';
          return `Saved: ${formatStoredLocalTime(scheduledFor, zone)}, one reminder to "${message}", sent ${how}.${moved}${keptInApp}${repeat}`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to create reminder');
          return "I couldn't set that reminder. Let me try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// GET REMINDERS TOOL
// ============================================================================

/**
 * View pending reminders
 */
const getRemindersDef: ToolDefinition = {
  id: 'getReminders',
  name: 'Get Reminders',
  description: 'View pending reminders',
  domain: 'productivity',
  tags: ['reminders', 'list', 'view'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Get a list of pending reminders for the user',
      parameters: z.object({}),
      execute: async () => {
        const reminders = getPendingReminders(ctx.userId);

        if (reminders.length === 0) {
          return "You don't have any pending reminders right now.";
        }

        const zone = userTimeZone(ctx);
        const reminderList = reminders.map((r, i) => {
          const timeStr = formatStoredLocalTime(r.scheduledFor, zone);
          return `${i + 1}. "${r.message}" - ${timeStr}`;
        });

        return `You have ${reminders.length} pending reminder${reminders.length > 1 ? 's' : ''}:\n${reminderList.join('\n')}`;
      },
    });
  },
};

// ============================================================================
// CANCEL REMINDER TOOL
// ============================================================================

/**
 * Cancel a pending reminder
 */
const cancelReminderDef: ToolDefinition = {
  id: 'cancelReminder',
  name: 'Cancel Reminder',
  description: 'Cancel a pending reminder',
  domain: 'productivity',
  tags: ['reminders', 'cancel', 'delete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Cancel a pending reminder by its message content or number in the list',
      parameters: z.object({
        reminderQuery: z
          .string()
          .describe(
            'The reminder to cancel - either the message content or number from the list (e.g., "call mom" or "1")'
          ),
      }),
      execute: async (params) => {
        const { reminderQuery } = params;
        const reminders = getPendingReminders(ctx.userId);

        if (reminders.length === 0) {
          return "You don't have any pending reminders to cancel.";
        }

        // Try to find the reminder by number or content
        let targetReminder = null;
        const queryLower = reminderQuery.toLowerCase().trim();

        // Check if it's a number
        const num = parseInt(queryLower);
        if (!isNaN(num) && num > 0 && num <= reminders.length) {
          targetReminder = reminders[num - 1];
        } else {
          // Search by message content
          targetReminder = reminders.find((r) => r.message.toLowerCase().includes(queryLower));
        }

        if (!targetReminder) {
          return `I couldn't find a reminder matching "${reminderQuery}". Say "what are my reminders" to see the list.`;
        }

        const success = await cancelReminder(targetReminder.id);
        if (success) {
          log.info({ reminderId: targetReminder.id }, 'Reminder cancelled');
          return `Done! I cancelled the reminder: "${targetReminder.message}"`;
        } else {
          return "I couldn't cancel that reminder. It may have already been sent.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * A reminder to an address the model named waits for a yes. With either flag
 * on, a text ignores that address (verified phone only), so only email uses it.
 */
const toNamedAddress = withOutreachConfirmation(setReminderDef, {
  ...reminderConfirm,
  applies: (a) =>
    reminderConfirm.applies!(a) &&
    (a.deliveryMethod === 'email' ||
      !(isAssistantActionsReal() || (isReminderSmsDefaultOn() && a.deliveryMethod === 'sms'))),
});

export const reminderTools: ToolDefinition[] = [toNamedAddress, getRemindersDef, cancelReminderDef];

export function createReminderTools(): ToolDefinition[] {
  return reminderTools;
}

export default reminderTools;
