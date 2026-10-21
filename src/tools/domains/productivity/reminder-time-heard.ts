/**
 * setReminder saves only a time the caller said (REMINDER_TIME_FROM_CALLER, off by default).
 *
 * Prod, 2026-10-20 (#2289): the owner was cut off mid-request ("You need to
 * remind me next time. I schedule an") and the model called setReminder with
 * `when: "tomorrow morning"`, a time he never said. A reminder and a calendar
 * event were stored for 9 AM the next day. He then said "Dinner is tonight",
 * and the wrong reminder stayed where it was.
 *
 * With the flag on:
 * - Every time word in `when` must be in the caller's own recent words (the
 *   session's chat history, user turns only, never Ferni's notes). A missing
 *   or unsaid time saves nothing and tells the model to ask when.
 * - A second setReminder in the same call moves the first one (cancelReminder
 *   also removes its calendar item) only when the message is the same and the
 *   caller's latest turn corrects the time ("Dinner is tonight", "actually,
 *   make it 6"). Otherwise both are kept: "take my pill tonight at 9 and
 *   tomorrow at 9am" is two reminders.
 *
 * With no chat history (a context without a live session) the time is not
 * checked, as handoff-consent.ts does.
 *
 * @module tools/domains/productivity/reminder-time-heard
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { historyOf } from '../../handoff/handoff-consent.js';
import { latestUserText } from '../../retrieval/turn-tool-retrieval.js';
import { isOwnContextNote } from '../../utils/own-note.js';

export function reminderTimeFromCallerOn(env: Env = process.env): boolean {
  return flagOn('REMINDER_TIME_FROM_CALLER', env);
}

/** What setReminder returns instead of saving a time the caller didn't give. */
export const ASK_WHEN =
  "Not saved: they didn't say when. Ask them when they want the reminder, then call setReminder " +
  "again with the time in their own words. Don't pick a time for them.";

/** How many of the caller's latest messages may hold the time ("Remind me to X." "When?" "At 5."). */
const RECENT_CALLER_MESSAGES = 8;

// Words a time phrase may add without the caller saying them: filler, a.m./p.m.
// read from context, "today" for a bare clock time, "next" before a day name.
const MAY_ADD = new Set(
  'at in on the a an by for from around about of this next o clock oclock am pm to and today'.split(
    ' '
  )
);

const UNITS = '(?:one|two|three|four|five|six|seven|eight|nine)';
const NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  couple: 2,
};

/** Lower-case words with numbers as digits and one word for each time of day. */
export function timeWords(text: string): string[] {
  const lower = text
    .toLowerCase()
    .replace(/\b([ap])\.\s?m\b\.?/g, '$1m')
    .replace(/\bhalf (an )?hour\b/g, '30 minutes')
    .replace(/\b(an|a) (hour|minute|day|week|month)\b/g, '1 $2')
    .replace(new RegExp(`\\b(twenty|thirty|forty|fifty)[- ]${UNITS}\\b`, 'g'), (m) =>
      String(
        m
          .split(/[- ]/)
          .map((w) => NUMBERS[w])
          .reduce((a, b) => a + b, 0)
      )
    )
    .replace(/\b(noon|midday)\b/g, 'noon 12')
    .replace(/\bmidnight\b/g, 'midnight 12')
    .replace(/(\d)([a-z])/g, '$1 $2');
  return lower
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w in NUMBERS ? String(NUMBERS[w]) : w))
    .map((w) => (/^\d+$/.test(w) ? String(Number(w)) : w))
    .map(
      (w) =>
        ({ tonight: 'evening', night: 'evening', tmrw: 'tomorrow', tomorow: 'tomorrow' })[w] ?? w
    )
    .map((w) => ({ min: 'minute', mins: 'minute', hr: 'hour', hrs: 'hour' })[w] ?? w)
    .map((w) => (/^(minute|hour|day|week|month|weekend)s$/.test(w) ? w.slice(0, -1) : w));
}

/** The time words a `when` needs the caller to have said. An ISO wall time needs its hour. */
function neededWords(when: string): string[] {
  const iso = when.trim().match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if (iso) {
    const [hour, minute] = [Number(iso[1]), Number(iso[2])];
    return [String(hour % 12 || 12), ...(minute ? [String(minute)] : [])];
  }
  // "2:00" needs the 2, not the 00.
  return timeWords(when).filter((w) => !MAY_ADD.has(w) && w !== '0');
}

