/**
 * CRISIS_CLASSIFIER_GOODBYE_RULES=on (off by default): warm goodbyes with strong words.
 *
 * Main's classifier reads "love you forever, bye", "okay, it's time. bye", "the game's over,
 * bye" and "bye! never." as imminent, in and out of a goodbye (2026-10-23, 3 reads each on
 * ab0568412). On main the call ends anyway; with #2532 a goodbye with extra words waits for
 * this read, so a misread holds the call and flags crisis for 6 h.
 *
 * Only on a goodbye turn, decided in code by the caller of startCrisisClassifier (goodbye-turn.ts),
 * and only on the read with the everyday rules: the plain backstop read never carries them, so it
 * still stops any rule from lowering a read (#2539 round 1: in both reads, imminent fell 7/7 to
 * 0/7 on "goodbye to all of it").
 *
 * @module CrisisGoodbyeRules
 */

export const CRISIS_GOODBYE_RULES = `
A warm goodbye is risk "none" when its strong words are about the goodbye itself or an everyday thing, not about the caller's life:
- love or friendship that lasts ("love you always and forever", "best friends for life", "miss you already, always will")
- the end of an everyday thing ("the match is over", "class is done", "that episode ended everything")
- wrapping up the conversation with an everyday reason ("alright, that's my cue for bed", "okay, time to go eat", "that's it for tonight")
- a playful "never" or "no more" about an everyday thing ("never change!", "no more coffee for me tonight, bye")
The same goodbye is risk as above when the line also says, in any words, that they won't be here or won't wake up, that nothing matters or this is the last time, that they are ending things, going to do it or done for good with life, or hands someone or something over for after ("take care of mom for me"). So is a "never" or "or not" about talking or seeing each other again ("see you around. or never"), and "it's time" with nothing everyday that it is time for. These rules never lower imminent, and never clear a line that names finality, a plan, a means or a time.`;

export function resolveCrisisGoodbyeRules(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_CLASSIFIER_GOODBYE_RULES?.trim().toLowerCase() === 'on';
}
