/**
 * How today's senders read messagingPrefs (prefs.ts), behind MESSAGING_PREFS:
 * the person's own cohort value, else the process env. Off: each sender keeps
 * its own rule. On:
 *
 * - quiet hours are 21:00 to 08:00 plus the person's own window, in their
 *   zone (saved, else their profile's, else the sender's, else quiet when it
 *   is quiet on either US coast). A saved window adds quiet time and never
 *   removes it, the way channel-policy.ts treats one;
 * - a channel they turned off doesn't carry Ferni's messages.
 *
 * Read site for the MESSAGING_PREFS cohort flag (per person, never at boot).
 * M4 moves these senders onto messaging/send(); this is the bridge until then.
 *
 * @module services/messaging/prefs-gate
 */
import { flagOn } from '../../config/env-flag.js';
import { parseQuietWindow, type QuietWindow } from '../outreach/call-hours-guard.js';
import { isQuietAt, quietEndsAt, quietZones } from '../outreach/quiet-hours.js';
import { flagForUser, type FlagLookupOptions } from '../platform/cohort-flags.js';
import { DEFAULT_PREFS, prefsFromDoc, readPrefs, type MessagingPrefs } from './prefs.js';

export async function prefsOnFor(userId: string, opts: FlagLookupOptions = {}): Promise<boolean> {
  const own = await flagForUser(userId, 'MESSAGING_PREFS', opts);
  return own ? own === 'on' : flagOn('MESSAGING_PREFS', opts.env ?? process.env);
}

const FLOOR = parseQuietWindow(DEFAULT_PREFS.quietStart, DEFAULT_PREFS.quietEnd) as QuietWindow;

function windowsOf(p: MessagingPrefs): QuietWindow[] {
  const own = parseQuietWindow(p.quietStart, p.quietEnd);
  return own ? [FLOOR, own] : [FLOOR];
}

/** When `p`'s quiet hours end if `now` is inside them, else null. `zone`: the sender's. */
export function quietUntil(p: MessagingPrefs, now: Date, zone?: string): Date | null {
  const zones = quietZones(p.zone ?? zone);
  const windows = windowsOf(p);
  let at = now;
  // Two overlapping windows: leave whichever holds `at` until neither does.
  for (let i = 0; i < windows.length * zones.length + 1; i++) {
    const w = windows.find((x) => isQuietAt(at, x, zones));
    if (!w) break;
    at = quietEndsAt(at, w, zones);
  }
  return at === now ? null : at;
}

/** With the flag on: when their quiet hours end (null: not quiet now). Undefined when off. */
export async function prefsQuietUntil(
  userId: string,
  now: Date,
  zone?: string
): Promise<Date | null | undefined> {
  if (!(await prefsOnFor(userId))) return undefined;
  return quietUntil(await readPrefs(userId), now, zone);
}

/** A quiet-hours check over their prefs, for a sender that decides many items at once. */
export async function quietCheckFor(userId: string): Promise<(at: Date, zone: string) => boolean> {
  const p = await readPrefs(userId);
  return (at, zone) => quietUntil(p, at, zone) !== null;
}

/**
 * The guarded sender's extra holds (guarded-text.ts), from the doc it already
 * read: 'sms-off' when they turned texts off here, and 'quiet-hours' for a
 * check-in (Ferni's own idea) inside their quiet hours. Kinds with a time the
 * person chose (reminders, follow-ups, a text they asked for) are timed upstream.
 */
export async function guardedTextHold(
  userId: string,
  userDoc: Record<string, unknown> | undefined,
  kind: string,
  now: Date
): Promise<'sms-off' | 'quiet-hours' | null> {
  if (!userDoc || !(await prefsOnFor(userId))) return null;
  const p = prefsFromDoc(userDoc);
  if (!p.channels.sms) return 'sms-off';
  return kind === 'checkin' && quietUntil(p, now) ? 'quiet-hours' : null;
}

/**
 * outreachPreferences as the proactive policy reads them (channel-policy.ts),
 * with their prefs layered in when the flag is on: their quiet window, their
 * zone, and channels they turned off taken out of the opted-in list.
 */
export async function proactivePolicyPrefs(
  userId: string,
  user: Record<string, unknown>,
  timezone: string | undefined
): Promise<{ prefs: unknown; timezone: string | undefined }> {
  const op = user.outreachPreferences;
  if (!(await prefsOnFor(userId))) return { prefs: op, timezone };
  const p = prefsFromDoc(user);
  const own = (op ?? {}) as { channels?: unknown };
  const off = (c: unknown): boolean => c === 'sms' || c === 'email' || c === 'push';
  const channels = Array.isArray(own.channels)
    ? own.channels.filter((c) => !off(c) || p.channels[c as 'sms' | 'email' | 'push'])
    : own.channels;
  const quietHours = { enabled: true, start: p.quietStart, end: p.quietEnd };
  return { prefs: { ...own, channels, quietHours }, timezone: p.zone ?? timezone };
}
