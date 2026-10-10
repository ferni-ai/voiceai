/**
 * Call Hours Guard
 *
 * A thoughtful friend doesn't ring at 11pm. Phone calls Ferni places
 * (on-behalf, family check-in, proactive) only go out between 9:00 and 20:30
 * in the RECIPIENT's local time. Outside that window the call is deferred to
 * the next opening, never dropped. A recipient's own quiet hours, when set,
 * narrow the window further.
 *
 * Recipient time zone, in order: the stored one, the phone's area code, the
 * sponsor's. With none of those, the call must fit the window on both US
 * coasts.
 *
 * Off unless CALL_HOURS_GUARD=on.
 *
 * @module services/outreach/call-hours-guard
 */

import { createLogger } from '../../utils/safe-logger.js';
import { timezoneFromPhone } from './area-code-timezones.js';

const log = createLogger({ module: 'CallHoursGuard' });

export const CALL_WINDOW_START_MIN = 9 * 60;
export const CALL_WINDOW_END_MIN = 20 * 60 + 30;
const DAY_MIN = 24 * 60;
const FALLBACK_ZONES = ['America/New_York', 'America/Los_Angeles'];

/** Local minutes of the day, [startMin, endMin); wraps past midnight when start > end. */
export interface QuietWindow {
  startMin: number;
  endMin: number;
}

export type TimezoneSource = 'stored' | 'area_code' | 'sponsor' | 'fallback';

export interface CallHoursInput {
  now?: Date;
  /** The recipient's stored time zone, if any. */
  recipientTimezone?: string;
  recipientPhone?: string;
  /** Whose time zone to assume when the recipient's is unknown. */
  sponsorUserId?: string;
  /** The recipient when they are a Ferni user: their time zone and quiet hours apply. */
  recipientUserId?: string;
}

export interface CallHoursDecision {
  allowed: boolean;
  /** `now` when allowed, otherwise the next moment the call may be placed. */
  at: Date;
  timezone: string;
  source: TimezoneSource;
}

export function isCallHoursGuardOn(): boolean {
  return process.env.CALL_HOURS_GUARD === 'on';
}

export function isValidTimezone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function inWindow(min: number, w: QuietWindow): boolean {
  return w.startMin <= w.endMin
    ? min >= w.startMin && min < w.endMin
    : min >= w.startMin || min < w.endMin;
}

function callableIn(at: Date, zone: string, quiet: QuietWindow[]): boolean {
  const min = localMinutes(at, zone);
  const window = { startMin: CALL_WINDOW_START_MIN, endMin: CALL_WINDOW_END_MIN };
  return inWindow(min, window) && !quiet.some((q) => inWindow(min, q));
}

/** The next local opening after `at` in `zone`: window start, or the end of the quiet window. */
function nextOpening(at: Date, zone: string, quiet: QuietWindow[]): Date {
  const from = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  const min = localMinutes(from, zone);
  const outside = min < CALL_WINDOW_START_MIN || min >= CALL_WINDOW_END_MIN;
  const target = outside
    ? CALL_WINDOW_START_MIN
    : (quiet.find((q) => inWindow(min, q))?.endMin ?? min + 1);
  const delta = (target - min + DAY_MIN) % DAY_MIN || DAY_MIN;
  const next = new Date(from.getTime() + delta * 60_000);
  // A daylight-saving change in between moves the wall clock by an hour.
  const drift = target - localMinutes(next, zone);
  const correction = ((drift + DAY_MIN / 2 + DAY_MIN) % DAY_MIN) - DAY_MIN / 2;
  return new Date(next.getTime() + correction * 60_000);
}

/** `now` if a call is acceptable in every zone, else the earliest moment it is. */
export function nextCallableTime(now: Date, zones: string[], quiet: QuietWindow[] = []): Date {
  let at = now;
  for (let i = 0; i < 16; i++) {
    const blocked = zones.find((zone) => !callableIn(at, zone, quiet));
    if (!blocked) return at;
    at = nextOpening(at, blocked, quiet);
  }
  return at;
}

export function parseQuietWindow(start?: string, end?: string): QuietWindow | undefined {
  const toMin = (s?: string): number | undefined => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
  };
  const startMin = toMin(start);
  const endMin = toMin(end);
  if (startMin === undefined || endMin === undefined || startMin === endMin) return undefined;
  return { startMin, endMin };
}

async function userTimezone(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const { getUserContactInfo } = await import('./user-contact.js');
  const tz = (await getUserContactInfo(userId))?.timezone;
  return isValidTimezone(tz) ? tz : undefined;
}

/** A Ferni user's own quiet hours: the outreach preference and the timing profile. */
async function userQuietHours(userId: string | undefined): Promise<QuietWindow[]> {
  if (!userId) return [];
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return [];
  const [user, outreach] = await Promise.all([
    db.collection('bogle_users').doc(userId).get(),
    db.collection('outreach_profiles').doc(userId).get(),
  ]);
  const pref = user.data()?.outreachPreferences?.quietHours;
  const timing = outreach.data()?.timing?.preferences;
  return [
    pref?.enabled ? parseQuietWindow(pref.start, pref.end) : undefined,
    parseQuietWindow(timing?.quietHoursStart, timing?.quietHoursEnd),
  ].filter((w): w is QuietWindow => !!w);
}

async function recipientZones(input: CallHoursInput): Promise<[string[], TimezoneSource]> {
  if (isValidTimezone(input.recipientTimezone)) return [[input.recipientTimezone], 'stored'];
  const own = await userTimezone(input.recipientUserId);
  if (own) return [[own], 'stored'];
  const byPhone = timezoneFromPhone(input.recipientPhone);
  if (byPhone) return [[byPhone], 'area_code'];
  const sponsor = await userTimezone(input.sponsorUserId);
  if (sponsor) return [[sponsor], 'sponsor'];
  return [FALLBACK_ZONES, 'fallback'];
}

/** Decide whether a call to this recipient may be placed now. Lookup failures don't block a call. */
export async function checkCallHours(input: CallHoursInput): Promise<CallHoursDecision> {
  const now = input.now ?? new Date();
  const [zones, source] = await recipientZones(input).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Recipient time zone lookup failed');
    return [FALLBACK_ZONES, 'fallback'] as [string[], TimezoneSource];
  });
  const quiet = await userQuietHours(input.recipientUserId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Quiet hours lookup failed');
    return [] as QuietWindow[];
  });
  const at = nextCallableTime(now, zones, quiet);
  return { allowed: at.getTime() === now.getTime(), at, timezone: zones[0], source };
}
