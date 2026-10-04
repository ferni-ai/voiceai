/**
 * The game types that may be recorded, challenged over or ranked on a
 * leaderboard (social and Musical You), as a closed list.
 *
 * Game types were checked with a pattern (/^[A-Za-z0-9_-]{1,40}$/), which let a
 * client mint any number of them (each a cached board, a stats field and board
 * documents) and accepted "__proto__": stats.gameStats["__proto__"] is
 * Object.prototype, so recording a result under it incremented counters on
 * every object in the process. Only these exist:
 * - the music games, implemented and planned (GameType, FutureGameType in
 *   services/games/types.ts);
 * - the Musical You daily challenge game types not already listed (the
 *   templates in services/musical-you/daily-challenges.ts: name-that-tune,
 *   mood-dj, desert-island).
 * Boards also accept 'overall' (see leaderboard-view), which is not a game.
 *
 * @module services/social/game-types
 */
import type { AllGameTypes } from '../games/types.js';

const MUSIC_GAMES = [
  'name-that-tune',
  'one-word-song',
  'this-or-that',
  'desert-island-discs',
  'mood-dj-challenge',
  'finish-the-lyric',
  'decade-challenge',
  'song-dedication',
  'music-trivia',
] as const satisfies readonly AllGameTypes[];

/** Every AllGameTypes value must be listed (this fails to compile if one is added). */
type Missing = Exclude<AllGameTypes, (typeof MUSIC_GAMES)[number]>;
const everyGameListed: [Missing] extends [never] ? true : Missing = true;
void everyGameListed;

const DAILY_CHALLENGE_GAMES = ['mood-dj', 'desert-island'] as const;

export const GAME_TYPES: ReadonlySet<string> = new Set([...MUSIC_GAMES, ...DAILY_CHALLENGE_GAMES]);

/** A game type that exists. A Set lookup, so "__proto__" and friends are never one. */
export function isValidGameType(gameType: unknown): gameType is string {
  return typeof gameType === 'string' && GAME_TYPES.has(gameType);
}
