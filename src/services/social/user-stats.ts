/**
 * Social game stats per user, shared by every API instance.
 *
 * Stats lived in a Map in each process, so every Cloud Run instance kept its
 * own leaderboard and a game recorded on one instance didn't count on another.
 * Each user's stats are now one record (social_user_stats/<uid>, see
 * shared-records); every change is a transaction, so results recorded at once
 * on two instances both count. Only users who recorded a game or finished a
 * challenge have a record: reading stats never creates one. Records are
 * long-lived (no ttlAt); account deletion removes them.
 *
 * Moved out of leaderboards.ts, which re-exports these functions.
 *
 * @module services/social/user-stats
 */
import { getLogger } from '../../utils/safe-logger.js';
import { sharedRecords } from './shared-records.js';
import { calculateLevel, XP_CONFIG } from './xp.js';
import type { GameStats, UserStats } from './leaderboards.js';

const log = getLogger();

// ============================================================================
// STORAGE
// ============================================================================

const stats = sharedRecords<UserStats>('social_user_stats', {
  dateFields: ['lastPlayedAt', 'createdAt', 'updatedAt'],
});

/** Game types become Firestore field paths (gameStats.<type>), so keep them plain. */
export function isValidGameType(gameType: unknown): gameType is string {
  return typeof gameType === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(gameType);
}

/** Nested dates come back from the store as strings. */
function revive(record: UserStats): UserStats {
  const gameStats: Record<string, GameStats> = {};
  for (const [type, g] of Object.entries(record.gameStats ?? {})) {
    gameStats[type] = { ...g, lastPlayedAt: g.lastPlayedAt ? new Date(g.lastPlayedAt) : null };
  }
  return { ...record, gameStats };
}

export function createInitialStats(userId: string, displayName: string): UserStats {
  const now = new Date();
  return {
    userId,
    displayName,
    totalGamesPlayed: 0,
    totalScore: 0,
    totalXP: 0,
    level: 1,
    gameStats: {},
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedAt: null,
    challengesWon: 0,
    challengesLost: 0,
    perfectGames: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// USER STATS
// ============================================================================

/**
 * A user's stats, or fresh (unsaved) stats when they have none yet
 */
export async function getUserStats(userId: string, displayName?: string): Promise<UserStats> {
  const record = await stats.get(userId);
  return record ? revive(record) : createInitialStats(userId, displayName || 'Player');
}

/** One game result applied to a copy of `current` (pure: transactions may retry it). */
function applyGameResult(
  current: UserStats,
  gameType: string,
  result: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    timeMs: number;
    usedHints: boolean;
  }
): { stats: UserStats; xpEarned: number } {
  const stats = structuredClone(revive(current));
  const now = new Date();

  // Update overall stats
  stats.totalGamesPlayed++;
  stats.totalScore += result.score;

  // Calculate XP earned
  let xpEarned = XP_CONFIG.gameComplete;
  xpEarned += result.correctAnswers * XP_CONFIG.correctAnswer;

  const isPerfect = result.correctAnswers === result.totalQuestions;
  if (isPerfect) {
    xpEarned += XP_CONFIG.perfectGame;
    stats.perfectGames++;
  }

  if (!result.usedHints) {
    xpEarned = Math.floor(xpEarned * XP_CONFIG.firstTryBonus);
  }

  // Update streak
  const lastPlayed = stats.lastPlayedAt;
  if (lastPlayed) {
    const hoursSinceLast = (now.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast > 48) {
      // Streak broken
      stats.currentStreak = 1;
    } else if (hoursSinceLast > 20) {
      // New day, increment streak
      stats.currentStreak++;
    }
    // else same day, don't change streak
  } else {
    stats.currentStreak = 1;
  }

  // Streak bonuses
  if (stats.currentStreak >= 3 && stats.currentStreak % 3 === 0) {
    xpEarned += XP_CONFIG.streak3;
  }
  if (stats.currentStreak === 7) {
    xpEarned += XP_CONFIG.streak7;
  }
  if (stats.currentStreak === 30) {
    xpEarned += XP_CONFIG.streak30;
  }

  stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  stats.totalXP += xpEarned;
  stats.level = calculateLevel(stats.totalXP);
  stats.lastPlayedAt = now;
  stats.updatedAt = now;

  // Update game-specific stats
  if (!stats.gameStats[gameType]) {
    stats.gameStats[gameType] = {
      gameType,
      gamesPlayed: 0,
      totalScore: 0,
      highScore: 0,
      averageScore: 0,
      accuracy: 0,
      lastPlayedAt: null,
    };
  }

  const gameStats = stats.gameStats[gameType];
  gameStats.gamesPlayed++;
  gameStats.totalScore += result.score;
  gameStats.highScore = Math.max(gameStats.highScore, result.score);
  gameStats.averageScore = Math.round(gameStats.totalScore / gameStats.gamesPlayed);
  gameStats.accuracy = Math.round(
    (gameStats.accuracy * (gameStats.gamesPlayed - 1) +
      (result.correctAnswers / result.totalQuestions) * 100) /
      gameStats.gamesPlayed
  );
  if (result.timeMs) {
    gameStats.fastestTimeMs = gameStats.fastestTimeMs
      ? Math.min(gameStats.fastestTimeMs, result.timeMs)
      : result.timeMs;
  }
  gameStats.lastPlayedAt = now;

  return { stats, xpEarned };
}

/**
 * Update user stats after a game (atomically, so concurrent results all count)
 */
export async function updateUserStats(
  userId: string,
  gameType: string,
  result: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    timeMs: number;
    usedHints: boolean;
  }
): Promise<UserStats> {
  let xpEarned = 0;
  const updated = await stats.upsert(userId, (current) => {
    const applied = applyGameResult(
      current ?? createInitialStats(userId, 'Player'),
      gameType,
      result
    );
    xpEarned = applied.xpEarned;
    return applied.stats;
  });
  const saved = revive(updated as UserStats);
  log.debug({ userId, gameType, xpEarned, newLevel: saved.level }, '📊 Stats updated');
  return saved;
}

