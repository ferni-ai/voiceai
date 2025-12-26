/**
 * Unified Schedule View Tool
 *
 * A "Better than Human" capability that provides a comprehensive view of ALL
 * scheduled items across the user's life:
 * - Calendar events (meetings, appointments)
 * - Reminders
 * - Scheduled messages (text, email, call)
 * - Pending appointments (restaurant reservations, doctor visits, etc.)
 *
 * No human assistant could maintain this level of visibility across all
 * scheduling systems. This is true superhuman intelligence.
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { getEventsForDay, getEventsForWeek, type CalendarEvent } from '../../../services/calendar/calendar-service.js';
import { getPendingReminders, type ScheduledReminder } from '../../../services/scheduling/reminder-scheduler.js';
import { getUserAppointments } from '../../scheduling/appointment-core.js';
import type { ScheduledAppointment } from '../../scheduling/types.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { createDomainExport } from '../../registry/loader.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface UnifiedScheduleItem {
  id: string;
  type: 'event' | 'reminder' | 'scheduled_text' | 'scheduled_email' | 'scheduled_call' | 'appointment';
  title: string;
  scheduledFor: Date;
  endTime?: Date;
  status: string;
  source: 'calendar' | 'reminder' | 'appointment';
  icon: string;
  details?: string;
}

interface DaySchedule {
  date: string;
  dayName: string;
  items: UnifiedScheduleItem[];
  conflicts: Array<{ item1: string; item2: string; overlapMinutes: number }>;
  busyHours: number;
  freeHours: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert calendar event to unified item
 */
function calendarToUnified(event: CalendarEvent): UnifiedScheduleItem {
  return {
    id: event.id,
    type: 'event',
    title: event.title,
    scheduledFor: event.startTime,
    endTime: event.endTime,
    status: event.status,
    source: 'calendar',
    icon: '📅',
    details: event.location ? `at ${event.location}` : undefined,
  };
}

/**
 * Convert reminder to unified item
 */
function reminderToUnified(reminder: ScheduledReminder): UnifiedScheduleItem {
  const typeIcons: Record<string, string> = {
    sms: '📱',
    email: '📧',
    call: '📞',
    voice_message: '🎤',
  };

  const typeLabels: Record<string, string> = {
    sms: 'scheduled_text',
    email: 'scheduled_email',
    call: 'scheduled_call',
    voice_message: 'scheduled_text',
  };

  return {
    id: reminder.id,
    type: (typeLabels[reminder.deliveryMethod] || 'reminder') as UnifiedScheduleItem['type'],
    title: reminder.contactName
      ? `${typeLabels[reminder.deliveryMethod] === 'scheduled_email' ? 'Email' : reminder.deliveryMethod === 'call' ? 'Call' : 'Text'} ${reminder.contactName}`
      : reminder.message.substring(0, 50),
    scheduledFor: reminder.scheduledFor,
    status: reminder.status,
    source: 'reminder',
    icon: typeIcons[reminder.deliveryMethod] || '🔔',
    details: reminder.isDirectToContact ? `To: ${reminder.contactName}` : reminder.message.substring(0, 100),
  };
}

/**
 * Convert appointment to unified item
 */
function appointmentToUnified(apt: ScheduledAppointment): UnifiedScheduleItem {
  const typeIcons: Record<string, string> = {
    restaurant: '🍽️',
    doctor: '🩺',
    dentist: '🦷',
    salon: '💇',
    spa: '🧖',
    veterinary: '🐾',
    general_service: '📋',
    consultation: '💼',
    other: '📌',
  };

  return {
    id: apt.id,
    type: 'appointment',
    title: `${apt.type.charAt(0).toUpperCase() + apt.type.slice(1)} at ${apt.businessName}`,
    scheduledFor: apt.confirmedDateTime || apt.requestedDateTime,
    status: apt.status,
    source: 'appointment',
    icon: typeIcons[apt.type] || '📅',
    details: apt.confirmationNumber
      ? `Confirmation #${apt.confirmationNumber}`
      : apt.status === 'pending'
        ? 'Awaiting confirmation'
        : undefined,
  };
}

/**
 * Detect conflicts between items
 */
