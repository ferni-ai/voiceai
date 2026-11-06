/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller
 * at that time instead, playing the words meant for the other person. With the
 * flag on, a `who` that names anyone but the caller schedules nothing, and the
 * reply says so and offers what Ferni can do instead: "I can't set a call to
 * your aunt June for later yet. I can call your aunt June right now, or remind
 * you at 6pm to give them a call." The description says it rings only the caller.
 *
 * @module tools/domains/scheduling/schedule-call-who
 */
import { z } from 'zod';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { ownerFirstNames } from '../communication/outreach/outreach-confirm.js';

/** Read when the tool is built and on each run, so a cohort's value applies per call. */
export function scheduleCallWhoOn(env: Env = process.env): boolean {
  return flagOn('SCHEDULE_CALL_WHO', env);
}

/** What the model may write for the caller themself. */
const SELF = new Set(['', 'me', 'myself', 'self', 'user', 'the user', 'caller', 'the caller']);

/** Whom the call is for when that is someone other than the caller; undefined for the caller or unsaid. */
export function otherPerson(who: unknown, owner: readonly string[] = []): string | undefined {
  const name = typeof who === 'string' ? who.trim().replace(/[.!?]+$/, '') : '';
  const key = name.toLowerCase();
  if (SELF.has(key) || owner.includes(key.split(/\s+/)[0] ?? '')) return undefined;
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
export function onlyRingsYouLine(who: string, when?: unknown): string {
  const name = spokenWho(who);
  return (
    `I can't set a call to ${name} for later yet. ` +
    `I can call ${name} right now, or remind you ${spokenWhen(when)} to give them a call.`
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

/** The reply when the call is for someone else, or undefined: the caller's own call, or the flag off. */
export function forSomeoneElse(
  params: { who?: unknown; when?: unknown },
  opts: unknown,
  env: Env = process.env
): string | undefined {
  if (!scheduleCallWhoOn(env)) return undefined;
  const other = otherPerson(params.who, ownerFirstNames(opts));
  return other === undefined ? undefined : onlyRingsYouLine(other, params.when);
}
