/**
 * Calendar morning briefing job.
 *
 * Cloud Scheduler hits POST /api/jobs/calendar-briefing. "Already sent today"
 * lives in Firestore (create-if-absent) so multiple UI-server instances send
 * one briefing per user per local day.
 *
 * Users come from the per-user token store (listTokenUsers). This job used to
 * scan the root google_calendar_tokens collection, which nothing writes any
 * more, and logged `checked: 0` 333 times in 30 days (2026-10-18). People who
 * get Alex's text brief (outreach/morning-brief) are passed in as skipUsers so
 * they get one brief a morning, not two.
 *
 * @module tasks/scheduled/calendar-briefing-job
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isConnected, getDayOverview } from '../../services/calendar/calendar-service.js';
import { describeFerniList } from '../../services/calendar/ferni-list.js';
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
import { listTokenUsers } from '../../services/identity/google-calendar-token-store.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getFirestoreDatabase } from '../../config/environment.js';

const log = createLogger({ module: 'CalendarBriefingJob' });

const MORNING_BRIEFING_HOUR = 7;

/** One claim per user, local day and kind; the push brief keeps its old doc id. */
export type BriefingKind = 'calendar-morning' | 'morning-brief';

export interface BriefingClaimStore {
  claim(userId: string, dateKey: string, kind?: BriefingKind): Promise<boolean>;
  release(userId: string, dateKey: string, kind?: BriefingKind): Promise<void>;
}

const claimDocId = (dateKey: string, kind: BriefingKind = 'calendar-morning'): string =>
  kind === 'calendar-morning' ? dateKey : `${dateKey}-${kind}`;

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

/** Test-only: skip the calendar-token store read. */
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
      databaseId: getFirestoreDatabase(),
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
    const userIds = await listTokenUsers();
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
    async claim(userId, dateKey, kind = 'calendar-morning') {
      const ref = firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('briefings')
        .doc(claimDocId(dateKey, kind));
      try {
        await firestore.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) {
            throw new Error('already-claimed');
          }
          tx.create(ref, { sentAt: nowProvider(), kind });
        });
        return true;
      } catch (error) {
        if (String(error).includes('already-claimed')) return false;
        log.error({ userId, dateKey, error: String(error) }, 'Briefing claim failed');
        return false;
      }
    },
    async release(userId, dateKey, kind) {
      const ref = firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('briefings')
        .doc(claimDocId(dateKey, kind));
      await ref.delete().catch((error: unknown) => {
        log.warn({ userId, dateKey, error: String(error) }, 'Failed to release briefing claim');
      });
    },
  };
}

/** The once-per-local-day claims (Firestore, or the test store). Null without Firestore. */
export async function resolveClaimStore(): Promise<BriefingClaimStore | null> {
  if (claimStore) return claimStore;
  return firestoreClaimStore();
}

/** skipUsers: people Alex texts the brief to, so they don't get this one too. */
export async function checkAndSendMorningBriefings(
  opts: {
    skipUsers?: readonly string[];
    /** Inside the quiet hours they saved in the menu (the caller passes quiet-hours.ts's reader). */
    quietNow?: (userId: string, at: Date) => Promise<boolean>;
  } = {}
): Promise<{ checked: number; sent: number; skipped: number; reasons: Record<string, number> }> {
  let checked = 0;
  let sent = 0;
  let skipped = 0;
  // Why each user was skipped, so a run that sends nothing says why.
  const reasons: Record<string, number> = {};
  const skip = (reason: string): void => {
    skipped++;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  try {
    const userIds = await getAllUserIdsWithCalendar();
    const store = await resolveClaimStore();

    for (const userId of userIds) {
      checked++;
      try {
        if (opts.skipUsers?.includes(userId)) {
          skip('morning-brief-user');
          continue;
        }
        const userTz = await getUserTimezone(userId);
        const userHour = getCurrentHourInTimezone(userTz);
        if (userHour !== MORNING_BRIEFING_HOUR) {
          skip('not-7am');
          continue;
        }
        // 7:00 inside the quiet hours they saved in the menu: no push today.
        if (await opts.quietNow?.(userId, nowProvider())) {
          skip('quiet-hours');
          continue;
        }

        const dateKey = formatDateInTimezone(userTz);
        if (!store) {
          skip('no-claim-store');
          continue;
        }
        const claimed = await store.claim(userId, dateKey);
        if (!claimed) {
          skip('already-sent');
          continue;
        }

        const canSend = canSendOutreach(userId);
        if (!canSend) {
          await store.release(userId, dateKey);
          skip('outreach-limit');
          continue;
        }

        const connected = await isConnected(userId);
        const overview = await getDayOverview(userId, nowProvider());
        if (overview.totalMeetings === 0) {
          await store.release(userId, dateKey);
          skip('no-meetings');
          continue;
        }

        // With no calendar connected the meetings are Ferni's own list: name them, labelled (#1547).
        const briefing = connected ? await generateDailyBriefing(userId, nowProvider()) : null;
        if (connected && !briefing) {
          await store.release(userId, dateKey);
          skip('no-briefing');
          continue;
        }

        const notificationSent = await sendCalendarBriefingNotification(userId, {
          title: briefing
            ? formatBriefingTitle(overview.totalMeetings)
            : `${formatBriefingTitle(overview.totalMeetings)}, from Ferni's list`,
          body: briefing
            ? formatBriefingBody(briefing)
            : `No calendar is connected. On Ferni's own list today: ${describeFerniList(overview.events ?? [])}.`,
          type: 'general',
          personaId: 'alex-chen',
          data: { action: 'open_calendar', meetingCount: overview.totalMeetings },
        });

        if (!notificationSent) {
          await store.release(userId, dateKey);
          skip('no-push');
          continue;
        }

        sent++;
        log.info({ userId, meetings: overview.totalMeetings }, 'Sent morning calendar briefing');
      } catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to send briefing');
      }
    }

    log.info({ checked, sent, skipped, reasons }, 'Morning briefing check complete');
    return { checked, sent, skipped, reasons };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to run briefing job');
    return { checked, sent, skipped, reasons };
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
