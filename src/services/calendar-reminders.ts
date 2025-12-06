/**
 * Calendar Reminders Service
 *
 * Proactively reminds users about upcoming calendar events:
 * - Morning digest of today's schedule
 * - Pre-event reminders (1 hour, 15 minutes)
 * - Smart contextual reminders ("Your interview is tomorrow - get rest!")
 *
 * Integrates with Google Calendar OAuth and proactive outreach.
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  scheduleText,
  scheduleEmail,
  getUserContactInfo,
  canReachUser,
} from '../tools/proactive-outreach.js';
import { getPreferences, canSendOutreach } from './outreach-intelligence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  isAllDay: boolean;
  attendees?: string[];
  reminders: EventReminder[];
  source: 'google' | 'manual' | 'scheduled';
}

export interface EventReminder {
  id: string;
  eventId: string;
  type: 'digest' | 'pre_event' | 'contextual';
  minutesBefore: number;
  sent: boolean;
  sentAt?: Date;
}

export interface CalendarDigest {
  userId: string;
  date: Date;
  events: CalendarEvent[];
  message: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const eventStore = new Map<string, CalendarEvent[]>();
const reminderSentLog = new Map<string, Set<string>>(); // eventId -> Set of reminderIds

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

/**
 * Add or update a calendar event
 */
export function upsertEvent(event: CalendarEvent): CalendarEvent {
  const events = eventStore.get(event.userId) || [];
  const existingIndex = events.findIndex((e) => e.id === event.id);

  // Add default reminders if not specified
  if (event.reminders.length === 0) {
    event.reminders = getDefaultReminders(event);
  }

  if (existingIndex >= 0) {
    events[existingIndex] = event;
  } else {
    events.push(event);
  }

  eventStore.set(event.userId, events);

  getLogger().info(
    { userId: event.userId, eventId: event.id, title: event.title, startTime: event.startTime },
    '📅 Calendar event saved'
  );

  return event;
}

/**
 * Get default reminders based on event type
 */
function getDefaultReminders(event: CalendarEvent): EventReminder[] {
  const reminders: EventReminder[] = [];
  const title = event.title.toLowerCase();

  // Always add 1 hour reminder
  reminders.push({
    id: `reminder_1h_${event.id}`,
    eventId: event.id,
    type: 'pre_event',
    minutesBefore: 60,
    sent: false,
  });

  // Add 15 min reminder for meetings/calls
  if (title.includes('meeting') || title.includes('call') || title.includes('interview')) {
    reminders.push({
      id: `reminder_15m_${event.id}`,
      eventId: event.id,
      type: 'pre_event',
      minutesBefore: 15,
      sent: false,
    });
  }

  // Add day-before contextual reminder for important events
  if (
    title.includes('interview') ||
    title.includes('presentation') ||
    title.includes('doctor') ||
    title.includes('dentist') ||
    title.includes('exam') ||
    title.includes('deadline')
  ) {
    reminders.push({
      id: `reminder_1d_${event.id}`,
      eventId: event.id,
      type: 'contextual',
      minutesBefore: 24 * 60, // 1 day
      sent: false,
    });
  }

  return reminders;
}

/**
 * Get events for a user on a specific date
 */
export function getEventsForDate(userId: string, date: Date): CalendarEvent[] {
  const events = eventStore.get(userId) || [];
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return events.filter((e) => e.startTime >= startOfDay && e.startTime <= endOfDay);
}

/**
 * Get upcoming events within hours
 */
