/**
 * Alex's morning brief by text, at 08:00 in each person's own zone (texts are
 * held until quiet hours end at 08:00). When quiet hours saved in the menu hold
 * 08:00 (QUIET_HOURS_FROM_PREFS), it moves to the hour they end, if before noon.
 * Off unless MORNING_BRIEF=on, then only for MORNING_BRIEF_USERS (comma
 * separated) and cohort members with the flag (usersWithFlag). Rides the calendar-briefing job, every 15 minutes.
 *
 * No stored time zone means no brief: a UTC guess would text someone at night.
 * One a local day: a Firestore claim (kind morning-brief, apart from the push
 * brief's), freed when nothing went, and sendGuardedText refuses a second
 * within 20 hours. The text goes only to their own verified number, never
 * after STOP or with texts off; when it can't, the same words go as a push
 * from Alex. Each run logs its counts and why each person was skipped.
 *
 * @module services/outreach/morning-brief/brief-job
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { wallTimeIn, zonedWallTimeToUtc, type WallTime } from '../../../utils/time-zone.js';
import type { BriefingClaimStore } from '../../../tasks/scheduled/calendar-briefing-job.js';
import type { GuardedText, TextOutcome } from '../guarded-text.js';
import { firstName } from '../proactive-channels/pondered-triggers.js';
import { timezoneOf } from '../proactive-channels/proactive-tick.js';
import { isUserQuiet, quietEndsAt, savedQuietHours, type QuietHoursUser } from '../quiet-hours.js';
import { composeMorningBrief, type MorningBriefInput } from './compose.js';

const log = createLogger({ module: 'MorningBrief' });

export const MORNING_BRIEF_HOUR = 8;
/** A brief moved past saved quiet hours is sent before this local hour, or not that day. */
export const MORNING_BRIEF_LATEST_HOUR = 12;
/** Longer than a scheduler retry, shorter than a day: one text a morning. */
export const MORNING_BRIEF_GAP_MS = 20 * 60 * 60 * 1000;
const ALEX = 'alex-chen';

export type DayItems = Omit<MorningBriefInput, 'timeZone' | 'name'>;

export interface MorningBriefDeps {
  env: Env;
  /** Uids whose cohort flags turn MORNING_BRIEF on. */
  cohortUsers: () => Promise<string[]>;
  /** bogle_users/{uid}, for their zone, name and quiet hours. */
  userDoc: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** Today in their zone: calendar, reminders, open tasks and commitments. */
  readDay: (
    userId: string,
    user: Record<string, unknown>,
    zone: string,
    now: Date
  ) => Promise<DayItems>;
  claims: BriefingClaimStore | null;
  sendText: (t: GuardedText) => Promise<TextOutcome>;
  sendPush: (
    userId: string,
    push: { title: string; body: string; personaId: string; data: Record<string, unknown> }
  ) => Promise<boolean>;
}

export interface MorningBriefReport {
  checked: number;
  sent: number;
  skipped: number;
  reasons: Record<string, number>;
  /** Sent as a push instead, by why the text didn't go. */
  pushedInstead: Record<string, number>;
}

export function morningBriefUsers(env: Env): string[] {
  return (env.MORNING_BRIEF_USERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Everyone who gets the text brief: the env list, then cohort members. Empty while off. */
export async function morningBriefRecipients(
  deps: Pick<MorningBriefDeps, 'env' | 'cohortUsers'>
): Promise<string[]> {
  if (!flagOn('MORNING_BRIEF', deps.env)) return [];
  return [...new Set([...morningBriefUsers(deps.env), ...(await deps.cohortUsers())])];
}

const pad = (n: number): string => String(n).padStart(2, '0');
const HOUR_MS = 60 * 60 * 1000;

/**
 * The brief's hour: 08:00 local, or, when their saved quiet hours hold 08:00, the hour from
 * when those end that day (before MORNING_BRIEF_LATEST_HOUR). Never earlier than 08:00.
 */
function inBriefHour(user: Record<string, unknown>, zone: string, local: WallTime, now: Date) {
  if (local.hour === MORNING_BRIEF_HOUR) return true;
  const saved = savedQuietHours(user);
  if (!saved) return false;
  const eight = zonedWallTimeToUtc({ ...local, hour: MORNING_BRIEF_HOUR, minute: 0 }, zone);
  // `now` in the hour from `opens` puts `opens` on today's date, at or after 08:00.
  const opens = quietEndsAt(eight, saved.window, saved.zones);
  const inHour = now >= opens && now.getTime() < opens.getTime() + HOUR_MS;
  // Sent before MORNING_BRIEF_LATEST_HOUR, not just opened before it: a window ending at 11:50
  // gives a run at 12:00, and that brief is skipped.
  return inHour && local.hour < MORNING_BRIEF_LATEST_HOUR;
}

/** One pass over the recipients. Returns who they are, so the push brief can skip them. */
export async function runMorningBriefs(
  deps: MorningBriefDeps,
  now: Date
): Promise<{ recipients: string[]; report: MorningBriefReport }> {
  const report: MorningBriefReport = {
    checked: 0,
    sent: 0,
    skipped: 0,
    reasons: {},
    pushedInstead: {},
  };
  const count = (into: Record<string, number>, reason: string): void => {
    into[reason] = (into[reason] ?? 0) + 1;
  };
  const skip = (reason: string): void => {
    report.skipped++;
    count(report.reasons, reason);
  };
  const recipients = await morningBriefRecipients(deps);

  for (const userId of recipients) {
    report.checked++;
    let claimed: string | null = null;
    const release = async (reason: string): Promise<void> => {
      skip(reason);
      if (claimed) await deps.claims?.release(userId, claimed, 'morning-brief');
    };
    try {
      const user = (await deps.userDoc(userId)) ?? {};
      const zone = timezoneOf(user);
      if (!zone) {
        skip('no-timezone');
        continue;
      }
      const local = wallTimeIn(now, zone);
      if (!inBriefHour(user, zone, local, now)) {
        skip('not-8am');
        continue;
      }
      if (isUserQuiet(user as QuietHoursUser, now)) {
        skip('quiet-hours');
        continue;
      }
      if (!deps.claims) {
        skip('no-claim-store');
        continue;
      }
      const dateKey = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
      if (!(await deps.claims.claim(userId, dateKey, 'morning-brief'))) {
        skip('already-sent');
        continue;
      }
      claimed = dateKey;

      const day = await deps.readDay(userId, user, zone, now);
      const body = composeMorningBrief({ ...day, timeZone: zone, name: firstName(user) });
      if (!body) {
        await release('nothing-today');
        continue;
      }
      const text = await deps.sendText({
        userId,
        body,
        kind: 'morning-brief',
        refId: `morning-brief:${dateKey}`,
        minGapMs: MORNING_BRIEF_GAP_MS,
      });
      if (text.sent) {
        report.sent++;
        continue;
      }
      // Already texted this morning (a lost claim): a push now would be a second
      // brief, and the claim stays so later runs today stop here.
      if (text.reason === 'recently-sent') {
        skip('recently-sent');
        continue;
      }
      const pushed = await deps.sendPush(userId, {
        title: 'Morning from Alex',
        body,
        personaId: ALEX,
        data: { action: 'morning_brief' },
      });
      if (!pushed) {
        await release('no-channel');
        continue;
      }
      report.sent++;
      count(report.pushedInstead, text.reason);
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Morning brief failed');
      await release('error').catch((e: unknown) => {
        log.warn({ userId, error: String(e) }, 'Morning brief claim not released');
      });
    }
  }

  log.info(report, 'Morning brief run complete');
  return { recipients, report };
}
