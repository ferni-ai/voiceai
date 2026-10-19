/**
 * What the caller said, read for the game on the call (call-game-state.ts):
 * a clear "let's stop" ends it, and a run of turns with no game in them lets
 * it lapse. Whole words only, never substrings ("stopwatch" is not "stop").
 *
 * @module services/games/game-stop-words
 */

/** Stop or switch, wherever it comes in what they said. */
const STOP_ANYWHERE: readonly RegExp[] = [
  /\blet'?s stop\b/,
  /\blet us stop\b/,
  /\bcan we stop\b/,
  /\bstop (?:playing|the game|this game)\b/,
  /\b(?:end|quit) (?:the|this) game\b/,
  /\bi quit\b/,
  /\bno more games?\b/,
  /\blet'?s (?:do|play|talk about) something else\b/,
];

/** Stop words that count only when they are all the caller said ("that's it" can confirm a guess). */
const STOP_ALONE = new Set([
  'stop',
  'done',
  "i'm done",
  'im done',
  'i am done',
  "we're done",
  'were done',
  'enough',
  "that's enough",
  'thats enough',
  "that's it",
  'thats it',
]);

/** Words around a short stop that don't change it ("okay, I'm done for now"). */
const FILLER =
  /\b(?:ok|okay|alright|all right|yeah|yep|well|so|um|uh|hmm|fine|please|thanks|thank you|for now|honestly|actually|now|then|ferni)\b/g;

/** Lower case, curly apostrophes made straight, punctuation dropped, spaces single. */
export function normalizeHeard(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the caller clearly wants to stop the game or switch to something else. */
export function isClearStop(said: string): boolean {
  const heard = normalizeHeard(said);
  if (!heard) return false;
  if (STOP_ANYWHERE.some((re) => re.test(heard))) return true;
  const core = heard.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return STOP_ALONE.has(core);
}

const GAME_WORDS =
  /\b(?:game|games|play|playing|turn|score|scores|point|points|guess|guessed|answer|question|questions|round|riddle|trivia|hint|clue|pass|skip|rather|win|winning|won|lose|lost|correct|wrong)\b/;

/** True when what they said sounds like part of a game. */
export function hasGameWords(said: string): boolean {
  return GAME_WORDS.test(normalizeHeard(said));
}
