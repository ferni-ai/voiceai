/**
 * Scheduling Team Handlers
 *
 * Example handlers demonstrating the new team handler registry pattern.
 * These handlers provide scheduling capabilities like events, reminders,
 * and recurring check-ins.
 *
 * USAGE:
 *   import { registerSchedulingHandlers } from './handlers/scheduling.js';
 *   registerSchedulingHandlers('alex');
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';
import { registerTeamHandler } from '../index.js';
import type { TeamHandlerDefinition } from '../types.js';
import {
  getLifeDataStore,
  type CalendarEvent,
  type RecurringCheckIn,
} from '../../stores/life-data-store.js';

// ============================================================================
// EVENT SCHEDULING HANDLERS
// ============================================================================

/**
 * Handler: Schedule an event
 * Capability: scheduling
 */
const scheduleEventHandler: TeamHandlerDefinition = {
  id: 'scheduleEvent',
  name: 'Schedule Event',
  description: 'Schedule an event on the calendar with optional reminders',
  capability: 'scheduling',
  tags: ['calendar', 'event', 'schedule'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { title, date, time, reminderDays, milestoneId, description } = request.params as {
      title: string;
      date: string;
      time?: string;
      reminderDays?: number[];
      milestoneId?: string;
      description?: string;
    };
    const userId = request.userId || 'default';

    // Validate
    if (!title || title.trim().length === 0) {
      return { success: false, error: 'Event title is required', executedBy: 'alex' };
    }

    if (!date) {
      return { success: false, error: 'Event date is required', executedBy: 'alex' };
    }

    const eventDate = new Date(date);
    if (isNaN(eventDate.getTime())) {
      return { success: false, error: 'Invalid date format', executedBy: 'alex' };
    }

    // Add time if provided
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        eventDate.setHours(hours, minutes);
      }
    }

    const id = `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const event: CalendarEvent = {
      id,
      userId,
      title: title.trim(),
      date: eventDate,
      description,
      linkedMilestoneId: milestoneId,
      source: 'manual',
      reminderDays: reminderDays || [1, 7],
      remindersSet: [],
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const store = getLifeDataStore();
      await store.saveCalendarEvent(userId, event);

      getLogger().info({ userId, eventId: id, date: eventDate }, 'Event scheduled');

      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      let result = `📅 Scheduled "${title}" for ${formattedDate}`;
      if (time) {
        result += ` at ${time}`;
      }
      if (reminderDays && reminderDays.length > 0) {
        result += `. Reminders set for ${reminderDays.join(', ')} day(s) before.`;
      }

      return { success: true, result, executedBy: 'alex' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to schedule event');
      return { success: false, error: 'Failed to save event', executedBy: 'alex' };
    }
  },
};

/**
 * Handler: Get upcoming events
 * Capability: scheduling
 */
const getUpcomingEventsHandler: TeamHandlerDefinition = {
  id: 'getUpcomingEvents',
  name: 'Get Upcoming Events',
  description: 'Get list of upcoming scheduled events',
  capability: 'scheduling',
  tags: ['calendar', 'events', 'list'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { daysAhead = 30, milestoneId } = request.params as {
      daysAhead?: number;
      milestoneId?: string;
    };
    const userId = request.userId || 'default';

    try {
      const store = getLifeDataStore();
      let events = await store.getCalendarEvents(userId);

      // Filter by date range
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      events = events.filter((e) => {
        const eventDate = new Date(e.date);
        return eventDate >= now && eventDate <= futureDate;
      });

      // Filter by milestone if specified
      if (milestoneId) {
        events = events.filter((e) => e.linkedMilestoneId === milestoneId);
      }

      // Sort by date
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (events.length === 0) {
        return {
          success: true,
          result: `No upcoming events in the next ${daysAhead} days.`,
          executedBy: 'alex',
        };
      }

      const eventList = events
        .slice(0, 10)
        .map((e) => {
          const eventDate = new Date(e.date);
          const formatted = eventDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          return `• ${formatted}: ${e.title}`;
        })
        .join('\n');

      return {
        success: true,
        result: `📅 **Upcoming Events (${events.length}):**\n${eventList}`,
        executedBy: 'alex',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get events');
      return { success: false, error: 'Failed to get events', executedBy: 'alex' };
    }
  },
};

// ============================================================================
// REMINDER HANDLERS
// ============================================================================

/**
 * Handler: Create a reminder
 * Capability: reminders
 */
const createReminderHandler: TeamHandlerDefinition = {
  id: 'createReminder',
  name: 'Create Reminder',
  description: 'Create a one-time reminder',
  capability: 'reminders',
  tags: ['reminder', 'notification'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const {
      message,
      dateTime,
      deliveryMethod = 'voice',
    } = request.params as {
      message: string;
      dateTime: string;
      deliveryMethod?: 'voice' | 'sms' | 'email';
    };
    const userId = request.userId || 'default';

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Reminder message is required', executedBy: 'alex' };
    }

    if (!dateTime) {
      return { success: false, error: 'Reminder date/time is required', executedBy: 'alex' };
    }

    const reminderDate = new Date(dateTime);
    if (isNaN(reminderDate.getTime())) {
      return { success: false, error: 'Invalid date/time format', executedBy: 'alex' };
    }

    if (reminderDate <= new Date()) {
      return { success: false, error: 'Reminder must be in the future', executedBy: 'alex' };
    }

    const id = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      // In a real implementation, this would store to a database and schedule the reminder
      getLogger().info(
        { userId, reminderId: id, dateTime: reminderDate, deliveryMethod },
        'Reminder created'
      );

      const formattedDate = reminderDate.toLocaleString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      return {
        success: true,
        result: `⏰ Reminder set for ${formattedDate}: "${message}"`,
        executedBy: 'alex',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to create reminder');
      return { success: false, error: 'Failed to create reminder', executedBy: 'alex' };
    }
  },
};

// ============================================================================
// RECURRING CHECK-IN HANDLERS
// ============================================================================

/**
 * Handler: Create recurring check-in
 * Capability: scheduling
 */
const createRecurringCheckInHandler: TeamHandlerDefinition = {
  id: 'createRecurringCheckIn',
  name: 'Create Recurring Check-In',
  description: 'Schedule recurring check-ins for a milestone or goal',
  capability: 'scheduling',
  additionalCapabilities: ['reminders'],
  tags: ['recurring', 'check-in', 'schedule'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { name, frequency, milestoneId, startDate, endDate, message } = request.params as {
      name: string;
      frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
      milestoneId?: string;
      startDate?: string;
      endDate?: string;
      message?: string;
    };
    const userId = request.userId || 'default';

    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Check-in name is required', executedBy: 'alex' };
    }

    if (!frequency) {
      return { success: false, error: 'Frequency is required', executedBy: 'alex' };
    }

    const validFrequencies = ['daily', 'weekly', 'biweekly', 'monthly'];
    if (!validFrequencies.includes(frequency)) {
      return {
        success: false,
        error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`,
        executedBy: 'alex',
      };
    }

    const id = `checkin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const checkIn: RecurringCheckIn = {
      id,
      userId,
      title: name.trim(),
      frequency,
      linkedMilestoneId: milestoneId,
      deliveryMethod: 'voice',
      nextCheckIn: startDate ? new Date(startDate) : new Date(),
      isActive: true,
      createdAt: new Date(),
    };

    try {
      const store = getLifeDataStore();
      await store.saveRecurringCheckIn(userId, checkIn);

      getLogger().info({ userId, checkInId: id, frequency }, 'Recurring check-in created');

      let result = `📆 Created ${frequency} check-in "${name}"`;
      if (endDate) {
        result += ` until ${new Date(endDate).toLocaleDateString()}`;
      }

      return { success: true, result, executedBy: 'alex' };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to create check-in');
      return { success: false, error: 'Failed to create check-in', executedBy: 'alex' };
    }
  },
};

// ============================================================================
// NOTIFICATION HANDLER
// ============================================================================

/**
 * Handler: Send notification
 * Capability: notifications
 */
const sendNotificationHandler: TeamHandlerDefinition = {
  id: 'sendNotification',
  name: 'Send Notification',
  description: 'Send a notification to the user',
  capability: 'notifications',
  tags: ['notification', 'alert', 'message'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const {
      message,
      priority = 'normal',
      channel = 'voice',
    } = request.params as {
      message: string;
      priority?: 'low' | 'normal' | 'high';
      channel?: 'voice' | 'sms' | 'email' | 'push';
    };
    const userId = request.userId || 'default';

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Notification message is required', executedBy: 'alex' };
    }

    try {
      // In a real implementation, this would send via the appropriate channel
      getLogger().info(
        { userId, priority, channel, messageLength: message.length },
        'Notification sent'
      );

      return {
        success: true,
        result: `📬 Notification sent via ${channel}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
        executedBy: 'alex',
      };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to send notification');
      return { success: false, error: 'Failed to send notification', executedBy: 'alex' };
    }
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * All scheduling handlers
 */
export const schedulingHandlers: TeamHandlerDefinition[] = [
  scheduleEventHandler,
  getUpcomingEventsHandler,
  createReminderHandler,
  createRecurringCheckInHandler,
  sendNotificationHandler,
];

/**
 * Register all scheduling handlers for an agent
 */
export function registerSchedulingHandlers(agentId: AgentId = 'alex'): void {
  for (const handler of schedulingHandlers) {
    registerTeamHandler(handler, agentId);
  }

  getLogger().info(
    { agentId, handlerCount: schedulingHandlers.length },
    'Scheduling handlers registered'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  scheduleEventHandler,
  getUpcomingEventsHandler,
  createReminderHandler,
  createRecurringCheckInHandler,
  sendNotificationHandler,
};

export default registerSchedulingHandlers;
