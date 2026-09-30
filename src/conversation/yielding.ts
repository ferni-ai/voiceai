/**
 * Being interrupted gracefully.
 *
 * When someone cuts in, a good listener drops their point and answers what
 * was just said: no restarting the sentence, no "as I was saying". But a
 * quick "yeah" or "mm-hm" that happened to land on top of them is not the
 * other person taking the floor, and a friend just carries on. This reads
 * which it was, from the reply that was cut off and what the caller said.
 *
 * Pure: classification and wording.
 *
 * @module conversation/yielding
 */

/**
 * A listening noise, not a turn: "mm-hm", "yeah", "uh-huh", "go on". Not
 * "yes", "sure" or "okay": cutting in with those is often an answer.
 */
const BACKCHANNEL =
  /^\s*(yeah|mm+[- ]?hm+|mhm|uh[- ]?huh|go on|i see)([ ,.!]+(yeah|mm+[- ]?hm+|mhm|uh[- ]?huh|go on|right))*[ .!]*$/i;

export const YIELD_CUE = [
  '[THEY CUT IN]',
  'They spoke over your last reply, so they did not hear the end of it.',
  'Drop that point and answer what they just said. Do not restart it or say "as I was saying"; if it truly matters, fit it in later, briefly.',
].join('\n');

export const CARRY_ON_CUE = [
  '[THEY ONLY SAID A QUICK WORD]',
  'Your last reply was cut off by a listening noise, not a new turn.',
  'Pick your point back up in a few words, without repeating what you already said.',
].join('\n');

/** The cue for the reply after an interruption, or null when there was none. */
export function yieldingCue(
  agentWasInterrupted: boolean | undefined,
  userText: string | undefined
): string | null {
  if (!agentWasInterrupted || !userText?.trim()) return null;
  return BACKCHANNEL.test(userText) ? CARRY_ON_CUE : YIELD_CUE;
}
