/**
 * Pre-Meeting Push Notifications
 *
 * Integrates calendar awareness with push notifications to send
 * helpful pre-meeting reminders at the right time.
 *
 * Features:
 * - High-priority meetings get earlier notifications
 * - Includes prep tips and relationship context
 * - Respects user notification preferences
 * - Intelligent timing based on calendar load
 *
 * @module calendar/pre-meeting-notifications
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getAmbientCalendarContext } from './ambient-calendar-awareness.js';
import { enrichPreMeetingBriefing, type EnrichedBriefing } from './meeting-memory-service.js';
import type { CalendarEvent } from './calendar-service.js';

const log = createLogger({ module: 'pre-meeting-notifications' });

// ============================================================================
// TYPES
// ============================================================================

export interface PreMeetingNotification {
  userId: string;
  eventId: string;
  eventTitle: string;
  minutesUntil: number;
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  data: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export interface NotificationTiming {
  minutesBefore: number;
  priority: 'high' | 'medium' | 'low';
  meetingTypes: string[];
}

// ============================================================================
// NOTIFICATION TIMING CONFIG
// ============================================================================

/**
 * When to send notifications based on meeting type.
 */
const NOTIFICATION_TIMING: NotificationTiming[] = [
  // High priority: Important meetings get 60-min notice
  { minutesBefore: 60, priority: 'high', meetingTypes: ['interview', 'board', 'client', 'presentation', 'review'] },
  // Medium priority: Standard meetings get 15-min notice
  { minutesBefore: 15, priority: 'medium', meetingTypes: ['1:1', 'team', 'standup', 'sync'] },
  // Low priority: Quick check-ins get 5-min notice
  { minutesBefore: 5, priority: 'low', meetingTypes: ['chat', 'quick', 'brief'] },
];

// ============================================================================
// NOTIFICATION GENERATION
// ============================================================================

/**
 * Check if a pre-meeting notification should be sent now.
 */
export async function checkForPreMeetingNotification(
  userId: string
): Promise<PreMeetingNotification | null> {
  try {
    const ambient = await getAmbientCalendarContext(userId);

    // No upcoming meeting
    if (!ambient.nextMeeting.event || !ambient.nextMeeting.minutesUntil) {
      return null;
    }

    const event = ambient.nextMeeting.event;
    const minutesUntil = ambient.nextMeeting.minutesUntil;

    // Determine notification timing based on meeting type
    const timing = getNotificationTiming(event);

    // Check if we should notify now
    if (!shouldNotifyNow(minutesUntil, timing)) {
      return null;
    }

    // Build notification
    const notification = await buildPreMeetingNotification(userId, event, minutesUntil, timing.priority);

    log.info(
      { userId, eventId: event.id, minutesUntil, priority: timing.priority },
      'Pre-meeting notification ready'
    );

    return notification;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check for pre-meeting notification');
    return null;
  }
}

/**
 * Get notification timing for an event based on its type.
 */
function getNotificationTiming(event: CalendarEvent): NotificationTiming {
  const title = event.title.toLowerCase();

  for (const timing of NOTIFICATION_TIMING) {
    if (timing.meetingTypes.some((type) => title.includes(type))) {
      return timing;
    }
  }

  // Check duration for priority
  const duration = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
  if (duration >= 60 || event.attendees.length >= 5) {
    return { minutesBefore: 30, priority: 'high', meetingTypes: [] };
  }

  // Default timing
  return { minutesBefore: 10, priority: 'medium', meetingTypes: [] };
}

/**
 * Check if we should send the notification now based on timing window.
 */
function shouldNotifyNow(minutesUntil: number, timing: NotificationTiming): boolean {
  // Window is [timing.minutesBefore - 2, timing.minutesBefore + 2]
  // This gives a 4-minute window to catch the right moment
  const lowerBound = timing.minutesBefore - 2;
  const upperBound = timing.minutesBefore + 2;

  return minutesUntil >= lowerBound && minutesUntil <= upperBound;
}

/**
 * Build a pre-meeting notification with context.
 */
async function buildPreMeetingNotification(
  userId: string,
  event: CalendarEvent,
  minutesUntil: number,
  priority: 'high' | 'medium' | 'low'
): Promise<PreMeetingNotification> {
  // Try to enrich with meeting memory
  let enriched: EnrichedBriefing | null = null;
  try {
    enriched = await enrichPreMeetingBriefing(userId, event);
  } catch (e) {
    log.debug({ error: String(e) }, 'Could not enrich notification with meeting memory');
  }

  // Build title
  const title = buildNotificationTitle(event, minutesUntil, priority);

  // Build body with context
  const body = buildNotificationBody(event, minutesUntil, enriched);

  // Build actions
  const actions = [
    { action: 'get-briefing', title: 'Get briefing' },
    { action: 'dismiss', title: 'Got it' },
  ];

  return {
    userId,
    eventId: event.id,
    eventTitle: event.title,
    minutesUntil,
    priority,
    title,
    body,
    data: {
      type: 'pre-meeting',
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime.toISOString(),
      attendeeCount: event.attendees.length,
      enriched: !!enriched,
    },
    actions,
  };
}

