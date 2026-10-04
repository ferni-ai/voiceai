/**
 * Bounds for client-reported game results: scores, times and counts.
 *
 * The social and Musical You games are played and scored in the client, and
 * the routes that record results (stats/update, record, challenge create and
 * complete, taste-match answers) stored whatever arrived. NaN, Infinity,
 * negative or 1e308 scores went onto leaderboards and decided challenge
 * winners, and a user could challenge themselves to farm wins. No server game
 * session exists to recompute these scores from, so the server bounds them:
 * every number must be finite and in range, or the route answers 400, and
 * recording results is rate limited (challenge-limits). Server-run games score
 * at most about 750 points a round (services/games/library-game-mode.ts), so
 * MAX_SCORE leaves room for long games.
 *
 * @module api/routes/score-input
 */
import { isValidGameType } from '../../services/social/game-types.js';

export const MAX_SCORE = 100_000;
export const MAX_TIME_MS = 60 * 60 * 1000;
export const MAX_QUESTIONS = 100;
export const MAX_COUNT = 1_000_000;
const CHALLENGE_TYPES: readonly unknown[] = ['score-beat', 'speed-beat', 'taste-match'];

const inRange = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

/** A score: finite, 0 to MAX_SCORE. */
export const isScore = (value: unknown): value is number => inRange(value, MAX_SCORE);

/** An optional duration: absent, or finite and 0 to an hour (ms). */
export const isOptionalTime = (value: unknown): value is number | undefined =>
  value === undefined || inRange(value, MAX_TIME_MS);

/** An optional whole number from 0 to `max`. */
export const isOptionalCount = (value: unknown, max = MAX_COUNT): boolean =>
  value === undefined || (Number.isInteger(value) && inRange(value, max));

/**
 * A Musical You game record: a game type that exists (services/social/
 * game-types; never 'overall', which every result also counts towards), a
 * score in range, optional counts in range.
 */
export function isValidGameRecord(record: {
  gameType?: unknown;
  score?: unknown;
  gamesPlayed?: unknown;
  bestStreak?: unknown;
}): boolean {
  const { gameType, score, gamesPlayed, bestStreak } = record;
  if (!isValidGameType(gameType) || !isScore(score)) return false;
  return isOptionalCount(gamesPlayed) && isOptionalCount(bestStreak);
}

export interface GameResult {
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  timeMs: number;
  usedHints: boolean;
}

/** A social game result with every field present and in range, or null. */
export function gameResultFrom(value: unknown): GameResult | null {
  if (!value || typeof value !== 'object') return null;
  const { score, correctAnswers, totalQuestions, timeMs, usedHints } = value as Record<
    string,
    unknown
  >;
  const questions = Number.isInteger(totalQuestions) && inRange(totalQuestions, MAX_QUESTIONS);
  if (!questions || (totalQuestions as number) < 1) return null;
  if (!Number.isInteger(correctAnswers) || !inRange(correctAnswers, totalQuestions as number)) {
    return null;
  }
  if (!isScore(score) || !inRange(timeMs, MAX_TIME_MS) || typeof usedHints !== 'boolean') {
    return null;
  }
  return { score, correctAnswers, totalQuestions: totalQuestions as number, timeMs, usedHints };
}

/**
 * Whether a new challenge's fields are usable: a game type that exists, a score and
 * time in range, and a challengee who isn't the challenger (self-challenges
 * farmed wins). Social challenges also need a known type and may omit the
 * score (speed-beat); Musical You challenges always carry a score.
 */
export function isValidNewChallenge(
  fields: {
    type?: unknown;
    gameType?: unknown;
    challengeeId?: unknown;
    score?: unknown;
    timeMs?: unknown;
  },
  challengerId: string,
  service: 'social' | 'musical'
): boolean {
  const { type, gameType, challengeeId, score, timeMs } = fields;
  if (service === 'social' && !CHALLENGE_TYPES.includes(type)) return false;
  if (typeof challengeeId !== 'string' || !challengeeId || challengeeId === challengerId) {
    return false;
  }
  if (score === undefined ? service === 'musical' : !isScore(score)) return false;
  return isValidGameType(gameType) && isOptionalTime(timeMs);
}
