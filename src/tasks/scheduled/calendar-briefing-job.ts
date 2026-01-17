/**
 * Calendar Briefing Scheduled Job
 *
 * Sends morning briefings to users with calendar events.
 * Runs at 7 AM user's local time (approximated via timezone).
 *
 * Features:
 * - Morning digest via push notification
 * - Personalized by Alex (Chief of Staff)
 * - Links to app calendar view
 * - Respects user quiet hours
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isConnected, getDayOverview } from '../../services/calendar/calendar-service.js';
import {
  generateDailyBriefing,
  type DailyBriefing,
} from '../../services/calendar/calendar-intelligence.js';
import { canSendOutreach } from '../../services/outreach-intelligence.js';
import {
  getPushNotificationsService,
  type PushNotificationPayload,
  type NotificationType,
} from '../../services/push-notifications.js';
import { getUserContactInfo } from '../../services/outreach/user-contact.js';

const log = createLogger({ module: 'CalendarBriefingJob' });

// ============================================================================
// PUSH NOTIFICATION INTEGRATION
// ============================================================================

/**
 * Send push notification using the push notification service
 */
async function sendCalendarBriefingNotification(
  userId: string,
  payload: {
    title: string;
    body: string;
    type: string;
    personaId?: string;
    data?: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const pushService = getPushNotificationsService();
    const notificationPayload: PushNotificationPayload = {
      title: payload.title,
      body: payload.body,
      type: (payload.type as NotificationType) || 'general',
      personaId: payload.personaId,
      data: payload.data,
    };

    const sent = await pushService.sendNotification(userId, notificationPayload);
    if (sent) {
      log.info({ userId, title: payload.title }, 'Calendar briefing notification sent');
    } else {
      log.debug({ userId }, 'No push subscription for user');
    }
    return sent;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to send calendar briefing notification');
    return false;
  }
}

// ============================================================================
// USER CALENDAR LOOKUP (Firestore)
// ============================================================================

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;
const OAUTH_TOKENS_COLLECTION = 'google_calendar_tokens';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.debug('Calendar briefing job Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for calendar briefing job');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

/**
 * Get all user IDs that have connected their Google Calendar
 * by querying the google_calendar_tokens Firestore collection
 */
async function getAllUserIdsWithCalendar(): Promise<string[]> {
  try {
    const firestore = await getFirestore();
    if (!firestore) {
      log.debug('Firestore not available, returning empty user list');
      return [];
    }

    const snapshot = await firestore.collection(OAUTH_TOKENS_COLLECTION).get();
    const userIds: string[] = [];

    snapshot.forEach((doc) => {
      // Document ID is the userId
      userIds.push(doc.id);
    });

    log.debug({ userCount: userIds.length }, 'Found users with calendar');
    return userIds;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to query users with calendar');
    return [];
  }
}

