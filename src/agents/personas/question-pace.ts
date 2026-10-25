/**
 * QUESTION_PACE=on: after a reply that ended on a question, the next reply
 * doesn't. A friend reacts, adds something of their own, or leaves room; an
 * interviewer asks again.
 *
 * Measured on 21 eval calls (2026-10-17, dev and prod, 84 replies): 46% of
 * Ferni's replies ended on a question, against about 6% of utterances in
 * people's conversation (score-targets.json). The turn shape already allows a
 * question on only a quarter of replies (turn-shape.ts questionAllowed), but
 * later lines invite them back (a word about himself "then ask about their
 * world", first-call rapport), so asking runs on. This note goes late in the
 * turn notes, so it wins over those. It steps aside for the once-a-call
 * commitment invite and the journal ask, which are questions by design, and
 * for crisis replies. It also never bars a safety check: no note on a call with
 * crisis risk noted (a later turn the gate passes carries no guidance, so
 * `crisis` alone missed it), nor after a reply with a sentence on safety
 * (isSafetyTopic: safety, harm or help words, or a script sentence word for word).
 *
 * @module agents/personas/question-pace
 */
import { flagOn } from '../../config/env-flag.js';
import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { isSafetyLine, isSafetyTopic } from './phrase-loops.js';

export function questionPaceOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('QUESTION_PACE', env);
}

export const QUESTION_PACE_LINE =
  'Your last reply ended on a question, so this one does not: react, add a thought or something of your own, or just leave room. No question this time.';

/** True when the reply ends on a question mark (closing quotes or brackets aside). */
export function endsOnQuestion(text: string): boolean {
  return /\?["'”’)\]]*\s*$/.test(text.trim());
}

/**
 * The pacing note for this reply, or ''. ferniLines are his replies so far on
 * this call, oldest first. turn-request.ts asks only when neither the invite
 * nor the journal ask speaks this turn.
 */
export function questionPaceNote(
  ferniLines: readonly string[],
  opts: { crisis: boolean; sessionId?: string },
  env: Record<string, string | undefined> = process.env
): string {
  if (!questionPaceOn(env) || opts.crisis) return '';
  if (opts.sessionId && crisisRiskNoted(opts.sessionId)) return '';
  const last = ferniLines[ferniLines.length - 1];
  if (last === undefined || !endsOnQuestion(last)) return '';
  // Held after a safety word or script sentence anywhere, or after a question main's
  // looser check (isSafetyLine) flags; a reaction like "That sounds so heavy." no
  // longer holds it (it did on 26% of real question-ending replies).
  const asks = last.split(/(?<=[.!?])\s+/).filter((s) => endsOnQuestion(s));
  return isSafetyTopic(last) || asks.some(isSafetyLine) ? '' : QUESTION_PACE_LINE;
}
