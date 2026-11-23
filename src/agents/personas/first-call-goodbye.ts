/**
 * FIRST_CALL_GOODBYE_GROUNDED=on (off by default, #4287): a first call's goodbye
 * names something to hear about next time only when the caller told Ferni about
 * one, in their own words. Otherwise it is a plain warm goodbye.
 *
 * FIRST_GOODBYE_NOTE (first-call-rapport.ts) asks for that callback on every
 * first-call goodbye and quotes one ("tell me how the interview goes"). On the
 * 2026-11-22 red team all six personas closed with that same line shape, and on
 * a call where the caller mentioned no plan Nayan's goodbye asked them to report
 * back on a "big change": the topic of his own question one turn earlier.
 *
 * "Told Ferni about one" is happy-exits.ts's plan read (mentionedPlan): the
 * caller's own lines only, so a topic Ferni asked about never counts. Nothing is
 * quoted for the model to copy beyond the caller's words.
 *
 * @module agents/personas/first-call-goodbye
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { callerTurnsOf, mentionedPlan } from './happy-exits.js';

export function firstCallGoodbyeGroundedEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_CALL_GOODBYE_GROUNDED', env);
}

const OPEN =
  "They're heading off. Keep the goodbye to one or two short sentences, by name if you know it.";
const CLOSE = 'No question, and no pitch for the app.';

/** No plan of theirs on the call: a plain warm goodbye, nothing to report back on. */
const FIRST_GOODBYE_WARM = `${OPEN} Just a plain, warm goodbye: don't ask them to tell you how anything goes, and don't bring up a plan or event they didn't tell you about. Something you asked them about is not something they told you. ${CLOSE}`;

/** They told Ferni about one plan: it may be the thing to hear about next time, and nothing else. */
const firstGoodbyeCallback = (plan: string): string =>
  `${OPEN} They told you about one thing coming up (their words: "${plan}"). If it fits, say in your own words you'd like to hear how that goes next time; mention nothing else they didn't tell you. ${CLOSE}`;

/**
 * The first-call goodbye note, grounded in what the caller said on this call:
 * their lines in the context, and `callerWords` (this reply's) if not there yet.
 */
export function groundedFirstGoodbye(chatCtx: llm.ChatContext, callerWords: string): string {
  const turns = callerTurnsOf(chatCtx);
  if (callerWords && turns[turns.length - 1] !== callerWords) turns.push(callerWords);
  const plan = mentionedPlan(turns);
  return plan ? firstGoodbyeCallback(plan) : FIRST_GOODBYE_WARM;
}
