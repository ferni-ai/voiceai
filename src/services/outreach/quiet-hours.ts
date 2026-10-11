/**
 * Quiet Hours
 *
 * One quiet-hours predicate for every outreach sender. The window is read in
 * the user's local time: Cloud Run's clock is UTC, so a 22:00-08:00 check on
 * `now.getHours()` lets messages out to an ET user from 04:00.
 *
 * Window: bogle_users/{uid}.outreachPreferences holds it in one of two shapes,
 * `quietHours: { enabled, start: 'HH:MM', end }` or `quietHoursStart/End`
 * (hours). Either is honoured; with neither, 22:00-08:00. A user who turned
 * quietHours off has none.
 *
 * Time zone: outreachPreferences.timezone, then contactInfo.timezone. With
 * neither, it is quiet when it is quiet on either US coast.
 *
 * Senders use this when QUIET_HOURS_UNIFIED=on; off keeps each one's own check.
 *
 * @module services/outreach/quiet-hours
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  isValidTimezone,
  localMinutes,
  parseQuietWindow,
  type QuietWindow,
} from './call-hours-guard.js';

const log = createLogger({ module: 'QuietHours' });

export const DEFAULT_QUIET_WINDOW: QuietWindow = { startMin: 22 * 60, endMin: 8 * 60 };
const FALLBACK_ZONES = ['America/New_York', 'America/Los_Angeles'];
const DAY_MIN = 24 * 60;

/** The parts of a bogle_users doc quiet hours read. */
export interface QuietHoursUser {
  outreachPreferences?: {
    quietHours?: { enabled?: boolean; start?: string; end?: string };
    quietHoursStart?: number | string;
    quietHoursEnd?: number | string;
    timezone?: string;
  };
  contactInfo?: { timezone?: string };
}

export interface QuietHoursResult {
  quiet: boolean;
  /** `now` when not quiet, otherwise when the quiet window ends. */
  until: Date;
}

export function isQuietHoursUnified(): boolean {
  return process.env.QUIET_HOURS_UNIFIED === 'on';
}

/** The process's own time zone: what `Date#getHours()` reads. */
export function serverTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Whole-hour window, e.g. 22 and 8 for 22:00-08:00. */
export function hoursWindow(start: number, end: number): QuietWindow {
  return { startMin: start * 60, endMin: end * 60 };
}

const asHHMM = (v: number | string | undefined): string | undefined =>
  typeof v === 'number' || /^\d{1,2}$/.test(v ?? '') ? `${v}:00` : (v as string | undefined);

/** The user's quiet window; `null` when they turned quiet hours off. */
export function quietWindowOf(user?: QuietHoursUser): QuietWindow | null {
  const prefs = user?.outreachPreferences;
  const q = prefs?.quietHours;
  if (q?.enabled === false) return null;
  const fromObject = q?.enabled ? parseQuietWindow(q.start, q.end) : undefined;
  const fromHours = parseQuietWindow(asHHMM(prefs?.quietHoursStart), asHHMM(prefs?.quietHoursEnd));
  return fromObject ?? fromHours ?? DEFAULT_QUIET_WINDOW;
}

/** The zone to read the window in, or both US coasts when it is unknown. */
export function quietZones(timezone?: string): string[] {
  return isValidTimezone(timezone) ? [timezone] : FALLBACK_ZONES;
}

export function quietZonesOf(user?: QuietHoursUser): string[] {
  const own = user?.outreachPreferences?.timezone;
  return quietZones(isValidTimezone(own) ? own : user?.contactInfo?.timezone);
}

function inWindow(at: Date, w: QuietWindow, zone: string): boolean {
  const min = localMinutes(at, zone);
  return w.startMin <= w.endMin
    ? min >= w.startMin && min < w.endMin
    : min >= w.startMin || min < w.endMin;
}

/** Is `at` inside the window in any of the zones? */
export function isQuietAt(
  at: Date,
  window: QuietWindow | null | undefined,
  zones: string[]
): boolean {
  return !!window && zones.some((zone) => inWindow(at, window, zone));
}

/** `at` when not quiet, else the first minute it is not quiet in any zone. */
export function quietEndsAt(
  at: Date,
  window: QuietWindow | null | undefined,
  zones: string[]
): Date {
  if (!window || !isQuietAt(at, window, zones)) return at;
  let next = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  for (let i = 0; i < zones.length * 2; i++) {
    const zone = zones.find((z) => inWindow(next, window, z));
    if (!zone) break;
    const wait = (window.endMin - localMinutes(next, zone) + DAY_MIN) % DAY_MIN || DAY_MIN;
    next = new Date(next.getTime() + wait * 60_000);
  }
  return next;
}

/** For callers that keep the window as 'HH:MM' strings next to a time zone. */
export function isQuietBetween(at: Date, start?: string, end?: string, tz?: string): boolean {
  return isQuietAt(at, parseQuietWindow(start, end), quietZones(tz));
}

export function quietBetweenEndsAt(at: Date, start?: string, end?: string, tz?: string): Date {
  return quietEndsAt(at, parseQuietWindow(start, end), quietZones(tz));
}

export function isUserQuiet(user: QuietHoursUser | undefined, now = new Date()): boolean {
  return isQuietAt(now, quietWindowOf(user), quietZonesOf(user));
}

/** The user's doc, or undefined when it can't be read (the defaults then apply). */
export async function loadQuietHoursUser(userId: string): Promise<QuietHoursUser | undefined> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const doc = await getFirestoreDb()?.collection('bogle_users').doc(userId).get();
    return doc?.exists ? (doc.data() as QuietHoursUser) : undefined;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Quiet hours: user lookup failed');
    return undefined;
  }
}

export async function userQuietHours(userId: string, now = new Date()): Promise<QuietHoursResult> {
  const user = await loadQuietHoursUser(userId);
  const window = quietWindowOf(user);
  const zones = quietZonesOf(user);
  const quiet = isQuietAt(now, window, zones);
  return { quiet, until: quiet ? quietEndsAt(now, window, zones) : now };
}

/** A window kept elsewhere as 'HH:MM' strings, read in this user's time zone. */
export async function isUserQuietBetween(
  userId: string,
  start?: string,
  end?: string,
  now = new Date()
): Promise<boolean> {
  const zones = quietZonesOf(await loadQuietHoursUser(userId));
  return isQuietAt(now, parseQuietWindow(start, end), zones);
}

/**
 * Quiet hours for the two call schedulers. Off: their old check, the
 * quietHours object only, on the server clock, waiting until its end hour.
 */
export async function callQuietHours(userId: string, now = new Date()): Promise<QuietHoursResult> {
  if (isQuietHoursUnified()) return userQuietHours(userId, now);
  const q = (await loadQuietHoursUser(userId))?.outreachPreferences?.quietHours;
  const quiet =
    !!q?.enabled && isQuietAt(now, parseQuietWindow(q.start, q.end), [serverTimezone()]);
  if (!quiet) return { quiet, until: now };
  const endHour = q?.end ? parseInt(q.end.split(':')[0], 10) : 8;
  const until = new Date(now);
  if (until.getHours() >= endHour) until.setDate(until.getDate() + 1);
  until.setHours(endHour, 0, 0, 0);
  return { quiet, until };
}
