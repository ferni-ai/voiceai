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
import {
  isConnected,
  getDayOverview,
} from '../../services/calendar/calendar-service.js';
import { generateDailyBriefing, type DailyBriefing } from '../../services/calendar/calendar-intelligence.js';
import { canSendOutreach } from '../../services/outreach-intelligence.js';

const log = createLogger({ module: 'CalendarBriefingJob' });

// Placeholder for push notification - to be wired up
async function sendPushNotification(
  userId: string,
  payload: {
    title: string;
    body: string;
    type: string;
    personaId?: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  log.info({ userId, title: payload.title }, 'Would send push notification');
  // TODO: Wire up to actual push notification service
}

// Placeholder for getting users with calendar - to be wired up
async function getAllUserIdsWithCalendar(): Promise<string[]> {
  // TODO: Query Firestore for users with calendar tokens
  log.debug('Getting users with calendar');
  return [];
}

// Get user timezone from preferences or default
async function getUserTimezone(userId: string): Promise<string> {
  // TODO: Get from user preferences
  return 'America/New_York';
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
        const canSend = await canSendOutreach(userId, 'push');
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

        await sendPushNotification(userId, {
          title,
          body,
          type: 'general',
          personaId: 'alex-chen', // Alex delivers the briefing
          data: {
            action: 'open_calendar',
            meetingCount: overview.totalMeetings,
          },
        });

        sentBriefings.set(userId, new Date());
        sent++;

        log.info(
          { userId, meetings: overview.totalMeetings },
          'Sent morning calendar briefing'
        );
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
 */
function formatBriefingTitle(meetingCount: number): string {
  if (meetingCount === 1) {
    return 'Good morning - 1 meeting today';
  }
  if (meetingCount <= 3) {
    return `Good morning - ${meetingCount} meetings today`;
  }
  return `Busy day ahead - ${meetingCount} meetings`;
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

