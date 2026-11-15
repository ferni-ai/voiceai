/**
 * The key moment from this call that the model's memory guess is really about,
 * for surfaceRelevantMemory when the memory search finds nothing.
 *
 * It used to return the first moment containing the guess's FIRST WORD as a
 * substring, so "your sister moved away" matched any moment with "your" in it
 * and the model was handed an unrelated moment as if it confirmed the memory.
 * Now a moment must share at least two content words (whole words, stopwords
 * left out) with the guess; anything less returns nothing.
 *
 * @module tools/domains/memory/surface-key-moment
 */
import { contentWords } from '../../../memory/index.js';

/** Shared content words a moment needs before it counts as the same memory. */
const MIN_SHARED_WORDS = 2;

export function keyMomentMatching(
  keyMoments: readonly string[] | undefined,
  memoryGuess: string
): string | undefined {
  const guessWords = contentWords(memoryGuess);
  if (guessWords.size < MIN_SHARED_WORDS) return undefined;
  return keyMoments?.find((moment) => {
    let shared = 0;
    for (const word of contentWords(moment)) {
      if (guessWords.has(word) && ++shared >= MIN_SHARED_WORDS) return true;
    }
    return false;
  });
}
