/**
 * Which way a proactive check-in goes: a note in the app, a text, or a call.
 *
 * - A note in the app works whenever outreach is on.
 * - A text is for something timely, to the phone the user verified (the one on
 *   their Firebase account), when they turned texts on.
 * - A call is for something meaningful (a promised call) when they turned calls
 *   on: at most one a day, inside the call window (call-hours-guard), never in
 *   their quiet hours.
 * - Quiet hours are the user's own (outreachPreferences.quietHours) or 21:00 to
 *   08:00, in their own time zone. Nothing goes out then. Without a time zone
 *   on the profile there are no texts or calls: we can't tell when they sleep.
 * - Backing off: two texts in a row with no conversation since means no more
 *   texts until they talk to Ferni again; a call that wasn't picked up (or was
 *   a "not now") means no calls for three days; a snooze holds everything.
 * - outreachPreferences.proactiveFrequency: 'gentle' (the default) or 'normal'
 *   sets the daily caps; 'off' stops proactive check-ins.
 *
 * @module services/outreach/proactive-channels/channel-policy
 */

import { isValidTimezone, localMinutes, nextCallableTime } from '../call-hours-guard.js';
import { consentFromPrefs } from '../outreach-consent.js';
import type { OutreachLogEntry } from './outreach-log.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A missed or declined call: no more calls for this long. */
const CALL_BACKOFF_MS = 3 * DAY_MS;
/** Texts in a row without a conversation since, before texts stop. */
const MAX_UNANSWERED_TEXTS = 2;
const DEFAULT_QUIET = { startMin: 21 * 60, endMin: 8 * 60 };

export type ProactiveFrequency = 'gentle' | 'normal' | 'off';

/** Per rolling 24 hours. */
const CAPS: Record<
  Exclude<ProactiveFrequency, 'off'>,
  { total: number; sms: number; call: number }
> = {
  gentle: { total: 3, sms: 2, call: 1 },
  normal: { total: 6, sms: 4, call: 1 },
};

const CALL_MISSED: ReadonlySet<OutreachLogEntry['outcome']> = new Set([
  'no_answer',
  'busy',
  'declined',
]);

interface ProactivePrefs {
  proactiveFrequency?: unknown;
  proactiveSnoozeUntil?: unknown;
  quietHours?: { enabled?: unknown; start?: unknown; end?: unknown };
}

export function frequencyOf(prefs: unknown): ProactiveFrequency {
  const f = (prefs as ProactivePrefs | undefined)?.proactiveFrequency;
  return f === 'normal' || f === 'off' ? f : 'gentle';
}

function quietWindow(prefs: unknown): { startMin: number; endMin: number } {
  const q = (prefs as ProactivePrefs | undefined)?.quietHours;
  const toMin = (s: unknown): number | undefined => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(typeof s === 'string' ? s : '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
  };
  const startMin = toMin(q?.start);
  const endMin = toMin(q?.end);
  if (q?.enabled === false || startMin === undefined || endMin === undefined) return DEFAULT_QUIET;
  return { startMin, endMin };
}

/** True during the user's quiet hours in their own time zone. */
export function inQuietHours(prefs: unknown, timezone: string, now: Date): boolean {
  const { startMin, endMin } = quietWindow(prefs);
  const min = localMinutes(now, timezone);
  return startMin <= endMin ? min >= startMin && min < endMin : min >= startMin || min < endMin;
}

export interface PolicyInput {
  trigger: Pick<ProactiveTrigger, 'weight' | 'timely' | 'promisedCall'>;
  now: Date;
  /** The user's stored outreachPreferences. */
  prefs: unknown;
  timezone?: string;
  /** The phone on their Firebase account; texts and calls go nowhere else. */
  verifiedPhone?: string;
  lastTalkedAt?: number;
  /** Their outreach log for at least the last three days. */
  recent: OutreachLogEntry[];
  /** A call can be placed (the SIP trunk is configured). */
  canCall: boolean;
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
  const calls = input.recent.filter((e) => e.channel === 'voice_call');
  if (sentToday.filter((e) => e.channel === 'voice_call').length >= maxCalls) {
    return 'already called today';
  }
  const missed = calls.find(
    (e) => CALL_MISSED.has(e.outcome) && now - Date.parse(e.outcomeAt ?? e.at) < CALL_BACKOFF_MS
  );
  if (missed) return `backing off calls after a ${missed.outcome.replace('_', ' ')}`;
  const quiet = [quietWindow(input.prefs)];
  if (nextCallableTime(input.now, [tz], quiet).getTime() !== now) return 'outside call hours';
  return null;
}

/** Texts sent since they last talked with Ferni that got no reply. */
function unansweredTexts(input: PolicyInput): number {
  const since = input.lastTalkedAt ?? 0;
  return input.recent.filter(
    (e) => e.channel === 'sms' && Date.parse(e.at) > since && e.outcome !== 'replied'
  ).length;
}

type Caps = (typeof CAPS)[keyof typeof CAPS];

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
  const consent = consentFromPrefs(input.prefs);
  if (input.trigger.weight !== 'meaningful' || !consent.channels.includes('voice_call')) {
    return null;
  }
  if (!input.canCall) return null;
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
  if (!consentFromPrefs(input.prefs).channels.includes('sms')) {
    return { channel: 'in_app', why: 'texts not turned on' };
  }
  if (sentToday.filter((e) => e.channel === 'sms').length >= caps.sms) {
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
  if (tz && inQuietHours(input.prefs, tz, input.now)) return { channel: null, why: 'quiet hours' };
  if (!tz) return { channel: 'in_app', why: 'no time zone on file, so no texts or calls' };
  if (!input.trigger.timely) return { channel: 'in_app', why: 'not time-sensitive' };
  if (!input.verifiedPhone) return { channel: 'in_app', why: 'no verified phone' };
  return tryCall(input, tz, sentToday, caps) ?? textOrNote(input, sentToday, caps);
}