/**
 * Record a challenge result (atomically)
 */
export async function recordChallengeResult(userId: string, won: boolean): Promise<void> {
  await stats.upsert(userId, (current) => {
    const next = structuredClone(revive(current ?? createInitialStats(userId, 'Player')));
    if (won) {
      next.challengesWon++;
      next.totalXP += XP_CONFIG.winChallenge;
      next.level = calculateLevel(next.totalXP);
    } else {
      next.challengesLost++;
    }
    next.updatedAt = new Date();
    return next;
  });
}

/** The `limit` users with the highest `field` (e.g. totalScore), highest first. */
export async function topUserStats(field: string, limit: number): Promise<UserStats[]> {
  return (await stats.top(field, limit)).map(revive);
}

/** Account deletion: remove the user's stats (they leave every leaderboard). */
export async function deleteUserStats(userId: string): Promise<void> {
  await stats.remove(userId);
}

/**
 * Fill the leaderboard with ten made-up players. Development only: on Cloud Run
 * it would put fake players on the real leaderboard, so it refuses there.
 */
export async function seedLeaderboardData(): Promise<void> {
  if (process.env.K_SERVICE) throw new Error('Leaderboard seeding is for development only');
  const testUsers = [
    { id: 'user-1', name: 'MusicMaster99', score: 2450, games: 45 },
    { id: 'user-2', name: 'TuneTitan', score: 2380, games: 42 },
    { id: 'user-3', name: 'MelodyQueen', score: 2290, games: 38 },
    { id: 'user-4', name: 'BeatDropper', score: 2100, games: 35 },
    { id: 'user-5', name: 'RhythmRider', score: 1950, games: 32 },
    { id: 'user-6', name: 'VinylVince', score: 1820, games: 30 },
    { id: 'user-7', name: 'NoteNinja', score: 1700, games: 28 },
    { id: 'user-8', name: 'SoundSage', score: 1580, games: 25 },
    { id: 'user-9', name: 'GrooveGuru', score: 1450, games: 22 },
    { id: 'user-10', name: 'AudioAce', score: 1320, games: 20 },
  ];

  for (const user of testUsers) {
    const seeded: UserStats = {
      userId: user.id,
      displayName: user.name,
      totalGamesPlayed: user.games,
      totalScore: user.score,
      totalXP: user.score * 2,
      level: calculateLevel(user.score * 2),
      gameStats: {
        'name-that-tune': {
          gameType: 'name-that-tune',
          gamesPlayed: Math.floor(user.games * 0.6),
          totalScore: Math.floor(user.score * 0.6),
          highScore: Math.floor(user.score * 0.3),
          averageScore: Math.floor(user.score / user.games),
          accuracy: 70 + Math.floor(Math.random() * 25),
          lastPlayedAt: new Date(),
        },
      },
      currentStreak: Math.floor(Math.random() * 10) + 1,
      longestStreak: Math.floor(Math.random() * 20) + 5,
      lastPlayedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      challengesWon: Math.floor(Math.random() * 15),
      challengesLost: Math.floor(Math.random() * 10),
      perfectGames: Math.floor(Math.random() * 5),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    };

    await stats.put(user.id, seeded);
  }

  log.info('🏆 Seeded leaderboard with test data');
}
