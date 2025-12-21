/**
 * Notification Tools
 *
 * Tools to manage and configure user notifications.
 * Allows users to:
 * - Set notification preferences
 * - Schedule habit reminders
 * - Enable/disable notification types
 * - View scheduled notifications
 *
 * NOTE: This is the agent-agnostic version. The original maya-notification-tools.ts
 * re-exports from this file for backward compatibility.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  getMayaNotificationService,
  type MayaNotificationType,
} from '../../../services/engagement/engagement-notification-service.js';

// ============================================================================
// NOTIFICATION TOOLS
// ============================================================================

export function createNotificationTools() {
  const service = getMayaNotificationService();

  return {
    /**
     * Get notification preferences
     */
    getNotificationPreferences: llm.tool({
      description: getToolDescription('getNotificationPreferences'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const prefs = await service.getPreferences(userId);

        getLogger().info({ userId, enabled: prefs.enabled }, '🔔 Got notification prefs');

        return {
          enabled: prefs.enabled,
          preferredMethod: prefs.preferredMethod,
          preferredTime: prefs.preferredTime || 'Not set (default 9:00 AM)',
          quietHours:
            prefs.quietHoursStart !== undefined
              ? `${prefs.quietHoursStart}:00 - ${prefs.quietHoursEnd}:00`
              : 'Not set',
          enabledTypes: prefs.enabledTypes,
          frequency: prefs.frequency,
        };
      },
    }),

    /**
     * Enable or disable notifications
     */
    setNotificationsEnabled: llm.tool({
      description: getToolDescription('setNotificationsEnabled'),
      parameters: z.object({
        enabled: z.boolean().describe('Whether to enable notifications'),
      }),
      execute: async ({ enabled }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.setPreferences(userId, { enabled });

        getLogger().info({ userId, enabled }, '🔔 Notifications enabled/disabled');

        return {
          success: true,
          message: enabled
            ? "Notifications enabled! I'll send you helpful reminders and celebrations."
            : 'Notifications disabled. You can turn them back on anytime.',
        };
      },
    }),

    /**
     * Set preferred notification time
     */
    setPreferredTime: llm.tool({
      description: getToolDescription('setPreferredTime'),
      parameters: z.object({
        time: z.string().describe('Time in HH:MM format (e.g., "09:00" or "18:30")'),
      }),
      execute: async ({ time }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
          return { error: 'Invalid time format. Use HH:MM (e.g., "09:00")' };
        }

        await service.setPreferences(userId, { preferredTime: time });

        getLogger().info({ userId, time }, '⏰ Preferred time set');

        return {
          success: true,
          message: `Daily reminders will now arrive at ${time}!`,
        };
      },
    }),

    /**
     * Set notification delivery method
     */
    setDeliveryMethod: llm.tool({
      description: getToolDescription('setDeliveryMethod'),
      parameters: z.object({
        method: z.enum(['sms', 'email']).describe('Delivery method'),
      }),
      execute: async ({ method }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.setPreferences(userId, { preferredMethod: method });

        getLogger().info({ userId, method }, '📬 Delivery method set');

        return {
          success: true,
          message:
            method === 'sms'
              ? "I'll send notifications via text message!"
              : "I'll send notifications via email!",
        };
      },
    }),

    /**
     * Set quiet hours
     */
    setQuietHours: llm.tool({
      description: getToolDescription('setQuietHours'),
      parameters: z.object({
        startHour: z.number().min(0).max(23).describe('Hour when quiet hours start (0-23)'),
        endHour: z.number().min(0).max(23).describe('Hour when quiet hours end (0-23)'),
      }),
      execute: async ({ startHour, endHour }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.setPreferences(userId, {
          quietHoursStart: startHour,
          quietHoursEnd: endHour,
        });

        const formatHour = (h: number) => `${h.toString().padStart(2, '0')}:00`;

        getLogger().info({ userId, startHour, endHour }, '🌙 Quiet hours set');

        return {
          success: true,
          message: `Quiet hours set: ${formatHour(startHour)} to ${formatHour(endHour)}. No notifications during this time!`,
        };
      },
    }),

    /**
     * Enable/disable specific notification types
     */
    configureNotificationTypes: llm.tool({
      description: getToolDescription('configureNotificationTypes'),
      parameters: z.object({
        types: z
          .array(
            z.enum([
              'habit_reminder',
              'streak_at_risk',
              'streak_celebration',
              'challenge_day',
              'weekly_reflection',
              'proactive_checkin',
              'milestone_celebration',
              'comeback_welcome',
              'mood_checkin',
            ])
          )
          .describe('Types to enable'),
      }),
      execute: async ({ types }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.setPreferences(userId, {
          enabledTypes: types as MayaNotificationType[],
        });

        getLogger().info({ userId, types }, '📋 Notification types configured');

        return {
          success: true,
          enabledTypes: types,
          message: `Enabled ${types.length} notification type(s)!`,
        };
      },
    }),

    /**
     * Schedule a custom reminder
     */
    scheduleCustomReminder: llm.tool({
      description: getToolDescription('scheduleCustomReminder'),
      parameters: z.object({
        message: z.string().describe('The reminder message'),
        minutesFromNow: z
          .number()
          .min(1)
          .max(10080)
          .describe('Minutes from now to send (max 1 week)'),
      }),
      execute: async ({ message, minutesFromNow }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const scheduledFor = new Date();
        scheduledFor.setMinutes(scheduledFor.getMinutes() + minutesFromNow);

        const reminderId = await service.scheduleNotification({
          userId,
          type: 'proactive_checkin',
          scheduledFor,
          customMessage: message,
        });

        if (!reminderId) {
          return {
            error: 'Could not schedule reminder. Check notification preferences or contact info.',
          };
        }

        // Format time nicely
        const timeStr = scheduledFor.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dateStr =
          minutesFromNow > 60 * 24
            ? scheduledFor.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })
            : 'today';

        getLogger().info(
          { userId, reminderId, scheduledFor: scheduledFor.toISOString() },
          '📅 Custom reminder scheduled'
        );

        return {
          success: true,
          reminderId,
          scheduledFor: scheduledFor.toISOString(),
          message: `Reminder scheduled for ${timeStr} ${dateStr}!`,
        };
      },
    }),

    /**
     * Setup daily habit reminders
     */
    setupDailyReminders: llm.tool({
      description: getToolDescription('setupDailyReminders'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.scheduleDailyHabitReminders(userId);

        getLogger().info({ userId }, '📅 Daily reminders setup');

        return {
          success: true,
          message:
            "Daily habit reminders are set up! You'll get a nudge each day for your active habits.",
        };
      },
    }),

    /**
     * Setup weekly reflection reminder
     */
    setupWeeklyReflection: llm.tool({
      description: getToolDescription('setupWeeklyReflection'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await service.scheduleWeeklyReflection(userId);

        getLogger().info({ userId }, '📝 Weekly reflection scheduled');

        return {
          success: true,
          message:
            "Weekly reflection reminder set! I'll prompt you every Sunday evening to reflect on your week.",
        };
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createNotificationTools;
