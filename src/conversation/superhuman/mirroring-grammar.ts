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
 * as a reply, and a pair is contracted only when another word follows it in
 * the same chunk. Off (the default), the patterns are the old ones. With
 * MIRROR_SHARED_CONTRACTIONS=on, contractions come from utils/spoken-contractions.ts
 * instead, which never contracts a clause-final or stranded pair.
 *
 * @module @ferni/superhuman/mirroring-grammar
 */

import { contractForSpeech } from '../../utils/spoken-contractions.js';
import type { MirroringApplication } from './types.js';

/** MIRROR_SHARED_CONTRACTIONS, read from env; off unless set to 'on'. */
function mirrorSharedContractionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_SHARED_CONTRACTIONS === 'on';
}

/** MIRROR_GRAMMAR_GUARD, read from env; off unless set to 'on'. */
export function mirrorGrammarGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_GRAMMAR_GUARD === 'on';
}

/**
 * TODO(#2347, 2026-10-29, owner: voice): legacy, for mirroring with MIRROR_SHARED_CONTRACTIONS
 * off; delete with the flag's promotion.
 *
 * The pattern for an expanded pair ("you are") to contract. Guarded, it needs
 * a following word in the chunk, so a clause-final "you are." stays as it is.
 */
export function contractionPattern(expanded: string, guard = mirrorGrammarGuardEnabled()): RegExp {
  return guard
    ? new RegExp(`\\b${expanded}\\b(?=\\s+[a-z])`, 'gi')
    : new RegExp(`\\b${expanded}\\b`, 'gi');
}

/**
 * The pattern for a "no" to say as "nah". Guarded, only a standalone reply
 * qualifies: at the start of the text or a sentence, and followed by
 * punctuation or the end ("No, I'm good." / "No."), never "no more".
 */
export function noToNahPattern(guard = mirrorGrammarGuardEnabled()): RegExp {
  return guard ? /(?<=^\s*|[.!?]\s+)\bno\b(?=\s*(?:[,.!?]|$))/gi : /\bno\b(?!\w)/gi;
}

/**
 * Mirroring's contractions for a caller who uses them. `before`: the reply so far.
 * MIRROR_SHARED_CONTRACTIONS=on: the shared rule (utils/spoken-contractions.ts) in its
 * mirroring mode. Off: main's code, unchanged (moved here from linguistic-mirroring.ts).
 */
export function mirrorContractions(
  text: string,
  usesContractions: boolean,
  before?: string
): { text: string; applications: MirroringApplication[] } {
  if (mirrorSharedContractionsEnabled()) return sharedContractions(text, usesContractions, before);

  // TODO(#2347, 2026-10-29, owner: voice): the legacy flag-off path, main's code verbatim.
  // Delete it and contractionPattern when MIRROR_SHARED_CONTRACTIONS is promoted, leaving
  // one contraction rule (utils/spoken-contractions.ts).
  let result = text;
  const applications: MirroringApplication[] = [];

  const contractionMap: Record<string, string> = {
    'I am': "I'm",
    'you are': "you're",
    'we are': "we're",
    'they are': "they're",
    'is not': "isn't",
    'are not': "aren't",
    'will not': "won't",
    'can not': "can't",
    'do not': "don't",
    'did not': "didn't",
    'could not': "couldn't",
    'would not': "wouldn't",
    'should not': "shouldn't",
    'it is': "it's",
    'that is': "that's",
    'there is': "there's",
    'here is': "here's",
  };

  if (usesContractions) {
    // User uses contractions - contract our response
    for (const [expanded, contracted] of Object.entries(contractionMap)) {
      const regex = contractionPattern(expanded);
      if (regex.test(result)) {
        const original = result;
        // Keep a capital at the start of a sentence: "It is" becomes "It's", not "it's".
        result = result.replace(regex, (m) =>
          m[0] === m[0].toUpperCase()
            ? contracted[0].toUpperCase() + contracted.slice(1)
            : contracted
        );
        if (result !== original) {
          applications.push({
            type: 'formality',
            original: expanded,
            mirrored: contracted,
          });
        }
      }
    }
  }
  // A caller who says "I am" still hears contractions: never expand ours. Expanding made
  // every persona stilted after one such line ("I am Jordan . it is really cool", prod
  // 2026-10-17), against the prompt's "always use contractions".

  return { text: result, applications };
}

function sharedContractions(
  text: string,
  usesContractions: boolean,
  before: string | undefined
): { text: string; applications: MirroringApplication[] } {
  const applications: MirroringApplication[] = [];
  // A caller who says "I am" still hears contractions: never expand ours.
  if (!usesContractions) return { text, applications };
  const result = contractForSpeech(
    text,
    before,
    (original, mirrored) => {
      if (!applications.some((a) => a.original === original)) {
        applications.push({ type: 'formality', original, mirrored });
      }
    },
    'mirroring'
  );
  return { text: result, applications };
}
