/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller at
 * that time instead, playing the words meant for the other person.
 *
 * With the flag on, the model says whom the call is for in `recipient`.
 * "other" (in any case, spaces trimmed) schedules nothing and writes nothing,
 * and the tool result says so, with nothing offered in its place. "self", a
 * missing value, or anything else schedules exactly as main does. Nothing is read from the message or from any
 * name, so the caller's own call is never refused.
 *
 * @module tools/domains/scheduling/schedule-call-recipient
 */
import { z } from 'zod';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

/** Read when the tool is built and on each run, so a cohort's value applies per call. */
const scheduleCallWhoOn = (env: Env): boolean => flagOn('SCHEDULE_CALL_WHO', env);

/** What the model reads for `recipient`. */
export const RECIPIENT_DESCRIPTION =
  'Who the call is for. "self": the person talking to you wants you to call them. ' +
  '"other": they want a call placed to, or a message given to, someone else.';

/** main's description, word for word: what the model reads with the flag off. */
const DESCRIPTION = `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`;

/** The tool result for a call meant for someone else: nothing scheduled, nothing offered. */
export const NOT_FOR_SOMEONE_ELSE =
  "Nothing was scheduled: this tool only rings the caller's own phone, so it can't call someone else. " +
  'Tell the caller that plainly and kindly, in your own words.';

/** The tool's description; with the flag on it says the call rings only the caller. */
export function scheduleCallDescription(env: Env = process.env): string {
  if (!scheduleCallWhoOn(env)) return DESCRIPTION;
  return (
    `${DESCRIPTION}\n\nIt only ever rings the caller's own phone. ` +
    'For a call to someone else, set recipient to "other": nothing is scheduled.'
  );
}

/** What the model wrote, trimmed and lower-cased: "Other" and " OTHER " are "other". */
const normalised = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

type RecipientField = z.ZodCatch<z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{ self: 'self'; other: 'other' }>>>>; // prettier-ignore

/**
 * The `recipient` parameter; none with the flag off. Optional; case and
 * surrounding spaces don't count, and a null or unknown value parses as
 * missing, so validation never drops a call.
 */
export function recipientParam(env: Env = process.env): { recipient?: RecipientField } {
  if (!scheduleCallWhoOn(env)) return {};
  const recipient = z
    .preprocess(normalised, z.enum(['self', 'other']).optional())
    .catch(undefined)
    .describe(RECIPIENT_DESCRIPTION);
  return { recipient };
}

/**
 * The tool result when the model said the call is for someone else, or
 * undefined: the caller's own call, a missing or unknown value, or the flag off.
 * Normalised here too, for tool paths that run without the schema's parse.
 * Logs a count only, never what the call was to say.
 */
export function forSomeoneElse(
  params: { recipient?: unknown },
  userId: string,
  env: Env = process.env
): string | undefined {
  if (!scheduleCallWhoOn(env) || normalised(params.recipient) !== 'other') return undefined;
  log.info({ userId, recipient: 'other' }, '📞 Scheduled call for someone else: nothing scheduled');
  return NOT_FOR_SOMEONE_ELSE;
}
