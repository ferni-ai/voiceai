/**
 * Calendar Trigger Worker
 *
 * Polls user calendars for upcoming events and triggers:
 *   - Calendar-based workflows (event_reminder, event_start, event_end)
 *   - Pre-meeting push notifications with enriched briefings
 *
 * Runs on a schedule (every 5 minutes) to provide proactive calendar awareness.
 *
 * @module services/workflows/calendar-trigger-worker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getWorkflowEngine } from './workflow-engine.js';
import { getActiveWorkflows, type Workflow } from '../stores/workflow-store.js';
import type { CalendarEvent } from '../calendar/types.js';

const log = createLogger({ module: 'calendar-trigger-worker' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const REMINDER_WINDOWS = [15, 10, 5]; // Reminder triggers at 15, 10, 5 minutes before
const PUSH_NOTIFICATION_MINUTES = 15; // Send push notification 15 minutes before

// Track which events we've already triggered (to avoid duplicates)
interface TriggeredEvent {
  userId: string;
  eventId: string;
  eventTitle: string;
  triggerType: 'event_reminder' | 'event_start' | 'event_end' | 'push_notification';
  triggeredAt: Date;
}

const triggeredEvents: Map<string, TriggeredEvent> = new Map();
const sentPushNotifications: Map<string, Date> = new Map();

// Worker state
let workerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// ============================================================================
// PRE-MEETING PUSH NOTIFICATIONS
// ============================================================================

/**
 * Send a pre-meeting push notification with enriched briefing
 */
async function sendPreMeetingPushNotification(
  userId: string,
  event: CalendarEvent,
  minutesBefore: number
): Promise<boolean> {
  const notificationId = `${userId}:${event.id}:push`;

  // Skip if already sent
  if (sentPushNotifications.has(notificationId)) {
    return false;
  }

  try {
    // Get enriched briefing if available
    let briefingBody = `${event.title || 'Meeting'} starts in ${minutesBefore} minutes`;
    let briefingData: Record<string, unknown> = { eventId: event.id };

    try {
      const { enrichPreMeetingBriefing } = await import('../calendar/meeting-memory-service.js');
      const briefing = await enrichPreMeetingBriefing(userId, event);

      if (briefing) {
        // Add relationship context if available
        if (briefing.relationshipContext && briefing.relationshipContext.length > 0) {
          const firstPerson = briefing.relationshipContext[0];
          const name = firstPerson.displayName || firstPerson.attendeeEmail.split('@')[0];
          briefingBody = `Meeting with ${name} in ${minutesBefore} min`;

          // Add past topics as hint
          if (briefing.pastTopics && briefing.pastTopics.length > 0) {
            briefingBody += `. Last time: ${briefing.pastTopics[0]}`;
          }
        }

        // Add open commitments to data
        if (briefing.openCommitments && briefing.openCommitments.length > 0) {
          briefingData.openCommitments = briefing.openCommitments;
        }

        // Add suggested agenda items
        if (briefing.suggestedAgendaItems && briefing.suggestedAgendaItems.length > 0) {
          briefingData.suggestedAgenda = briefing.suggestedAgendaItems;
        }
      }
    } catch (briefingError) {
      log.debug({ error: String(briefingError) }, 'Could not enrich briefing');
    }

    // Send push notification
    const { getPushNotificationsService } = await import('../push-notifications.js');
    const pushService = getPushNotificationsService();

    const sent = await pushService.sendNotification(userId, {
      title: `📅 ${event.title || 'Meeting'} soon`,
      body: briefingBody,
      type: 'calendar_reminder',
      personaId: 'alex-chen', // Alex handles calendar
      data: briefingData,
    });

    if (sent) {
      sentPushNotifications.set(notificationId, new Date());
      log.info(
        { userId, event: event.title, minutesBefore },
        '📅 Pre-meeting push notification sent'
      );
    }

    return sent;
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to send pre-meeting push');
    return false;
  }
}

/**
 * Get all users with calendar connected (for push notifications)
 */
