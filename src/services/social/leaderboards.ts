/**
 * 🏆 Leaderboard Service
 *
 * Track and display rankings for music games.
 *
 * Leaderboard Types:
 * - Weekly: Resets every Monday
 * - Monthly: Resets on the 1st
 * - All-Time: Persistent
 *
 * Features:
 * - Per-game leaderboards
 * - Overall score leaderboards
 * - Friend-only leaderboards
 * - XP-based progression
 */

import { isValidGameType } from './game-types.js';
import { deleteUserStats, ownGameStats, topUserStats } from './user-stats.js';

// Stats and XP live in ./user-stats.ts and ./xp.ts (shared by every API instance).
export {
  getUserStats,
  updateUserStats,
  recordChallengeResult,
  seedLeaderboardData,
  isValidGameType,
  deleteUserStats,
} from './user-stats.js';
export { calculateLevel, getXPForNextLevel } from './xp.js';

// ============================================================================
// TYPES
// ============================================================================

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';
export type LeaderboardScope = 'global' | 'friends';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  score: number;
  gamesPlayed: number;
  winRate: number; // 0-100
  currentStreak: number;
  rank: number;
  previousRank?: number; // For showing movement
  isCurrentUser?: boolean;
}

export interface Leaderboard {
  id: string;
  period: LeaderboardPeriod;
  scope: LeaderboardScope;
  gameType: string | 'overall';
  entries: LeaderboardEntry[];
  lastUpdated: Date;
  periodStart: Date;
  periodEnd: Date;
}

export interface UserStats {
  userId: string;
  displayName: string;

  // Overall stats
  totalGamesPlayed: number;
  totalScore: number;
  totalXP: number;
  level: number;

  // Game-specific stats
  gameStats: Record<string, GameStats>;

  // Streaks
  currentStreak: number;
  longestStreak: number;
  lastPlayedAt: Date | null;

  // Rankings
  globalRank?: number;
  weeklyRank?: number;

