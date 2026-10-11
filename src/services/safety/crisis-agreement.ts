/**
 * Crisis agreement gate (CRISIS_AGREEMENT_GATE=on, off by default).
 *
 * One caller turn reaches the classifier from two places: the reply's crisis
 * gate and the background turn pipeline. When their inputs differ, each makes
 * its own call. Prod call 2026-10-11: the caller answered Ferni's "You still
 * there?" with a plain "still here"; the gate's read (which saw that question)
 * was none, the pipeline's (which saw no context) was crisis, and the
 * pipeline's crisis guidance reached the next reply, which recited the 988
 * line to someone who had only said he was there.
 *
 * With the gate on, when no pattern matched and the reads of the same turn
 * disagree, the turn gets a soft, context-aware check instead of crisis
 * guidance; a bare reply to a presence check counts as presence. A pattern
 * match, an imminent read, and agreeing or lone reads are never touched.
 *
 * @module CrisisAgreement
 */

import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';

export function resolveCrisisAgreementGate(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_AGREEMENT_GATE?.trim().toLowerCase() === 'on';
}

/** escalate: crisis handling as before; soft: a gentle check-in; presence: nothing. */
export type AgreementOutcome = 'escalate' | 'soft' | 'presence';

const words = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Ferni asking whether the caller is still on the line. */
const PRESENCE_CHECK =
  /\b(?:(?:you|u) still (?:there|with me|on)|are you there|you there|(?:did i|i) lose you|lost you|can you hear me|still on the line)\b/;

/**
 * The whole message says only that the caller is here: "still here", "yeah,
 * I'm still here", "and I'm here". Anything more ("I'm still here, barely")
 * is not a bare presence reply.
 */
const PRESENCE_REPLY =
  /^(?:(?:and|yeah|yep|yes|yup|yea|uh|um|oh|ok|okay|sorry|mhm|hey) )*(?:(?:i'm|im|i am) )?(?:still )?here(?: still)?(?: (?:yeah|yep|sorry))?$/;

/** A bare "I'm still here" answering Ferni's "you still there?". */
export function isPresenceReply(latest: string, companion?: string): boolean {
  if (!companion || !PRESENCE_CHECK.test(words(companion))) return false;
  return PRESENCE_REPLY.test(words(latest));
}

/**
 * How a turn's classifier reads combine with the pattern outcome. Only a turn
 * the patterns passed, with no imminent read, can be softened.
 */
export function agreementOutcome(args: {
  pattern: PatternOutcome;
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  companion?: string;
}): AgreementOutcome {
  const { pattern, latest, companion } = args;
  if (pattern !== 'none') return 'escalate';
  const reads = args.verdicts.filter((v): v is CrisisVerdict => v !== null);
  if (reads.some((v) => v.risk === 'imminent')) return 'escalate';
  if (!reads.some((v) => v.risk === 'crisis')) return 'escalate';
  if (isPresenceReply(latest, companion)) return 'presence';
  return reads.some((v) => v.risk === 'none') ? 'soft' : 'escalate';
}

/** The guidance for a soft check: stay in the conversation, check in only if it fits. */
export const SOFT_CRISIS_CHECK = `[SAFETY - SOFT CHECK]
One safety read of the caller's last words was unsure whether something heavier is going on; another read of the same words found nothing. No crisis language was said.
Read their words in the context of the conversation:
1. Stay in the conversation you were having; do not switch to crisis talk or mention hotlines on this alone
2. If their words or tone suggest they might be struggling, check in once, plainly and warmly ("you doing okay?"), and follow their lead
3. If they say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;
