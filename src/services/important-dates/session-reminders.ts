/**
 * In-conversation reminders: what Ferni should bring up at session start.
 *
 * `getRemindersForSession(userId)` returns dates coming up soon (and any
 * reminder due today) for the session-start context, so the persona can say
 * "Your mom's birthday is Saturday. Want help with a gift?" in their own
 * voice. A reminder due today that is surfaced here is claimed (status
 * 'surfaced', channel 'conversation') so the scheduled job won't also push it.
 *
 * Conversation is the preferred channel; the user can turn it off in
 * reminder settings or per date. Topics the user asked us not to raise
 * proactively are left out.
 *
 * @module services/important-dates/session-reminders
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { localToday, parseStoredDate, compareCivil } from './date-math.js';
import { isReminderTopicAllowed } from './boundaries-adapter.js';
import { reminderMessage, sessionLine } from './copy.js';
import { enabledChannels } from './reminder-delivery.js';
import { claimReminder } from './reminder-job.js';
import { planNextReminder, withHandledKey } from './reminder-schedule.js';
import {
  listImportantDates,
  saveImportantDate,
  scheduleContextFor,
  withSchedule,
} from './store.js';
import { selectUpcoming } from './upcoming.js';
import type { ImportantDateRecord } from './types.js';

const log = createLogger({ module: 'important-dates:session' });

/** How far ahead the session block looks. */
export const SESSION_WINDOW_DAYS = 14;

export interface SessionReminder {
  dateId: string;
  title: string;
  kind: ImportantDateRecord['kind'];
  occursOn: string;
  daysUntil: number;
  /** True when one of the date's reminders is due today. */
  dueToday: boolean;
  /** Suggested opener, e.g. "Sam's birthday is Saturday. Want help with a gift?" */
  suggestion: string;
  /** Compact line for the context block. */
  line: string;
  sensitive: boolean;
}

export interface SessionReminders {
  reminders: SessionReminder[];
  /** Ready-to-inject context text ('' when there's nothing to mention). */
  context: string;
}

const EMPTY: SessionReminders = { reminders: [], context: '' };

export function formatSessionBlock(reminders: readonly SessionReminder[]): string {
  if (reminders.length === 0) return '';
  const lines = ['## Important dates coming up', ''];
  for (const r of reminders) lines.push(`- ${r.line}${r.dueToday ? ' ← remind them today' : ''}`);
  lines.push(
    '',
    'Bring the soonest one up naturally, once, in your own voice. For example: ' +
      `"${reminders[0].suggestion}" Offer help (a gift, a plan, a call) and let them steer.`
  );
  return lines.join('\n');
}

/**
 * Reminders for the session-start context. Never throws; returns an empty
 * result when storage is unavailable.
 */
export async function getRemindersForSession(
  userId: string,
  now: Date = new Date()
): Promise<SessionReminders> {
  const db = getFirestoreDb();
  if (!db || !userId) return EMPTY;
  try {
    const listed = await listImportantDates(userId);
    if (!listed.success || listed.data.length === 0) return EMPTY;
    const ctx = await scheduleContextFor(userId, now);
    const today = localToday(now, ctx.timeZone);
    // Look a full year ahead so long-lead reminders ("a month before") due
    // today are surfaced too; other dates only within the session window.
    const upcoming = selectUpcoming(listed.data, today, 366);

    const reminders: SessionReminder[] = [];
    for (const u of upcoming) {
      const record = u.record;
      if (!record.reminders.enabled) continue;
      if (!enabledChannels(record, ctx.settings).includes('conversation')) continue;
      if (!(await isReminderTopicAllowed(userId, record.title))) continue;

      const plan = planNextReminder(record, ctx);
      const dueToday = !!plan && compareCivil(plan.remindOn, today) === 0;
      if (u.daysUntil > SESSION_WINDOW_DAYS && !dueToday) continue;
      if (plan && dueToday) {
        // Claimed here, or already claimed by the job: either way it's handled.
        await claimReminder(db, userId, record, plan, 'surfaced', now);
        const handled = withSchedule(
          { ...record, sentReminderKeys: withHandledKey(record.sentReminderKeys, plan.key) },
          ctx
        );
        await saveImportantDate(userId, handled);
      }
      const occ = parseStoredDate(u.occursOn);
      if (!occ || occ.year === undefined) continue;
      const occursOn = { year: occ.year, month: occ.month, day: occ.day };
      reminders.push({
        dateId: record.id,
        title: record.title,
        kind: record.kind,
        occursOn: u.occursOn,
        daysUntil: u.daysUntil,
        dueToday,
        suggestion: reminderMessage(record, u.daysUntil, occursOn, u.yearsSince),
        line: sessionLine(record, u.daysUntil, occursOn, u.yearsSince),
        sensitive: record.subtype === 'memorial',
      });
    }
    return { reminders, context: formatSessionBlock(reminders) };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Session reminders unavailable');
    return EMPTY;
  }
}