export function getUpcomingEvents(userId: string, withinHours = 24): CalendarEvent[] {
  const events = eventStore.get(userId) || [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

  return events
    .filter((e) => e.startTime >= now && e.startTime <= cutoff)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

// ============================================================================
// REMINDER GENERATION
// ============================================================================

/**
 * Generate morning digest message
 */
export function generateMorningDigest(userId: string): CalendarDigest | null {
  const today = new Date();
  const events = getEventsForDate(userId, today);

  if (events.length === 0) {
    return null;
  }

  let message = `☀️ Good morning! Here's your schedule for today:\n\n`;

  for (const event of events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())) {
    const time = event.isAllDay
      ? 'All day'
      : event.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    message += `• ${time}: ${event.title}`;
    if (event.location) {
      message += ` (${event.location})`;
    }
    message += '\n';
  }

  message += `\nYou've got ${events.length} thing${events.length > 1 ? 's' : ''} today. You've got this! 💪`;

  return {
    userId,
    date: today,
    events,
    message,
  };
}

/**
 * Generate pre-event reminder message
 */
function generatePreEventMessage(event: CalendarEvent, minutesBefore: number): string {
  const { title } = event;
  let timeStr: string;

  if (minutesBefore >= 60) {
    const hours = Math.round(minutesBefore / 60);
    timeStr = hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  } else {
    timeStr = `in ${minutesBefore} minutes`;
  }

  let message = `⏰ Reminder: "${title}" starts ${timeStr}`;

  if (event.location) {
    message += ` at ${event.location}`;
  }

  // Add contextual tips based on event type
  const lower = title.toLowerCase();

  if (lower.includes('interview')) {
    message +=
      '\n\n💡 Quick tips: Take a deep breath, remember your key achievements, and be yourself!';
  } else if (lower.includes('presentation')) {
    message += "\n\n💡 You've prepared for this. Speak slowly, make eye contact, and own the room!";
  } else if (lower.includes('doctor') || lower.includes('dentist')) {
    message += "\n\n💡 Don't forget any questions you wanted to ask!";
  }

  return message;
}

/**
 * Generate day-before contextual reminder
 */
function generateContextualMessage(event: CalendarEvent): string {
  const title = event.title.toLowerCase();
  const eventTime = event.startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (title.includes('interview')) {
    return `🌙 Your interview is tomorrow at ${eventTime}! \n\nGet a good night's sleep, lay out your outfit, and review any notes you have. You're going to do great! 🌟`;
  }

  if (title.includes('presentation')) {
    return `🌙 Big presentation tomorrow at ${eventTime}! \n\nDo one final run-through tonight, then relax. You've got this prepared! 💪`;
  }

  if (title.includes('exam') || title.includes('test')) {
    return `📚 Exam tomorrow at ${eventTime}! \n\nNo more cramming - get good sleep and trust your preparation. Good luck! 🍀`;
  }

  if (title.includes('deadline')) {
    return `⚡ "${event.title}" deadline is tomorrow! \n\nHow's progress looking? Let me know if you need help prioritizing!`;
  }

  if (title.includes('doctor') || title.includes('dentist') || title.includes('appointment')) {
    return `📋 Appointment tomorrow at ${eventTime}: ${event.title}\n\nMake a note of any questions or concerns you want to discuss!`;
  }

  return `📅 Heads up! "${event.title}" is tomorrow at ${eventTime}. Anything you need to prepare?`;
}

// ============================================================================
// REMINDER CHECKING & SENDING
// ============================================================================

/**
 * Check and send due reminders
 */
export async function checkAndSendReminders(): Promise<{
  digestsSent: number;
  remindersSent: number;
}> {
  let digestsSent = 0;
  let remindersSent = 0;
  const now = new Date();

  for (const [userId, events] of eventStore) {
    // Check if we can reach this user
    if (!(await canReachUser(userId)) || !canSendOutreach(userId)) {
      continue;
    }

    const prefs = getPreferences(userId);
    const sentLog = reminderSentLog.get(userId) || new Set();

    // Check morning digest (send at 7am local time)
    const currentHour = now.getHours();
    if (currentHour >= 7 && currentHour < 8) {
      const digestKey = `digest_${now.toDateString()}`;
      if (!sentLog.has(digestKey)) {
        const digest = generateMorningDigest(userId);
        if (digest) {
          const result = await scheduleText(userId, digest.message, now, 'Ferni');
          if (result.success) {
            sentLog.add(digestKey);
            digestsSent++;
            getLogger().info({ userId }, '📅 Morning digest sent');
          }
        }
      }
    }

    // Check event reminders
    for (const event of events) {
      for (const reminder of event.reminders) {
        if (reminder.sent) continue;
        if (sentLog.has(reminder.id)) continue;

        const reminderTime = new Date(
          event.startTime.getTime() - reminder.minutesBefore * 60 * 1000
        );

        // Check if it's time to send this reminder
        if (now >= reminderTime && now < event.startTime) {
          let message: string;

          if (reminder.type === 'contextual') {
            message = generateContextualMessage(event);
          } else {
            message = generatePreEventMessage(event, reminder.minutesBefore);
          }

          const result = await scheduleText(userId, message, now, 'Ferni');

          if (result.success) {
            reminder.sent = true;
            reminder.sentAt = now;
            sentLog.add(reminder.id);
            remindersSent++;

            getLogger().info(
              { userId, eventId: event.id, reminderType: reminder.type },
              '⏰ Event reminder sent'
            );
          }
        }
      }
    }

    reminderSentLog.set(userId, sentLog);
  }

  eventStore.forEach((events, userId) => eventStore.set(userId, events));

  return { digestsSent, remindersSent };
}

// ============================================================================
// SYNC WITH GOOGLE CALENDAR
// ============================================================================

/**
 * Sync events from Google Calendar (placeholder for OAuth integration)
 */
export async function syncFromGoogleCalendar(userId: string, accessToken: string): Promise<number> {
  // This would use the google-calendar-oauth service
  // For now, returns 0 as it needs the OAuth flow to be complete

  getLogger().info({ userId }, '📅 Google Calendar sync requested (needs OAuth)');
  return 0;
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

let reminderCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start the reminder checking background job
 */
export function startCalendarReminders(intervalMs: number = 5 * 60 * 1000): void {
  if (reminderCheckInterval) {
    getLogger().warn('Calendar reminders already running');
    return;
  }

  getLogger().info({ intervalMs }, '📅 Starting calendar reminder service');

  // Run immediately
  checkAndSendReminders().catch((err) =>
    getLogger().error({ error: err }, 'Initial reminder check failed')
  );

  // Then run on interval
  reminderCheckInterval = setInterval(() => {
    void (async () => {
      try {
        const { digestsSent, remindersSent } = await checkAndSendReminders();

        if (digestsSent > 0 || remindersSent > 0) {
          getLogger().info({ digestsSent, remindersSent }, '📅 Calendar reminder cycle complete');
        }
      } catch (error) {
        getLogger().error({ error }, 'Calendar reminder error');
      }
    })();
  }, intervalMs);
}

/**
 * Stop the reminder checking background job
 */
export function stopCalendarReminders(): void {
  if (reminderCheckInterval) {
    clearInterval(reminderCheckInterval);
    reminderCheckInterval = null;
    getLogger().info('Calendar reminders stopped');
  }
}

// ============================================================================
// CLEANUP FUNCTIONS (Memory Leak Prevention)
// ============================================================================

/**
 * Clear all calendar data for a specific user.
 */
export function clearUserCalendarData(userId: string): void {
  eventStore.delete(userId);
  // Clear reminder logs for this user's events
  for (const key of reminderSentLog.keys()) {
    // Keys are eventIds - we'd need to track userId->eventId mapping for perfect cleanup
    // For now, this removes the user's events; reminder logs may have orphans
  }
  getLogger().debug({ userId }, 'Cleared calendar data for user');
}

/**
 * Clear all calendar data.
 */
export function clearAllCalendarData(): void {
  const eventCount = eventStore.size;
  const reminderCount = reminderSentLog.size;
  eventStore.clear();
  reminderSentLog.clear();
  stopCalendarReminders();
  getLogger().info({ eventCount, reminderCount }, 'Cleared all calendar data');
}

/**
 * Get memory usage statistics for monitoring.
 */
export function getCalendarMemoryStats(): {
  usersWithEvents: number;
  totalEvents: number;
  reminderLogsTracked: number;
} {
  let totalEvents = 0;
  for (const events of eventStore.values()) {
    totalEvents += events.length;
  }

  return {
    usersWithEvents: eventStore.size,
    totalEvents,
    reminderLogsTracked: reminderSentLog.size,
  };
}

/**
 * Prune old events and reminder logs.
 * @param olderThanDays - Remove events older than this many days (default: 30)
 */
export function pruneOldCalendarData(olderThanDays = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  let pruned = 0;

  for (const [userId, events] of eventStore.entries()) {
    const fresh = events.filter((e) => e.endTime > cutoff);
    if (fresh.length < events.length) {
      pruned += events.length - fresh.length;
      if (fresh.length === 0) {
        eventStore.delete(userId);
      } else {
        eventStore.set(userId, fresh);
      }
    }
  }

  if (pruned > 0) {
    getLogger().info({ pruned, olderThanDays }, 'Pruned old calendar events');
  }
  return pruned;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Event management
  upsertEvent,
  getEventsForDate,
  getUpcomingEvents,

  // Reminders
  generateMorningDigest,
  checkAndSendReminders,

  // Sync
  syncFromGoogleCalendar,

  // Background jobs
  startCalendarReminders,
  stopCalendarReminders,

  // Cleanup
  clearUserData: clearUserCalendarData,
  clearAll: clearAllCalendarData,
  getMemoryStats: getCalendarMemoryStats,
  pruneOld: pruneOldCalendarData,
};