async function getUsersWithCalendarConnected(): Promise<string[]> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    // Get users from Google Calendar tokens
    const googleSnapshot = await db.collection('google_calendar_tokens').get();
    const userIds = new Set<string>(googleSnapshot.docs.map((doc) => doc.id));

    // Also check unified calendar providers
    const providersSnapshot = await db
      .collectionGroup('calendar_providers')
      .where('connected', '==', true)
      .get();

    for (const doc of providersSnapshot.docs) {
      const pathParts = doc.ref.path.split('/');
      if (pathParts.length >= 2 && pathParts[0] === 'users') {
        userIds.add(pathParts[1]);
      }
    }

    return Array.from(userIds);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get calendar users');
    return [];
  }
}

// ============================================================================
// CALENDAR CHECKING
// ============================================================================

/**
 * Get users who have calendar-triggered workflows
 */
async function getUsersWithCalendarWorkflows(): Promise<string[]> {
  // For now, get this from workflow store
  // In production, this should be a separate index/query
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];

    // Query users who have active workflows with calendar triggers
    const snapshot = await db
      .collectionGroup('workflows')
      .where('status', '==', 'active')
      .where('trigger.type', '==', 'calendar')
      .get();

    const userIds = new Set<string>();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.userId) {
        userIds.add(data.userId);
      }
    }

    return Array.from(userIds);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get users with calendar workflows');
    return [];
  }
}

/**
 * Check calendar events for a user and trigger workflows + push notifications
 */
async function checkUserCalendar(userId: string, sendPushNotifications = false): Promise<void> {
  try {
    const { getEvents } = await import('../calendar/unified-calendar-store.js');

    const now = new Date();
    const lookAhead = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes ahead
    const lookBack = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes back (for event_end)

    // Get upcoming events
    const events = await getEvents(userId, lookBack, lookAhead);

    if (events.length === 0) return;

    const engine = getWorkflowEngine(userId);

    for (const event of events) {
      // Skip all-day events for notifications
      if (event.isAllDay) continue;

      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      const minutesUntilStart = (eventStart.getTime() - now.getTime()) / (60 * 1000);
      const minutesSinceEnd = (now.getTime() - eventEnd.getTime()) / (60 * 1000);

      // Check for pre-meeting push notification (15 minutes before)
      if (sendPushNotifications) {
        if (
          minutesUntilStart > PUSH_NOTIFICATION_MINUTES - 2.5 &&
          minutesUntilStart < PUSH_NOTIFICATION_MINUTES + 2.5
        ) {
          await sendPreMeetingPushNotification(userId, event, Math.round(minutesUntilStart));
        }
      }

      // Check for event reminders (15, 10, 5 minutes before) - workflow triggers
      for (const reminderMinutes of REMINDER_WINDOWS) {
        if (
          minutesUntilStart > reminderMinutes - 2.5 &&
          minutesUntilStart < reminderMinutes + 2.5
        ) {
          const triggerId = `${userId}:${event.id}:reminder:${reminderMinutes}`;
          if (!triggeredEvents.has(triggerId)) {
            await engine.handleCalendarTrigger('event_reminder', {
              title: event.title || 'Event',
              calendarId: event.externalCalendarId,
              isAllDay: event.isAllDay,
            });
            triggeredEvents.set(triggerId, {
              userId,
              eventId: event.id || '',
              eventTitle: event.title || 'Event',
              triggerType: 'event_reminder',
              triggeredAt: now,
            });
            log.info(
              { userId, event: event.title, reminderMinutes },
              '📅 Calendar reminder triggered'
            );
          }
        }
      }

      // Check for event start (within 2 minutes of start)
      if (Math.abs(minutesUntilStart) < 2) {
        const triggerId = `${userId}:${event.id}:start`;
        if (!triggeredEvents.has(triggerId)) {
          await engine.handleCalendarTrigger('event_start', {
            title: event.title || 'Event',
            calendarId: event.externalCalendarId,
            isAllDay: event.isAllDay,
          });
          triggeredEvents.set(triggerId, {
            userId,
            eventId: event.id || '',
            eventTitle: event.title || 'Event',
            triggerType: 'event_start',
            triggeredAt: now,
          });
          log.info({ userId, event: event.title }, '📅 Calendar event started trigger');
        }
      }

      // Check for event end (within 2 minutes of end)
      if (minutesSinceEnd > 0 && minutesSinceEnd < 2) {
        const triggerId = `${userId}:${event.id}:end`;
        if (!triggeredEvents.has(triggerId)) {
          await engine.handleCalendarTrigger('event_end', {
            title: event.title || 'Event',
            calendarId: event.externalCalendarId,
            isAllDay: event.isAllDay,
          });
          triggeredEvents.set(triggerId, {
            userId,
            eventId: event.id || '',
            eventTitle: event.title || 'Event',
            triggerType: 'event_end',
            triggeredAt: now,
          });
          log.info({ userId, event: event.title }, '📅 Calendar event ended trigger');
        }
      }
    }
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to check calendar for user');
  }
}

