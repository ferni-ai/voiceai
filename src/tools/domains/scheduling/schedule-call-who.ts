/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller
 * at that time instead, playing the words meant for the other person. With the
 * flag on, the model says whom the call is for; a `who` naming anyone but the
 * caller schedules nothing and writes nothing, and the tool result says so.
 * It offers nothing in its place. The description says it rings only the caller.
 *
 * @module tools/domains/scheduling/schedule-call-who
 */
import { z } from 'zod';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { words } from '../communication/outreach/consent-words.js';
import { ownerNames } from '../communication/outreach/outreach-confirm.js';

/** Read when the tool is built and on each run, so a cohort's value applies per call. */
const scheduleCallWhoOn = (env: Env): boolean => flagOn('SCHEDULE_CALL_WHO', env);

/** What the model may write for the caller themself, or their own phone. */
const SELF = new Set([
  ...['', 'me', 'myself', 'self', 'i', 'user', 'the user', 'caller', 'the caller'],
  ...['my phone', 'my cell', 'my cell phone', 'my mobile', 'my number'],
  ...['my own', 'my own phone', 'my own number'],
]);

/**
 * Whether `said` is the caller's own name: the opening words of one of their
 * names (ownerNames: "mary jane testing"), from the first word up to all of it.
 * Both sides go through the same words(), so "O'Brien" and "Mary-Jane" match.
 */
function isOwnName(said: string[], owner: readonly string[]): boolean {
  if (said.length === 0) return false;
  return owner.some((full) => {
    const own = full.split(' ');
    return said.every((word, i) => word === own[i]); // past their last word, own[i] is undefined
  });
}

/**
 * Whom the call is for when that is someone other than the caller; undefined
 * for the caller or unsaid. The caller's own name counts only whole: their
 * first name, or their name up to their full name, never "Riley from work"
 * or "Riley's boss".
 */
export function otherPerson(who: unknown, owner: readonly string[] = []): string | undefined {
  const name = typeof who === 'string' ? who.trim().replace(/[.!?]+$/, '') : '';
  const key = name.toLowerCase().replace(/\s+/g, ' ');
  if (SELF.has(key) || isOwnName(words(name), owner)) return undefined;
  return name;
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
    'For a call to someone else at a set time, set who to that person: nothing is scheduled.'
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
 * The tool result when the call is for someone else, or undefined: the
 * caller's own call, or the flag off. Nothing is scheduled and nothing offered.
 */
export function forSomeoneElse(
  params: { who?: unknown },
  opts: unknown,
  env: Env = process.env
): string | undefined {
  if (!scheduleCallWhoOn(env)) return undefined;
  const other = otherPerson(params.who, ownerNames(opts));
  if (other === undefined) return undefined;
  return (
    `Nothing was scheduled: this tool only rings the caller's own phone, so it can't call ${other}. ` +
    'Tell the caller that plainly and kindly, in your own words.'
  );
}
