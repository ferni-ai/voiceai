/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller
 * at that time instead, playing the words meant for the other person. With the
 * flag on, a `who` that names anyone but the caller schedules nothing, and the
 * reply says so and offers what Ferni can do instead.
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

/** The reply when the call is for someone else: nothing scheduled, and what Ferni can do instead. */
export function onlyRingsYouLine(who: string): string {
  return (
    `Nothing was scheduled: a scheduled call can only ring you, so I can't place a call to ${who} ` +
    `at a set time yet. I can remind you then to call ${who} yourself, or call ${who} now.`
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
  params: { who?: unknown },
  opts: unknown,
  env: Env = process.env
): string | undefined {
  if (!scheduleCallWhoOn(env)) return undefined;
  const other = otherPerson(params.who, ownerFirstNames(opts));
  return other === undefined ? undefined : onlyRingsYouLine(other);
}
