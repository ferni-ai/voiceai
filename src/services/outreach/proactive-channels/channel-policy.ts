/**
 * Which way a proactive check-in goes: a note in the app, a text, or a call.
 *
 * - A note in the app works whenever outreach is on.
 * - A text is for something timely, to the phone the user verified (the one on
 *   their Firebase account), when they turned texts on.
 * - A call is for something meaningful (a promised call) when they turned calls
 *   on: at most one a day, inside the call window (call-hours-guard), never in
 *   their quiet hours.
 * - Quiet hours (nothing goes out): 21:00 to 08:00 always, plus the user's
 *   own window (read as quiet-hours.ts, #802, does), in their own time zone,
 *   and the one saved in the menu (quiet-hours.ts savedQuietHours).
 *   Without a time zone there are no texts or calls.
 * - Backing off: two texts in a row with no conversation since means no more
 *   texts until they talk to Ferni again; a call that wasn't picked up (or was
 *   a "not now") means no calls for three days; a snooze holds everything.
 * - A phone that opted out (STOP, do-not-call; opt-outs.ts) gets no text or
 *   call: the other phone channel only if it didn't opt out of that too, else a
 *   note in the app.
 * - outreachPreferences.proactiveFrequency: 'normal', 'gentle' (the default)
 *   or 'light' sets the daily caps (light: one a day, no calls); 'off' stops
 *   proactive check-ins.
 *
 * @module services/outreach/proactive-channels/channel-policy
 */

import {
  isValidTimezone,
  localMinutes,
  nextCallableTime,
  parseQuietWindow,
  type QuietWindow,
} from '../call-hours-guard.js';
import { consentFromPrefs } from '../outreach-consent.js';
import { isQuietAt, type ZonedQuiet } from '../quiet-hours.js';
import type { PhoneOptOuts } from './opt-outs.js';
import type { OutreachLogEntry } from './outreach-log.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A missed or declined call: no more calls for this long. */
const CALL_BACKOFF_MS = 3 * DAY_MS;
/** Texts in a row without a conversation since, before texts stop. */
const MAX_UNANSWERED_TEXTS = 2;
const QUIET_FLOOR: QuietWindow = { startMin: 21 * 60, endMin: 8 * 60 };

export type ProactiveFrequency = 'normal' | 'gentle' | 'light' | 'off';

const FREQUENCIES: readonly ProactiveFrequency[] = ['normal', 'gentle', 'light', 'off'];

type Caps = { total: number; sms: number; call: number };
/** Per rolling 24 hours. */
const CAPS: Record<Exclude<ProactiveFrequency, 'off'>, Caps> = {
  gentle: { total: 3, sms: 2, call: 1 },
  normal: { total: 6, sms: 4, call: 1 },
  light: { total: 1, sms: 1, call: 0 },
};

const CALL_MISSED = new Set<string>(['no_answer', 'busy', 'declined']);

interface ProactivePrefs {
  proactiveFrequency?: unknown;
  proactiveSnoozeUntil?: unknown;
  quietHours?: { enabled?: unknown; start?: unknown; end?: unknown };
  quietHoursStart?: unknown;
  quietHoursEnd?: unknown;
}

export function frequencyOf(prefs: unknown): ProactiveFrequency {
  const f = (prefs as ProactivePrefs | undefined)?.proactiveFrequency;
  return FREQUENCIES.includes(f as ProactiveFrequency) ? (f as ProactiveFrequency) : 'gentle';
}

/**
 * 21:00 to 08:00 always, plus their own window if they set one (quiet-hours.ts
 * rules: quietHours when enabled, else quietHoursStart/End). Theirs can add
 * quiet time, never take it away.
 */
function quietWindows(prefs: unknown): QuietWindow[] {
  const p = prefs as ProactivePrefs | undefined;
  const q = p?.quietHours;
  const own =
    q && Boolean(q.enabled) ? parseQuietWindow(String(q.start), String(q.end)) : undefined;
  const { quietHoursStart: hs, quietHoursEnd: he } = p ?? {};
  const hours =
    Number.isInteger(hs) && Number.isInteger(he) && hs !== he
      ? { startMin: Number(hs) * 60, endMin: Number(he) * 60 }
      : undefined;
  const theirs = own ?? hours;
  return theirs ? [QUIET_FLOOR, theirs] : [QUIET_FLOOR];
}

/** True during the user's quiet hours in their own time zone. */
export function inQuietHours(prefs: unknown, timezone: string, now: Date): boolean {
  const min = localMinutes(now, timezone);
  return quietWindows(prefs).some(({ startMin: s, endMin: e }) =>
    s <= e ? min >= s && min < e : min >= s || min < e
  );
}

/** A text went out: sent as one, or as the stand-in for a call that couldn't be placed. */
const isText = (e: OutreachLogEntry): boolean => e.channel === 'sms' || e.fallbackChannel === 'sms';