/**
 * Clean up old triggered events and notifications (older than 1 hour)
 */
function cleanupTriggeredEvents(): void {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Clean up workflow triggers
  for (const [id, event] of triggeredEvents.entries()) {
    if (event.triggeredAt < oneHourAgo) {
      triggeredEvents.delete(id);
    }
  }

  // Clean up push notification tracking
  for (const [id, sentAt] of sentPushNotifications.entries()) {
    if (sentAt < oneHourAgo) {
      sentPushNotifications.delete(id);
    }
  }
}

/**
 * Main check loop
 */
async function checkAllCalendars(): Promise<void> {
  if (!isRunning) return;

  try {
    // Get users with calendar workflows (for workflow triggers)
    const workflowUserIds = await getUsersWithCalendarWorkflows();

    // Get all users with calendar connected (for push notifications)
    const calendarUserIds = await getUsersWithCalendarConnected();

    // Combine unique user IDs
    const allUserIds = new Set([...workflowUserIds, ...calendarUserIds]);

    if (allUserIds.size === 0) {
      log.debug('No users with calendars');
      return;
    }

    log.debug(
      { workflowUsers: workflowUserIds.length, calendarUsers: calendarUserIds.length },
      'Checking calendars'
    );

    // Process users in parallel (with limit)
    const BATCH_SIZE = 10;
    const userIdArray = Array.from(allUserIds);

    for (let i = 0; i < userIdArray.length; i += BATCH_SIZE) {
      const batch = userIdArray.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((userId) => {
          // Send push notifications for all calendar users
          // Only trigger workflows for users with workflow configs
          const hasWorkflows = workflowUserIds.includes(userId);
          return checkUserCalendar(userId, true); // Always try push notifications
        })
      );
    }

    // Cleanup old triggers
    cleanupTriggeredEvents();
  } catch (error) {
    log.error({ error: String(error) }, 'Calendar trigger check failed');
  }
}

// ============================================================================
// WORKER LIFECYCLE
// ============================================================================

/**
 * Start the calendar trigger worker
 */
export function startCalendarTriggerWorker(): void {
  if (workerInterval) {
    log.warn('Calendar trigger worker already running');
    return;
  }

  isRunning = true;

  // Run immediately, then on interval
  void checkAllCalendars();

  workerInterval = setInterval(() => {
    void checkAllCalendars();
  }, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, '📅 Calendar trigger worker started');
}

/**
 * Stop the calendar trigger worker
 */
export function stopCalendarTriggerWorker(): void {
  isRunning = false;

  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    log.info('📅 Calendar trigger worker stopped');
  }
}

/**
 * Check if the worker is running
 */
export function isCalendarTriggerWorkerRunning(): boolean {
  return isRunning && workerInterval !== null;
}

export default {
  startCalendarTriggerWorker,
  stopCalendarTriggerWorker,
  isCalendarTriggerWorkerRunning,
};
