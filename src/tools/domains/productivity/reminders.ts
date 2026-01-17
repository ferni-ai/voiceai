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
  type ReminderDeliveryMethod,
} from '../../../services/scheduling/reminder-scheduler.js';

const log = getLogger();

// ============================================================================
// SET REMINDER TOOL
// ============================================================================

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
    return llm.tool({
      description: `Set a reminder for the user. Supports natural language times like "in 30 minutes", "tomorrow at 2pm", "next Monday morning". The reminder will be delivered via the specified method (defaults to voice message in the next conversation).`,
      parameters: z.object({
        message: z
          .string()
          .describe(
            'What to remind the user about (e.g., "call mom", "take medication", "check the oven")'
          ),
        when: z
          .string()
          .describe(
            'When to send the reminder in natural language (e.g., "in 30 minutes", "tomorrow at 2pm", "next Monday")'
          ),
        deliveryMethod: z
          .enum(['sms', 'email', 'voice_message'])
          .optional()
          .describe(
            'How to deliver the reminder. Defaults to voice_message (will remind in next conversation)'
          ),
        deliveryAddress: z
          .string()
          .optional()
          .describe('Phone number or email for delivery. Only needed for sms/email.'),
      }),
      execute: async (params) => {
        const { message, when, deliveryMethod = 'voice_message', deliveryAddress } = params;

        log.info({ userId: ctx.userId, message, when, deliveryMethod }, 'Setting reminder');

        // Parse the natural language time
        const scheduledFor = parseNaturalTime(when);
        if (!scheduledFor) {
          return `I couldn't understand "${when}" as a time. Try something like "in 30 minutes", "tomorrow at 2pm", or "next Monday morning".`;
        }

        // For SMS/email, we need a delivery address
        // For voice_message, we'll use the user's session to deliver it
        let address = deliveryAddress || '';
        if ((deliveryMethod === 'sms' || deliveryMethod === 'email') && !address) {
          return `I need a ${deliveryMethod === 'sms' ? 'phone number' : 'email address'} to send the reminder. What should I use?`;
        }

        // For voice_message, store a marker that gets checked on session start
        if (deliveryMethod === 'voice_message') {
          address = `voice:${ctx.userId}`;
        }

        try {
          const reminder = await createReminder({
            userId: ctx.userId,
            message,
            scheduledFor,
            deliveryMethod: deliveryMethod as ReminderDeliveryMethod,
            deliveryAddress: address,
            createdBy: ctx.agentId || 'ferni',
            personaId: ctx.agentId,
          });

          // Format a human-friendly confirmation
          const timeStr = formatReminderTime(scheduledFor);
          const methodStr =
            deliveryMethod === 'voice_message'
              ? "I'll remind you"
              : deliveryMethod === 'sms'
                ? "I'll text you"
                : "I'll email you";

          log.info(
            { reminderId: reminder.id, scheduledFor: scheduledFor.toISOString() },
            'Reminder created'
          );

          return `Got it! ${methodStr} ${timeStr} to "${message}".`;
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

        const reminderList = reminders.map((r, i) => {
          const timeStr = formatReminderTime(r.scheduledFor);
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a reminder time in a human-friendly way
 */
function formatReminderTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  // Very soon
  if (diffMins < 1) {
    return 'in less than a minute';
  }
  if (diffMins < 60) {
    return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  }
  if (diffHours < 24) {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `in about ${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  // Tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  if (date >= tomorrow && date < dayAfterTomorrow) {
    return `tomorrow at ${formatTime(date)}`;
  }

  // This week (within 7 days)
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `on ${dayName} at ${formatTime(date)}`;
  }

  // Further out
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `on ${dateStr} at ${formatTime(date)}`;
}

/**
 * Format time in 12-hour format
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const reminderTools: ToolDefinition[] = [setReminderDef, getRemindersDef, cancelReminderDef];

export function createReminderTools(): ToolDefinition[] {
  return reminderTools;
}

export default reminderTools;
