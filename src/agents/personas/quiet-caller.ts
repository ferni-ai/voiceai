/**
 * A quiet caller gets room, not advice (QUIET_CALLER=on, off by default).
 *
 * Dev call 2026-10-11: Seth was giving two- and three-word answers. Ferni had
 * just said he was avoiding his electric bill; Seth said "I'm still here." and
 * got "Good, because ignoring those things never actually makes them smaller,
 * it just gives them more room to grow in your head." Nothing in the turn
 * noticed the caller had gone quiet: "I'm still here." read as a share, so the
 * standing CANDOR line ("if a plan looks like a real mistake, say so kindly
 * and say why") and THINK_ALOUD ("work it out aloud") both rode the reply,
 * and with nothing of the caller's to weigh in on, the model weighed in on
 * the bill. Deliberation never ran on that call; the director's note came
 * after the reply.
 *
 * Here the last two things the caller said, both a few words and neither a
 * question, make the turn quiet: no candor or opinion line, no thinking
 * aloud, and one line saying a short easy reaction or a pause is the move.
 * "I'm still here", "I'm listening", "go on", "mm-hm" read as an ack.
 *
 * @module agents/personas/quiet-caller
 */

export function quietCallerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.QUIET_CALLER === 'on';
}

/** At most this many words, for each of the last two caller turns. */
const FEW_WORDS = 5;
const QUESTION =
  /\?|^\W*(?:what|why|how|who|where|when|do|does|did|are|is|can|could|would|will)\b/i;

const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;

/** The caller has gone quiet: their last two turns were a few words each, and the latest asks nothing. */
export function isQuietCaller(callerTurns: string[]): boolean {
  if (callerTurns.length < 2) return false;
  const [prev, last] = callerTurns.slice(-2).map((t) => t.trim());
  return words(prev) <= FEW_WORDS && words(last) <= FEW_WORDS && !QUESTION.test(last);
}

/** "I'm still here", "I'm listening", "go on": they're with him, nothing to answer. */
const PRESENT =
  /^\W*(?:(?:i'?m|i am) (?:still )?(?:here|listening|with you)|still here|go on|go ahead|uh[- ]?huh|mm[- ]?hm+|yeah,? i'?m here)\W*$/i;

export function presentAck(text: string): boolean {
  return PRESENT.test(text.trim());
}

/** The one line a quiet turn carries (turn-shape.ts). */
export const QUIET_LINE =
  "They're saying very little right now: no advice, no lessons or sayings about how life works, no explanations, nothing to fix. A short, easy reaction is the move, or let a small pause sit.";