function detectItemConflicts(
  items: UnifiedScheduleItem[]
): Array<{ item1: string; item2: string; overlapMinutes: number }> {
  const conflicts: Array<{ item1: string; item2: string; overlapMinutes: number }> = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const item1 = items[i];
      const item2 = items[j];

      const item1Start = item1.scheduledFor.getTime();
      const item1End = item1.endTime?.getTime() || item1Start + 15 * 60000; // Default 15 min
      const item2Start = item2.scheduledFor.getTime();
      const item2End = item2.endTime?.getTime() || item2Start + 15 * 60000;

      // Check for overlap
      if (item1Start < item2End && item1End > item2Start) {
        const overlapStart = Math.max(item1Start, item2Start);
        const overlapEnd = Math.min(item1End, item2End);
        const overlapMinutes = Math.floor((overlapEnd - overlapStart) / 60000);

        if (overlapMinutes > 0) {
          conflicts.push({
            item1: item1.title,
            item2: item2.title,
            overlapMinutes,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Format time for speech
 */
function formatTimeForSpeech(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format the unified schedule for speech output
 */
function formatScheduleForSpeech(schedule: DaySchedule): string {
  if (schedule.items.length === 0) {
    return `${schedule.dayName} is clear. No scheduled items.`;
  }

  const parts: string[] = [];
  parts.push(`${schedule.dayName}: ${schedule.items.length} item${schedule.items.length !== 1 ? 's' : ''}.`);

  // Group by morning/afternoon/evening
  const morning = schedule.items.filter((i) => i.scheduledFor.getHours() < 12);
  const afternoon = schedule.items.filter((i) => i.scheduledFor.getHours() >= 12 && i.scheduledFor.getHours() < 17);
  const evening = schedule.items.filter((i) => i.scheduledFor.getHours() >= 17);

  if (morning.length > 0) {
    parts.push(
      `Morning: ${morning.map((i) => `${i.icon} ${i.title} at ${formatTimeForSpeech(i.scheduledFor)}`).join(', ')}.`
    );
  }

  if (afternoon.length > 0) {
    parts.push(
      `Afternoon: ${afternoon.map((i) => `${i.icon} ${i.title} at ${formatTimeForSpeech(i.scheduledFor)}`).join(', ')}.`
    );
  }

  if (evening.length > 0) {
    parts.push(
      `Evening: ${evening.map((i) => `${i.icon} ${i.title} at ${formatTimeForSpeech(i.scheduledFor)}`).join(', ')}.`
    );
  }

  // Mention conflicts
  if (schedule.conflicts.length > 0) {
    parts.push(
      `⚠️ Warning: ${schedule.conflicts.length} scheduling conflict${schedule.conflicts.length !== 1 ? 's' : ''} detected.`
    );
  }

  return parts.join(' ');
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const getUnifiedScheduleDef: ToolDefinition = {
  id: 'getUnifiedSchedule',
  name: 'Get Unified Schedule',
  description: `Get a comprehensive view of ALL scheduled items for a day or week.
Includes: calendar events, reminders, scheduled messages, appointments.
This is a "Better than Human" view - no human assistant could track all this.`,
  domain: 'scheduling',
  tags: ['scheduling', 'calendar', 'reminders', 'appointments', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get a unified view of all scheduled items.
Shows calendar events, reminders, scheduled texts/emails/calls, and appointments.
Use when user asks about their schedule, what's coming up, or wants to see everything.`,
      parameters: z.object({
        timeRange: z
          .enum(['today', 'tomorrow', 'this_week', 'next_7_days'])
          .default('today')
          .describe('Time range to view'),
        includeCompleted: z
          .boolean()
          .default(false)
          .describe('Include already delivered/completed items'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        log.info({ userId, timeRange: params.timeRange }, '📊 Getting unified schedule');

        try {
          const now = new Date();
          const results: DaySchedule[] = [];

          // Determine date range
          const dates: Date[] = [];
          switch (params.timeRange) {
            case 'today':
              dates.push(now);
              break;
            case 'tomorrow':
              const tomorrow = new Date(now);
              tomorrow.setDate(tomorrow.getDate() + 1);
              dates.push(tomorrow);
              break;
            case 'this_week':
            case 'next_7_days':
              for (let i = 0; i < 7; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() + i);
                dates.push(date);
              }
              break;
          }

          // Get all scheduled items
          const reminders = getPendingReminders(userId);
          const appointments = getUserAppointments(userId);

          for (const date of dates) {
            // Get calendar events for this day
            const events = await getEventsForDay(userId, date);

            // Filter items for this day
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const dayReminders = reminders.filter((r) => {
              const time = r.scheduledFor.getTime();
              return time >= dayStart.getTime() && time <= dayEnd.getTime();
            });

            const dayAppointments = appointments.filter((a) => {
              const time = (a.confirmedDateTime || a.requestedDateTime).getTime();
              return time >= dayStart.getTime() && time <= dayEnd.getTime();
            });

            // Convert to unified items
            const unifiedItems: UnifiedScheduleItem[] = [
              ...events.map(calendarToUnified),
              ...dayReminders.map(reminderToUnified),
              ...dayAppointments.map(appointmentToUnified),
            ];

            // Filter completed if needed
            const filteredItems = params.includeCompleted
              ? unifiedItems
              : unifiedItems.filter((i) => i.status !== 'delivered' && i.status !== 'cancelled');

            // Sort by time
            filteredItems.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

            // Detect conflicts
            const conflicts = detectItemConflicts(filteredItems);

            // Calculate busy hours (excluding all-day events and short items)
            const busyMinutes = filteredItems
              .filter((i) => i.endTime)
              .reduce((sum, i) => {
                const duration = (i.endTime!.getTime() - i.scheduledFor.getTime()) / 60000;
                return sum + Math.min(duration, 8 * 60); // Cap at 8 hours
              }, 0);

            const daySchedule: DaySchedule = {
              date: date.toISOString().split('T')[0],
              dayName: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
              items: filteredItems,
              conflicts,
              busyHours: Math.round(busyMinutes / 60 * 10) / 10,
              freeHours: Math.max(0, 9 - busyMinutes / 60), // Assuming 9-hour work day
            };

            results.push(daySchedule);
          }

          // Format for speech
          if (params.timeRange === 'today' || params.timeRange === 'tomorrow') {
            return formatScheduleForSpeech(results[0]);
          }

          // Weekly summary
          const totalItems = results.reduce((sum, d) => sum + d.items.length, 0);
          const totalConflicts = results.reduce((sum, d) => sum + d.conflicts.length, 0);
          const busiestDay = results.reduce((max, d) => (d.items.length > max.items.length ? d : max), results[0]);

          let summary = `This week: ${totalItems} scheduled items across ${results.length} days.\n\n`;

          for (const day of results) {
            if (day.items.length > 0) {
              summary += formatScheduleForSpeech(day) + '\n\n';
            }
          }

          if (totalConflicts > 0) {
            summary += `\n⚠️ ${totalConflicts} total conflicts this week need attention.`;
          }

          if (busiestDay.items.length > 3) {
            summary += `\n\n📊 Your busiest day is ${busiestDay.dayName} with ${busiestDay.items.length} items.`;
          }

          return summary.trim();
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to get unified schedule');
          return "I had trouble getting your complete schedule. Let me try checking just your calendar.";
        }
      },
    });
  },
};

const checkScheduleConflictsDef: ToolDefinition = {
  id: 'checkScheduleConflicts',
  name: 'Check Schedule Conflicts',
  description: `Check for any scheduling conflicts across all scheduled items.
Proactively identifies overlaps between meetings, reminders, and appointments.`,
  domain: 'scheduling',
  tags: ['scheduling', 'conflicts', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check for scheduling conflicts across all scheduled items.
Use when user wants to know if there are any conflicts or before scheduling something new.`,
      parameters: z.object({
        timeRange: z
          .enum(['today', 'tomorrow', 'this_week'])
          .default('today')
          .describe('Time range to check'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        log.info({ userId, timeRange: params.timeRange }, '🔍 Checking schedule conflicts');

        try {
          const now = new Date();
          const allConflicts: Array<{
            date: string;
            item1: string;
            item2: string;
            overlapMinutes: number;
          }> = [];

          const days = params.timeRange === 'today' ? 1 : params.timeRange === 'tomorrow' ? 1 : 7;
          const startDate = params.timeRange === 'tomorrow' ? new Date(now.setDate(now.getDate() + 1)) : now;

          for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);

            const events = await getEventsForDay(userId, date);
            const reminders = getPendingReminders(userId);
            const appointments = getUserAppointments(userId);

            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const dayItems: UnifiedScheduleItem[] = [
              ...events.map(calendarToUnified),
              ...reminders
                .filter((r) => r.scheduledFor >= dayStart && r.scheduledFor <= dayEnd)
                .map(reminderToUnified),
              ...appointments
                .filter((a) => {
                  const time = a.confirmedDateTime || a.requestedDateTime;
                  return time >= dayStart && time <= dayEnd;
                })
                .map(appointmentToUnified),
            ];

            const conflicts = detectItemConflicts(dayItems);
            for (const c of conflicts) {
              allConflicts.push({
                date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                ...c,
              });
            }
          }

          if (allConflicts.length === 0) {
            return `✅ No scheduling conflicts found for ${params.timeRange}. Your schedule is clear!`;
          }

          let response = `⚠️ Found ${allConflicts.length} scheduling conflict${allConflicts.length !== 1 ? 's' : ''}:\n\n`;

          for (const conflict of allConflicts) {
            response += `• ${conflict.date}: "${conflict.item1}" overlaps with "${conflict.item2}" by ${conflict.overlapMinutes} minutes\n`;
          }

          response += `\nWould you like me to help reschedule any of these?`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to check conflicts');
          return "I had trouble checking for conflicts. Let me try again.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('scheduling', [
  getUnifiedScheduleDef,
  checkScheduleConflictsDef,
]);

export { getUnifiedScheduleDef, checkScheduleConflictsDef };