// Get user timezone from preferences or default
// FIX: Use UTC as fallback instead of hardcoded US timezone (international support)
async function getUserTimezone(userId: string): Promise<string> {
  try {
    const contactInfo = await getUserContactInfo(userId);
    // Return user's configured timezone, or UTC as neutral fallback
    // Note: UTC means briefings may arrive at unexpected times for users without timezone set
    // This is better than assuming everyone is in New York
    return contactInfo?.timezone ?? 'Etc/UTC';
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get user timezone, using UTC fallback');
    return 'Etc/UTC';
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const MORNING_BRIEFING_HOUR = 7; // 7 AM local time
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

// ============================================================================
// JOB STATE
// ============================================================================

let jobInterval: ReturnType<typeof setInterval> | null = null;
const sentBriefings = new Map<string, Date>(); // userId -> last briefing date

// ============================================================================
// MAIN JOB
// ============================================================================

/**
 * Check and send morning briefings
 */
export async function checkAndSendMorningBriefings(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
}> {
  let checked = 0;
  let sent = 0;
  let skipped = 0;

  try {
    // Get all users with calendar connected
    const userIds = await getAllUserIdsWithCalendar();

    for (const userId of userIds) {
      checked++;

      try {
        // Check if we already sent today
        const today = new Date().toDateString();
        const lastSent = sentBriefings.get(userId);
        if (lastSent && lastSent.toDateString() === today) {
          skipped++;
          continue;
        }

        // Check if it's the right time in user's timezone
        const userTz = await getUserTimezone(userId);
        const userHour = getCurrentHourInTimezone(userTz);

        if (userHour !== MORNING_BRIEFING_HOUR) {
          skipped++;
          continue;
        }

        // Check if user allows outreach now
        const canSend = canSendOutreach(userId);
        if (!canSend) {
          log.debug({ userId }, 'Skipping briefing - user in quiet hours');
          skipped++;
          continue;
        }

        // Check if calendar is connected and has events
        const connected = await isConnected(userId);
        if (!connected) {
          skipped++;
          continue;
        }

        const overview = await getDayOverview(userId, new Date());
        if (overview.totalMeetings === 0) {
          // No meetings today - maybe send a "clear day" message?
          log.debug({ userId }, 'Skipping briefing - no meetings today');
          skipped++;
          continue;
        }

        // Generate and send briefing
        const briefing = await generateDailyBriefing(userId, new Date());
        if (!briefing) {
          skipped++;
          continue;
        }

        // Format briefing message
        const title = formatBriefingTitle(overview.totalMeetings);
        const body = formatBriefingBody(briefing);

        const notificationSent = await sendCalendarBriefingNotification(userId, {
          title,
          body,
          type: 'general',
          personaId: 'alex-chen', // Alex delivers the briefing
          data: {
            action: 'open_calendar',
            meetingCount: overview.totalMeetings,
          },
        });

        if (!notificationSent) {
          // User doesn't have push notifications enabled
          skipped++;
          continue;
        }

        sentBriefings.set(userId, new Date());
        sent++;

        log.info({ userId, meetings: overview.totalMeetings }, 'Sent morning calendar briefing');
      } catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to send briefing');
      }
    }

    log.info({ checked, sent, skipped }, 'Morning briefing check complete');
    return { checked, sent, skipped };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to run briefing job');
    return { checked, sent, skipped };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get current hour in a timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    // Default to UTC
    return new Date().getUTCHours();
  }
}

/**
 * Format briefing title
 *
 * Brand voice: Warm, supportive, human - not anxiety-inducing
 */
function formatBriefingTitle(meetingCount: number): string {
  if (meetingCount === 1) {
    return 'Good morning - 1 meeting today';
  }
  if (meetingCount <= 3) {
    return `Good morning - ${meetingCount} meetings today`;
  }
  // Supportive framing for heavy days, not anxiety-inducing
  return `Full day ahead - ${meetingCount} meetings`;
}

/**
 * Format briefing body from intelligence output
 */
function formatBriefingBody(briefing: DailyBriefing): string {
  // Keep it short for push notification
  if (briefing.alerts.length > 0) {
    return briefing.alerts[0].message; // Most important alert
  }

  if (briefing.suggestions.length > 0) {
    return briefing.suggestions[0]; // First suggestion
  }

  return briefing.summary;
}

// ============================================================================
// JOB MANAGEMENT
// ============================================================================

/**
 * Start the briefing job
 */
export function startCalendarBriefingJob(): void {
  if (jobInterval) {
    log.warn('Calendar briefing job already running');
    return;
  }

  // Run immediately on start
  checkAndSendMorningBriefings().catch((err) =>
    log.error({ error: String(err) }, 'Initial briefing check failed')
  );

  // Then run at interval
  jobInterval = setInterval(() => {
    checkAndSendMorningBriefings().catch((err) =>
      log.error({ error: String(err) }, 'Briefing check failed')
    );
  }, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'Calendar briefing job started');
}

/**
 * Stop the briefing job
 */
export function stopCalendarBriefingJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    log.info('Calendar briefing job stopped');
  }
}

/**
 * Get job status
 */
export function getBriefingJobStatus(): {
  running: boolean;
  briefingsSentToday: number;
} {
  const today = new Date().toDateString();
  let briefingsSentToday = 0;

  for (const [, sentDate] of sentBriefings) {
    if (sentDate.toDateString() === today) {
      briefingsSentToday++;
    }
  }

  return {
    running: jobInterval !== null,
    briefingsSentToday,
  };
}
