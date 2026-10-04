/**
 * Silence handling in character mode (promptMode() === 'character').
 *
 * @module voice-agent/character-silence
 */

import {
  getLLMSilenceInstructions,
  type LLMSilenceInstructions,
  type SilenceContext,
} from '../../personas/meaningful-silence.js';
import type { PersonaConfig } from '../../personas/types.js';

/**
 * What Ferni is told when the caller has gone quiet (character mode). Plain,
 * in the character's terms, and it may come to nothing.
 */
const CHARACTER_SILENCE_NOTE =
  "[They've been quiet for a bit. If there's something small and natural to say, the way a friend on the phone would, say it in one short sentence. Don't ask how they feel, don't check they're still there, don't sum up.]";

/**
 * LLM-driven instructions for a natural, contextual silence response.
 *
 * In character mode: a plain note and no canned fallback. The fallback
 * assembled template lines ("How did that feel?", "I noticed you paused
 * there.") and was spoken whenever the model call failed; staying quiet is
 * more human than a scripted line.
 */
export function silenceResponseInstructions(
  persona: PersonaConfig,
  context: SilenceContext,
  characterSilence: boolean
): LLMSilenceInstructions {
  const templateInstructions = getLLMSilenceInstructions(persona, context);
  return characterSilence
    ? { ...templateInstructions, instructions: CHARACTER_SILENCE_NOTE, fallback: '' }
    : templateInstructions;
}