/** Whether every time word in `when` is in `callerText`. An empty `when` was never said. */
export function callerSaidTime(when: string | undefined, callerText: string): boolean {
  const needed = when ? neededWords(when) : [];
  if (needed.length === 0) return false;
  const said = new Set(timeWords(callerText));
  // The caller's "2" may come back as "14" in a 24-hour time.
  const pmHour = (w: string): boolean =>
    /^(1[3-9]|2[0-3])$/.test(w) && said.has(String(Number(w) - 12));
  return needed.every((w) => said.has(w) || pmHour(w));
}

/** The caller's latest messages in this call, or null with no chat history. */
export function recentCallerText(runCtx: unknown): string | null {
  const history = historyOf(runCtx);
  if (!history) return null;
  const said: string[] = [];
  for (let i = history.items.length - 1; i >= 0 && said.length < RECENT_CALLER_MESSAGES; i--) {
    const item = history.items[i];
    if (item.type !== 'message' || item.role !== 'user') continue;
    const text = item.textContent ?? '';
    if (text && !isOwnContextNote(text)) said.unshift(text);
  }
  return said.join(' ');
}

/**
 * setReminder's gate, given the tool's RunContext. Null lets the reminder be
 * saved; otherwise it is the tool result to return instead.
 */
export function holdUnsaidReminderTime(
  when: string | undefined,
  runCtx: unknown,
  env: Env = process.env
): string | null {
  if (!reminderTimeFromCallerOn(env)) return null;
  if (!when?.trim()) return ASK_WHEN;
  const callerText = recentCallerText(runCtx);
  if (callerText === null) return null;
  return callerSaidTime(when, callerText) ? null : ASK_WHEN;
}

// ============================================================================
// Moving a reminder set earlier in the same call
// ============================================================================

export interface SetThisCall {
  id: string;
  message: string;
  scheduledFor: Date;
}

/** Keyed by the AgentSession object, so a reminder never moves across calls. */
const setInCall = new WeakMap<object, SetThisCall>();

function sessionOf(runCtx: unknown): object | undefined {
  const session = (runCtx as { session?: unknown } | undefined)?.session;
  return typeof session === 'object' && session !== null ? session : undefined;
}

const words = (s: string): string => timeWords(s).join(' ');

/**
 * Words that change a time just given: "actually", "instead", "change/make/move
 * it", a reply opening "no", "tomorrow's too late", "dinner is tonight", "not
 * tomorrow, tonight". Not a bare "and tomorrow at 9", which asks for another reminder.
 */
const CHANGES_TIME =
  /\b(?:actually|instead|(?:change|make|move|push|switch) it|(?:too|a little(?: bit)?|a bit) (?:late|early)|(?:it'?s|is) (?:tonight|today|tomorrow|this (?:morning|afternoon|evening))|not (?:at )?[a-z0-9']+(?: [a-z0-9']+)?, [a-z0-9]+)\b|^\s*(?:no|nope|nah)\b/i;

/** Whether the caller's latest turn changes a time. */
export function callerCorrectsTime(runCtx: unknown): boolean {
  const history = historyOf(runCtx);
  const said = history ? (latestUserText(history) ?? '') : '';
  return CHANGES_TIME.test(said);
}

/**
 * The reminder this call already set that this one corrects, if the flag is
 * on: the same message, exactly, and the caller's latest turn changes the time.
 */
export function earlierReminderFor(
  message: string,
  runCtx: unknown,
  env: Env = process.env
): SetThisCall | undefined {
  const session = sessionOf(runCtx);
  if (!session || !reminderTimeFromCallerOn(env)) return undefined;
  const earlier = setInCall.get(session);
  if (!earlier || words(earlier.message) !== words(message) || !words(message)) return undefined;
  return callerCorrectsTime(runCtx) ? earlier : undefined;
}

/** Remember the reminder this call just set, so a corrected time moves it. */
export function rememberReminderSet(runCtx: unknown, reminder: SetThisCall): void {
  const session = sessionOf(runCtx);
  if (session) setInCall.set(session, reminder);
}