export interface PolicyInput {
  trigger: Pick<ProactiveTrigger, 'weight' | 'timely' | 'promisedCall'>;
  now: Date;
  /** The user's stored outreachPreferences. */
  prefs: unknown;
  timezone?: string;
  /** Quiet hours saved in the menu (QUIET_HOURS_FROM_PREFS); they add to the ones above. */
  savedQuiet?: ZonedQuiet;
  /** The phone on their Firebase account; texts and calls go nowhere else. */
  verifiedPhone?: string;
  lastTalkedAt?: number;
  /** Their outreach log for at least the last three days. */
  recent: OutreachLogEntry[];
  /** A call can be placed (the SIP trunk is configured). */
  canCall: boolean;
  /** What the verified phone opted out of (opt-outs.ts); never texted or rung on those. */
  optedOut: PhoneOptOuts;
}

/** channel null: hold it for now (the trigger stays pending) or, with `stop`, not at all. */
export interface ChannelChoice {
  channel: ProactiveChannel | null;
  why: string;
  stop?: boolean;
}

function callBlocked(
  input: PolicyInput,
  tz: string,
  sentToday: OutreachLogEntry[],
  maxCalls: number
): string | null {
  const now = input.now.getTime();
  const callsToday = sentToday.filter((e) => e.channel === 'voice_call').length;
  if (callsToday >= maxCalls) return 'already called today';
  const missed = input.recent
    .filter((e) => e.channel === 'voice_call' && CALL_MISSED.has(e.outcome))
    .find((e) => now - Date.parse(e.outcomeAt ?? e.at) < CALL_BACKOFF_MS);
  if (missed) return `backing off calls after a ${missed.outcome.replace('_', ' ')}`;
  if (nextCallableTime(input.now, [tz], quietWindows(input.prefs)).getTime() !== now)
    return 'outside call hours';
  return null;
}

/** Texts sent since they last talked with Ferni that got no reply. */
function unansweredTexts(input: PolicyInput): number {
  const since = input.lastTalkedAt ?? 0;
  return input.recent.filter(
    (e) => isText(e) && Date.parse(e.at) > since && e.outcome !== 'replied'
  ).length;
}

/** Off, snoozed or capped for the day: why nothing goes out now. Otherwise, the caps for today. */
function gate(input: PolicyInput, sentToday: OutreachLogEntry[]): ChannelChoice | Caps {
  if (!consentFromPrefs(input.prefs).enabled) {
    return { channel: null, why: 'outreach off', stop: true };
  }
  const frequency = frequencyOf(input.prefs);
  if (frequency === 'off') return { channel: null, why: 'proactive check-ins off', stop: true };
  const snooze = Date.parse(String((input.prefs as ProactivePrefs)?.proactiveSnoozeUntil ?? ''));
  if (snooze > input.now.getTime()) return { channel: null, why: 'snoozed' };
  const caps = CAPS[frequency];
  if (sentToday.length >= caps.total) return { channel: null, why: 'daily limit reached' };
  return caps;
}

/** A call, a wait for call hours, or null to fall through to a text. */
function tryCall(
  input: PolicyInput,
  tz: string,
  sentToday: OutreachLogEntry[],
  caps: Caps
): ChannelChoice | null {
  const callsOn = consentFromPrefs(input.prefs).channels.includes('voice_call');
  if (input.trigger.weight !== 'meaningful' || !callsOn || !input.canCall) return null;
  if (input.optedOut.call) return null;
  const blocked = callBlocked(input, tz, sentToday, caps.call);
  if (!blocked) {
    return {
      channel: 'voice_call',
      why: input.trigger.promisedCall ? 'promised a call' : 'meaningful',
    };
  }
  // A promised call waits for the window rather than turning into a text.
  if (blocked === 'outside call hours' && input.trigger.promisedCall) {
    return { channel: null, why: blocked };
  }
  return null;
}

function textOrNote(input: PolicyInput, sentToday: OutreachLogEntry[], caps: Caps): ChannelChoice {
  if (input.optedOut.sms) return { channel: 'in_app', why: 'opted out of texts' };
  if (!consentFromPrefs(input.prefs).channels.includes('sms')) {
    return { channel: 'in_app', why: 'texts not turned on' };
  }
  if (sentToday.filter(isText).length >= caps.sms) {
    return { channel: 'in_app', why: 'text limit reached today' };
  }
  if (unansweredTexts(input) >= MAX_UNANSWERED_TEXTS) {
    return { channel: 'in_app', why: 'last texts went unanswered' };
  }
  return { channel: 'sms', why: 'timely' };
}

export function chooseChannel(input: PolicyInput): ChannelChoice {
  const sentToday = input.recent.filter((e) => input.now.getTime() - Date.parse(e.at) < DAY_MS);
  const caps = gate(input, sentToday);
  if ('why' in caps) return caps;

  const tz = isValidTimezone(input.timezone) ? input.timezone : undefined;
  const saved = input.savedQuiet;
  const savedQuiet = !!saved && isQuietAt(input.now, saved.window, saved.zones);
  if (tz && (savedQuiet || inQuietHours(input.prefs, tz, input.now)))
    return { channel: null, why: 'quiet hours' };
  if (!tz) return { channel: 'in_app', why: 'no time zone on file, so no texts or calls' };
  if (!input.trigger.timely) return { channel: 'in_app', why: 'not time-sensitive' };
  if (!input.verifiedPhone) return { channel: 'in_app', why: 'no verified phone' };
  return tryCall(input, tz, sentToday, caps) ?? textOrNote(input, sentToday, caps);
}
