/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller
 * at that time instead, playing the words meant for the other person. With the
 * flag on, a `who` that names anyone but the caller schedules nothing, and the
 * reply says so and offers what Ferni can do instead: "I can't set a call to
 * your aunt June for later yet. I can call your aunt June for you, or remind
 * you at 6pm to give them a call." No "right now": an on-behalf call can wait
 * for the call-hours window. The description says it rings only the caller.
 *
 * Emergency services, a help line and other toll-free lines are never
 * offered a call (services/safety/help-line-who.ts). A help line's reply
 * gives the caller the line itself, from the safety resources.
 *
 * @module tools/domains/scheduling/schedule-call-who
 */
import { z } from 'zod';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { lineCallerDials, reachLine } from '../../../services/safety/index.js';
import { dialItThemselves } from '../../../utils/dialable-number.js';
import { ownerNames } from '../communication/outreach/outreach-confirm.js';

/** Read when the tool is built and on each run, so a cohort's value applies per call. */
const scheduleCallWhoOn = (env: Env): boolean => flagOn('SCHEDULE_CALL_WHO', env);

/** What the model may write for the caller themself, or their own phone. */
const SELF = new Set([
  ...['', 'me', 'myself', 'self', 'i', 'user', 'the user', 'caller', 'the caller'],
  ...['my phone', 'my cell', 'my cell phone', 'my mobile', 'my number'],
]);

/**
 * Whom the call is for when that is someone other than the caller; undefined
 * for the caller or unsaid. The caller's own name counts only whole: their
 * first name alone or their full name, never "Riley from work".
 */
export function otherPerson(who: unknown, owner: readonly string[] = []): string | undefined {
  const name = typeof who === 'string' ? who.trim().replace(/[.!?]+$/, '') : '';
  const key = name.toLowerCase().replace(/\s+/g, ' ');
  const own = owner.flatMap((full) => [full, full.split(' ')[0]]);
  if (SELF.has(key) || own.includes(key)) return undefined;
  return name;
}

/** "my mom Priya" as Ferni says it back: "your mom Priya". */
const spokenWho = (who: string): string => who.replace(/^my\b/i, 'your');

/** "at 6pm", "tomorrow morning", "6pm" read as "at 6pm"; "then" when no time was given. */
function spokenWhen(when: unknown): string {
  const said = typeof when === 'string' ? when.trim().replace(/[.!?]+$/, '') : '';
  if (!said) return 'then';
  return /^\d/.test(said) ? `at ${said}` : said;
}

/** The reply when the call is for someone else: nothing scheduled, and what Ferni can do instead. */
function onlyRingsYouLine(who: string, when?: unknown): string {
  const name = spokenWho(who);
  return (
    `I can't set a call to ${name} for later yet. ` +
    `I can call ${name} for you, or remind you ${spokenWhen(when)} to give them a call.`
  );
}

/** main's description, word for word: what the model reads with the flag off. */
const DESCRIPTION = `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`;

/** The tool's description; with the flag on it says the call rings only the caller. */
export function scheduleCallDescription(env: Env = process.env): string {
  if (!scheduleCallWhoOn(env)) return DESCRIPTION;
  return (
    `${DESCRIPTION}\n\nIt only ever rings the caller's own phone, never anyone else. ` +
    'For a call to someone else at a set time, set who to that person: nothing is scheduled, ' +
    'and the caller hears what can be done instead.'
  );
}

/** The parameter the model fills with whom the call is for; none with the flag off. */
export function whoParam(env: Env = process.env): { who?: z.ZodOptional<z.ZodString> } {
  if (!scheduleCallWhoOn(env)) return {};
  const who = z
    .string()
    .optional()
    .describe('Who the call is for: "me" for the caller, or the other person\'s name');
  return { who };
}

/**
 * The reply when the call is for someone else, or undefined: the caller's own
 * call, or the flag off. A line Ferni can't dial is never offered a call; a
 * help line's reply gives the caller the line to call or text themselves.
 */
export function forSomeoneElse(
  params: { who?: unknown; when?: unknown },
  opts: unknown,
  env: Env = process.env
): string | undefined {
  if (!scheduleCallWhoOn(env)) return undefined;
  const other = otherPerson(params.who, ownerNames(opts));
  if (other === undefined) return undefined;
  const line = lineCallerDials(other);
  if (line?.kind === 'help-line') {
    return (
      `Nothing was scheduled: I can't place a call to ${other}. Say so plainly and kindly, ` +
      `and that the caller can reach ${reachLine(line.resource)}.`
    );
  }
  if (line) return `Nothing was scheduled: ${dialItThemselves(other)}.`;
  return onlyRingsYouLine(other, params.when);
}
