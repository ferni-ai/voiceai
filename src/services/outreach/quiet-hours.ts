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
 * The menu's quiet hours ("When I'll Check In", "How I reach you") are saved to
 * messagingPrefs. With QUIET_HOURS_FROM_PREFS=on, savedQuietHours is the one
 * reader every sender asks: a saved window adds quiet time to the sender's own,
 * read in the person's zone. Nothing saved, or the flag off: today's check.
 *
 * @module services/outreach/quiet-hours
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { savedQuietSpan } from '../messaging/prefs.js';
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
  /** The menu's record (messaging/prefs.ts); read by savedQuietHours. */
  messagingPrefs?: unknown;
}

export interface QuietHoursResult {
  quiet: boolean;
  /** `now` when not quiet, otherwise when the quiet window ends. */
  until: Date;
}

export function isQuietHoursUnified(): boolean {
  return process.env.QUIET_HOURS_UNIFIED === 'on';
}

/** A quiet window and the zones it is read in. */
export interface ZonedQuiet {
  readonly window: QuietWindow;
  readonly zones: string[];
  /** Their stored zone, when there is one (zones is then just it). */
  readonly zone?: string;
}

export function isQuietHoursFromPrefs(): boolean {
  return flagOn('QUIET_HOURS_FROM_PREFS');
}

/**
 * The quiet hours the person saved in the menu (bogle_users/{uid}.messagingPrefs),
 * in their zone: the one saved with them, else their profile's; with none, both US
 * coasts. Undefined when QUIET_HOURS_FROM_PREFS is off or nothing is saved.
 */
export function savedQuietHours(user: unknown): ZonedQuiet | undefined {
  if (!isQuietHoursFromPrefs()) return undefined;
  const span = savedQuietSpan(user as Record<string, unknown> | undefined);
  const window = span && parseQuietWindow(span.start, span.end);
  if (!window) return undefined;
  const zone = isValidTimezone(span.zone) ? span.zone : undefined;
  return { window, zones: quietZones(zone), ...(zone && { zone }) };
}

/** A sender with its own check uses the shared one: QUIET_HOURS_UNIFIED, or quiet hours saved. */
export function usesSharedQuiet(user?: unknown): boolean {
  return isQuietHoursUnified() || !!savedQuietHours(user);
}

/** savedQuietHours for a user id; undefined without reading anything when the flag is off. */
export async function loadSavedQuietHours(userId?: string): Promise<ZonedQuiet | undefined> {
  if (!userId || !isQuietHoursFromPrefs()) return undefined;
  return savedQuietHours(await loadQuietHoursUser(userId));
}

/**
 * The first moment from `at` that neither the sender's own check (`own`: `at` when
 * not quiet, else when it ends) nor the saved window holds back.
 */
export function openingWith(at: Date, own: (t: Date) => Date, saved?: ZonedQuiet): Date {
  if (!saved) return own(at);
  let t = at;
  for (let i = 0; i < 8; i++) {
    const next = quietEndsAt(own(t), saved.window, saved.zones);
    if (next.getTime() === t.getTime()) break;
    t = next;
  }
  return t;
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

export function isUserQuiet(user: QuietHoursUser | undefined, now = new Date()): boolean {
  return quietHoursOf(user, now).quiet;
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

/** The shared predicate for this user doc, plus their saved window, both read in their zone. */
export function quietHoursOf(user: QuietHoursUser | undefined, now: Date): QuietHoursResult {
  const saved = savedQuietHours(user);
  const window = quietWindowOf(user);
  const zones = saved?.zones ?? quietZonesOf(user);
  const until = openingWith(now, (t) => quietEndsAt(t, window, zones), saved);
  return { quiet: until.getTime() !== now.getTime(), until };
}

export async function userQuietHours(userId: string, now = new Date()): Promise<QuietHoursResult> {
  return quietHoursOf(await loadQuietHoursUser(userId), now);
}

/**
 * Quiet hours for the two call schedulers. Off: their old check, the
 * quietHours object only, on the server clock, waiting until its end hour,
 * unless the person saved quiet hours in the menu (QUIET_HOURS_FROM_PREFS).
 */
export async function callQuietHours(userId: string, now = new Date()): Promise<QuietHoursResult> {
  if (isQuietHoursUnified()) return userQuietHours(userId, now);
  const user = await loadQuietHoursUser(userId);
  // Quiet hours saved in the menu: the shared predicate, in their zone, with theirs.
  if (savedQuietHours(user)) return quietHoursOf(user, now);
  const q = user?.outreachPreferences?.quietHours;
  const quiet =
    !!q?.enabled && isQuietAt(now, parseQuietWindow(q.start, q.end), [serverTimezone()]);
  if (!quiet) return { quiet, until: now };
  const endHour = q?.end ? parseInt(q.end.split(':')[0], 10) : 8;
  const until = new Date(now);
  if (until.getHours() >= endHour) until.setDate(until.getDate() + 1);
  until.setHours(endHour, 0, 0, 0);
  return { quiet, until };
}