  // Achievements
  challengesWon: number;
  challengesLost: number;
  perfectGames: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface GameStats {
  gameType: string;
  gamesPlayed: number;
  totalScore: number;
  highScore: number;
  averageScore: number;
  fastestTimeMs?: number;
  accuracy: number; // 0-100
  lastPlayedAt: Date | null;
}

// ============================================================================
// LEADERBOARDS
// ============================================================================

/** How many top scorers a leaderboard reads; it shows up to 100 of them. */
const TOP_READ = 100;
/** Each instance reuses a leaderboard for this long, then reads the store again. */
const CACHE_MS = 30_000;
/**
 * At most this many cached boards per instance (oldest dropped first). Keys
 * are period, game type and scope, all from closed lists, so this is a
 * backstop rather than the bound.
 */
const CACHE_MAX = 200;
const leaderboardCache = new Map<string, Leaderboard>();

/** How many boards this instance has cached (for tests). */
export function cachedLeaderboardCount(): number {
  return leaderboardCache.size;
}

/**
 * Get a leaderboard, built from the shared stats store (cached CACHE_MS per instance)
 */
export async function getLeaderboard(
  period: LeaderboardPeriod,
  gameType: string | 'overall' = 'overall',
  scope: LeaderboardScope = 'global',
  currentUserId?: string,
  friendIds?: string[]
): Promise<Leaderboard> {
  if (gameType !== 'overall' && !isValidGameType(gameType)) {
    throw new Error(`Unknown game type: ${gameType}`); // routes answer 400 before this
  }
  const cacheKey = `${period}_${gameType}_${scope}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && Date.now() - cached.lastUpdated.getTime() < CACHE_MS) {
    return {
      ...cached,
      entries: cached.entries.map((e) => ({ ...e, isCurrentUser: e.userId === currentUserId })),
    };
  }

  // Build leaderboard
  const { start, end } = getPeriodDates(period);
  let entries: LeaderboardEntry[] = [];

  // The highest scorers from the shared store (bounded: TOP_READ records)
  const field = gameType === 'overall' ? 'totalScore' : `gameStats.${gameType}.totalScore`;
  for (const stats of await topUserStats(field, TOP_READ)) {
    // Filter by scope
    if (scope === 'friends' && friendIds) {
      if (!friendIds.includes(stats.userId) && stats.userId !== currentUserId) {
        continue;
      }
    }

    // Calculate score for this period
    let score: number;
    let gamesPlayed: number;
    let winRate: number;

    if (gameType === 'overall') {
      score = stats.totalScore;
      gamesPlayed = stats.totalGamesPlayed;
      winRate =
        stats.challengesWon + stats.challengesLost > 0
          ? Math.round((stats.challengesWon / (stats.challengesWon + stats.challengesLost)) * 100)
          : 0;
    } else {
      const gameStats = ownGameStats(stats, gameType);
      if (!gameStats) continue;
      score = gameStats.totalScore;
      gamesPlayed = gameStats.gamesPlayed;
      winRate = gameStats.accuracy;
    }

    // Filter by period (simplified - would use actual timestamps in production)
    if (period !== 'all-time' && stats.lastPlayedAt) {
      if (stats.lastPlayedAt < start) continue;
    }

    entries.push({
      userId: stats.userId,
      displayName: stats.displayName,
      score,
      gamesPlayed,
      winRate,
      currentStreak: stats.currentStreak,
      rank: 0, // Will be set after sorting
      isCurrentUser: stats.userId === currentUserId,
    });
  }

  // Sort by score (descending)
  entries.sort((a, b) => b.score - a.score);

  // Assign ranks
  entries = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  // Limit to top 100
  entries = entries.slice(0, 100);

  const leaderboard: Leaderboard = {
    id: cacheKey,
    period,
    scope,
    gameType,
    entries,
    lastUpdated: new Date(),
    periodStart: start,
    periodEnd: end,
  };

  leaderboardCache.delete(cacheKey); // re-inserted last, so the oldest is first to go
  leaderboardCache.set(cacheKey, leaderboard);
  for (const key of leaderboardCache.keys()) {
    if (leaderboardCache.size <= CACHE_MAX) break;
    leaderboardCache.delete(key);
  }
  return leaderboard;
}

/**
 * Account deletion: remove the user's stats and this instance's cached boards
 * (which may list them). Other instances rebuild theirs within CACHE_MS.
 */
export async function eraseSocialStatsFor(userId: string): Promise<void> {
  await deleteUserStats(userId);
  leaderboardCache.clear();
}

/**
 * Get user's rank on a leaderboard (among the top TOP_READ; beyond that, last + 1)
 */
export async function getUserRank(
  userId: string,
  period: LeaderboardPeriod = 'weekly',
  gameType: string | 'overall' = 'overall'
): Promise<{ rank: number; totalUsers: number } | null> {
  const leaderboard = await getLeaderboard(period, gameType);
  const entry = leaderboard.entries.find((e) => e.userId === userId);
  if (!entry) {
    return { rank: leaderboard.entries.length + 1, totalUsers: leaderboard.entries.length };
  }
  return { rank: entry.rank, totalUsers: leaderboard.entries.length };
}

/**
 * Get leaderboard around a specific user
 */
export async function getLeaderboardAroundUser(
  userId: string,
  period: LeaderboardPeriod = 'weekly',
  gameType: string | 'overall' = 'overall',
  contextSize = 3
): Promise<LeaderboardEntry[]> {
  const leaderboard = await getLeaderboard(period, gameType, 'global', userId);
  const userIndex = leaderboard.entries.findIndex((e) => e.userId === userId);
  if (userIndex === -1) {
    // User not on leaderboard - return top entries
    return leaderboard.entries.slice(0, contextSize * 2 + 1);
  }
  const start = Math.max(0, userIndex - contextSize);
  const end = Math.min(leaderboard.entries.length, userIndex + contextSize + 1);
  return leaderboard.entries.slice(start, end);
}

// ============================================================================
// HELPERS
// ============================================================================

function getPeriodDates(period: LeaderboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      break;

    case 'weekly': {
      // Start of week (Monday)
      const dayOfWeek = now.getDay() || 7; // Make Sunday = 7
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    }

    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;

    case 'all-time':
    default:
      start = new Date(0);
      end = new Date(now.getFullYear() + 100, 0, 1);
      break;
  }

  return { start, end };
}
