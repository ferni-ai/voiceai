/**
 * Mirroring grammar guard
 *
 * Linguistic mirroring rewrites Ferni's TTS text for a casual caller. Two of
 * its swaps broke English on prod calls (2026-10-19, #2232):
 * - every whole-word "no" became "nah": "nah more", "nah need", "nah kids";
 * - "you are" / "it is" / "that is" were contracted at the end of a clause:
 *   "I'm ready when you're.", "Big Papa it's.", "what that's."
 *
 * With MIRROR_GRAMMAR_GUARD=on, "no" becomes "nah" only when it stands alone
 * as a reply. Off (the default), every "no" does; it also lets a clause-final
 * negation contract ("I don't."). Contractions come from utils/spoken-contractions.ts:
 * the wider `contractBroadly`, or with MIRROR_SHARED_CONTRACTIONS=on the director's
 * stricter rule. Neither contracts a clause-final or stranded auxiliary.
 *
 * @module @ferni/superhuman/mirroring-grammar
 */

/** MIRROR_SHARED_CONTRACTIONS, read from env; off unless set to 'on'. */
export function mirrorSharedContractionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_SHARED_CONTRACTIONS === 'on';
}

/** MIRROR_GRAMMAR_GUARD, read from env; off unless set to 'on'. */
export function mirrorGrammarGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_GRAMMAR_GUARD === 'on';
}

/**
 * The pattern for a "no" to say as "nah". Guarded, only a standalone reply
 * qualifies: at the start of the text or a sentence, and followed by
 * punctuation or the end ("No, I'm good." / "No."), never "no more".
 */
export function noToNahPattern(guard = mirrorGrammarGuardEnabled()): RegExp {
  return guard ? /(?<=^\s*|[.!?]\s+)\bno\b(?=\s*(?:[,.!?]|$))/gi : /\bno\b(?!\w)/gi;
}
