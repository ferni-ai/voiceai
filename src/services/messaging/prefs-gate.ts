/**
 * How today's senders read messagingPrefs (prefs.ts), behind MESSAGING_PREFS:
 * the person's own cohort value, else the process env. Off: each sender keeps
 * its own rule. On:
 *
 * - quiet hours for texts to the owner are their own saved window, which
 *   replaces 21:00 to 08:00 (Seth chose 22:30-07:00; a union would ignore it),
 *   in their zone (saved, else their profile's, else the sender's, else quiet
 *   when it is quiet on either US coast). Missing or invalid: the default.
 *   Third parties always get the default (on-behalf texts don't read this);
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
import { DEFAULT_PREFS, prefsFromDoc, quietSpan, readPrefs, type MessagingPrefs } from './prefs.js';

export async function prefsOnFor(userId: string, opts: FlagLookupOptions = {}): Promise<boolean> {
  const own = await flagForUser(userId, 'MESSAGING_PREFS', opts);
  return own ? own === 'on' : flagOn('MESSAGING_PREFS', opts.env ?? process.env);
}

/** 21:00 to 08:00: everyone without a valid window of their own, and every third party. */
export const DEFAULT_QUIET = parseQuietWindow(
  DEFAULT_PREFS.quietStart,
  DEFAULT_PREFS.quietEnd
) as QuietWindow;

/** The owner's own saved window (4 to 16 hours), if valid. Use as `ownerQuietWindow(p) ?? DEFAULT_QUIET`. */
export function ownerQuietWindow(p: MessagingPrefs): QuietWindow | undefined {
  const span = quietSpan({ start: p.quietStart, end: p.quietEnd });
  return span && parseQuietWindow(span.start, span.end);
}

/** When the owner's quiet hours end if `now` is inside them, else null. `zone`: the sender's. */
export function quietUntil(p: MessagingPrefs, now: Date, zone?: string): Date | null {
  const zones = quietZones(p.zone ?? zone);
  const window = ownerQuietWindow(p) ?? DEFAULT_QUIET;
  return isQuietAt(now, window, zones) ? quietEndsAt(now, window, zones) : null;
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
 * with their prefs layered in when the flag is on: their quiet window (which
 * replaces the policy's 21:00 floor), their zone, and channels they turned off
 * taken out of the opted-in list.
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
  const w = ownerQuietWindow(p) ?? DEFAULT_QUIET;
  return { prefs: { ...own, channels, ownerQuietWindow: w }, timezone: p.zone ?? timezone };
}