/**
 * Build notification title based on priority and timing.
 */
function buildNotificationTitle(
  event: CalendarEvent,
  minutesUntil: number,
  priority: 'high' | 'medium' | 'low'
): string {
  const timeStr = minutesUntil === 1 ? '1 minute' : `${minutesUntil} minutes`;

  if (priority === 'high') {
    return `${event.title} in ${timeStr}`;
  }

  return `Meeting in ${timeStr}`;
}

/**
 * Build notification body with context.
 */
function buildNotificationBody(
  event: CalendarEvent,
  minutesUntil: number,
  enriched: EnrichedBriefing | null
): string {
  const parts: string[] = [];

  // Event info
  if (event.location) {
    parts.push(`📍 ${event.location}`);
  }

  // Attendee info
  if (event.attendees.length > 0) {
    if (event.attendees.length === 1) {
      parts.push(`With ${event.attendees[0].split('@')[0]}`);
    } else {
      parts.push(`With ${event.attendees.length} attendees`);
    }
  }

  // Enriched context
  if (enriched) {
    // Past topics
    if (enriched.pastTopics && enriched.pastTopics.length > 0) {
      parts.push(`📝 Last discussed: ${enriched.pastTopics[0]}`);
    }

    // Open commitments
    if (enriched.openCommitments && enriched.openCommitments.length > 0) {
      parts.push(`⚡ Open item: ${enriched.openCommitments[0]}`);
    }

    // Suggested agenda
    if (enriched.suggestedAgendaItems && enriched.suggestedAgendaItems.length > 0) {
      parts.push(`💡 Consider: ${enriched.suggestedAgendaItems[0]}`);
    }
  }

  // Default message if no rich context
  if (parts.length === 0) {
    parts.push('Want a quick prep? Tap "Get briefing"');
  }

  return parts.join('\n');
}

// ============================================================================
// SCHEDULED NOTIFICATION JOB
// ============================================================================

/**
 * Run pre-meeting notification check for all users with upcoming meetings.
 * This would be called by a scheduled job (e.g., every minute).
 */
export async function runPreMeetingNotificationJob(
  userIds: string[],
  sendNotification: (notification: PreMeetingNotification) => Promise<boolean>
): Promise<{ sent: number; skipped: number; errors: number }> {
  const results = { sent: 0, skipped: 0, errors: 0 };

  for (const userId of userIds) {
    try {
      const notification = await checkForPreMeetingNotification(userId);

      if (!notification) {
        results.skipped++;
        continue;
      }

      const success = await sendNotification(notification);
      if (success) {
        results.sent++;
      } else {
        results.errors++;
      }
    } catch (error) {
      log.error({ error: String(error), userId }, 'Pre-meeting notification job failed for user');
      results.errors++;
    }
  }

  log.info(results, 'Pre-meeting notification job completed');
  return results;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

const sentNotifications = new Map<string, number>(); // eventId -> timestamp

/**
 * Check if we've already sent a notification for this event recently.
 */
export function hasRecentlyNotified(eventId: string, windowMs = 30 * 60 * 1000): boolean {
  const lastSent = sentNotifications.get(eventId);
  if (!lastSent) return false;

  return Date.now() - lastSent < windowMs;
}

/**
 * Mark that we sent a notification for this event.
 */
export function markNotificationSent(eventId: string): void {
  sentNotifications.set(eventId, Date.now());

  // Cleanup old entries (older than 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, timestamp] of sentNotifications) {
    if (timestamp < dayAgo) {
      sentNotifications.delete(id);
    }
  }
}

// ============================================================================
// INTEGRATION WITH OUTREACH SYSTEM
// ============================================================================

/**
 * Convert pre-meeting notification to outreach format.
 */
export function toOutreachFormat(notification: PreMeetingNotification): {
  userId: string;
  type: 'pre_meeting_reminder';
  personaId: 'alex';
  channel: 'push';
  title: string;
  message: string;
  data: Record<string, unknown>;
  priority: 'high' | 'normal';
} {
  return {
    userId: notification.userId,
    type: 'pre_meeting_reminder',
    personaId: 'alex', // Alex handles calendar
    channel: 'push',
    title: notification.title,
    message: notification.body,
    data: notification.data,
    priority: notification.priority === 'high' ? 'high' : 'normal',
  };
}

