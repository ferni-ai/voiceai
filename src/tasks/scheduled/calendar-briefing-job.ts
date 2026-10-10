/**
 * Calendar morning briefing job.
 *
 * Cloud Scheduler hits POST /api/jobs/calendar-briefing. "Already sent today"
 * lives in Firestore (create-if-absent) so multiple UI-server instances send
 * one briefing per user per local day.
 *
 * @module tasks/scheduled/calendar-briefing-job
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
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

const log = createLogger({ module: 'CalendarBriefingJob' });

const OAUTH_TOKENS_COLLECTION = 'google_calendar_tokens';
const MORNING_BRIEFING_HOUR = 7;

export interface BriefingClaimStore {
  claim(userId: string, dateKey: string): Promise<boolean>;
  release(userId: string, dateKey: string): Promise<void>;
}

let nowProvider: () => Date = () => new Date();
let claimStore: BriefingClaimStore | null = null;
let testUserIds: string[] | null = null;
let db: FirestoreType | null = null;
let dbInitPromise: Promise<FirestoreType | null> | null = null;

/** Test-only: freeze "now" so morning-hour checks are deterministic. */
export function setBriefingNow(fn: () => Date): void {
  nowProvider = fn;
}

export function resetBriefingNow(): void {
  nowProvider = () => new Date();
}

/** Test-only: inject an in-memory claim store instead of Firestore. */
export function setBriefingClaimStore(store: BriefingClaimStore | null): void {
  claimStore = store;
}

/** Test-only: skip the calendar-token collection scan. */
export function setBriefingUserIds(userIds: string[] | null): void {
  testUserIds = userIds;
}

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
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for calendar briefing job');
    dbInitPromise = null;
    return null;
  }
}

async function getAllUserIdsWithCalendar(): Promise<string[]> {
  if (testUserIds) return testUserIds;
  try {
    const firestore = await getFirestore();
    if (!firestore) return [];
    const snapshot = await firestore.collection(OAUTH_TOKENS_COLLECTION).get();
    const userIds: string[] = [];
    snapshot.forEach((doc) => userIds.push(doc.id));
    return userIds.filter((id) => !id.startsWith('cal-test-') && !id.startsWith('test-'));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to query users with calendar');
    return [];
  }
}

export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const contactInfo = await getUserContactInfo(userId);
    return contactInfo?.timezone ?? 'Etc/UTC';
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get user timezone, using UTC fallback');
    return 'Etc/UTC';
  }
}

export function formatDateInTimezone(timezone: string, now: Date = nowProvider()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through
  }
  return now.toISOString().slice(0, 10);
}

function getCurrentHourInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(nowProvider()), 10);
  } catch {
    return nowProvider().getUTCHours();
  }
}

async function firestoreClaimStore(): Promise<BriefingClaimStore | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;
  return {
    async claim(userId, dateKey) {
      const ref = firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('briefings')
        .doc(dateKey);
      try {
        await firestore.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) {
            throw new Error('already-claimed');
          }
          tx.create(ref, { sentAt: nowProvider(), kind: 'calendar-morning' });
        });
        return true;
      } catch (error) {
        if (String(error).includes('already-claimed')) return false;
        log.error({ userId, dateKey, error: String(error) }, 'Briefing claim failed');
        return false;
      }
    },
    async release(userId, dateKey) {
      const ref = firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('briefings')
        .doc(dateKey);
      await ref.delete().catch((error: unknown) => {
        log.warn({ userId, dateKey, error: String(error) }, 'Failed to release briefing claim');
      });
    },
  };
}

async function resolveClaimStore(): Promise<BriefingClaimStore | null> {
  if (claimStore) return claimStore;
  return firestoreClaimStore();
}

export async function checkAndSendMorningBriefings(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
}> {
  let checked = 0;
  let sent = 0;
  let skipped = 0;

  try {
    const userIds = await getAllUserIdsWithCalendar();
    const store = await resolveClaimStore();

    for (const userId of userIds) {
      checked++;
      try {
        const userTz = await getUserTimezone(userId);
        const userHour = getCurrentHourInTimezone(userTz);
        if (userHour !== MORNING_BRIEFING_HOUR) {
          skipped++;
          continue;
        }

        const dateKey = formatDateInTimezone(userTz);
        if (!store) {
          skipped++;
          continue;
        }
        const claimed = await store.claim(userId, dateKey);
        if (!claimed) {
          skipped++;
          continue;
        }

        const canSend = canSendOutreach(userId);
        if (!canSend) {
          await store.release(userId, dateKey);
          skipped++;
          continue;
        }

        const connected = await isConnected(userId);
        if (!connected) {
          await store.release(userId, dateKey);
          skipped++;
          continue;
        }

        const overview = await getDayOverview(userId, nowProvider());
        if (overview.totalMeetings === 0) {
          await store.release(userId, dateKey);
          skipped++;
          continue;
        }

        const briefing = await generateDailyBriefing(userId, nowProvider());
        if (!briefing) {
          await store.release(userId, dateKey);
          skipped++;
          continue;
        }

        const notificationSent = await sendCalendarBriefingNotification(userId, {
          title: formatBriefingTitle(overview.totalMeetings),
          body: formatBriefingBody(briefing),
          type: 'general',
          personaId: 'alex-chen',
          data: { action: 'open_calendar', meetingCount: overview.totalMeetings },
        });

        if (!notificationSent) {
          await store.release(userId, dateKey);
          skipped++;
          continue;
        }

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

function formatBriefingTitle(meetingCount: number): string {
  if (meetingCount === 1) return 'Good morning - 1 meeting today';
  if (meetingCount <= 3) return `Good morning - ${meetingCount} meetings today`;
  return `Full day ahead - ${meetingCount} meetings`;
}

function formatBriefingBody(briefing: DailyBriefing): string {
  if (briefing.alerts.length > 0) return briefing.alerts[0].message;
  if (briefing.suggestions.length > 0) return briefing.suggestions[0];
  return briefing.summary;
}
