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

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

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
// XP SYSTEM
// ============================================================================

const XP_CONFIG = {
  // Base XP rewards
  gameComplete: 10,
  correctAnswer: 5,
  perfectGame: 50,
  dailyChallenge: 25,
  winChallenge: 30,
  streak3: 20,
  streak7: 50,
  streak30: 200,

  // Multipliers
  speedBonus: 1.5, // Fast answer
  firstTryBonus: 1.2, // No hints used

  // Level thresholds
  xpPerLevel: 100,
  levelScaling: 1.2, // Each level requires 20% more XP
};

export function calculateLevel(totalXP: number): number {
  let level = 1;
  let xpNeeded = XP_CONFIG.xpPerLevel;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpNeeded) {
    xpRemaining -= xpNeeded;
    level++;
    xpNeeded = Math.floor(xpNeeded * XP_CONFIG.levelScaling);
  }

  return level;
}

export function getXPForNextLevel(totalXP: number): {
  currentXP: number;
  neededXP: number;
  progress: number;
} {
  let xpNeeded = XP_CONFIG.xpPerLevel;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpNeeded) {
    xpRemaining -= xpNeeded;
    xpNeeded = Math.floor(xpNeeded * XP_CONFIG.levelScaling);
  }

  return {
    currentXP: xpRemaining,
    neededXP: xpNeeded,
    progress: Math.round((xpRemaining / xpNeeded) * 100),
  };
}

// ============================================================================
// STORAGE
// ============================================================================

// In-memory stores (would be Firestore in production)
const userStatsStore = new Map<string, UserStats>();
const leaderboardCache = new Map<string, Leaderboard>();

// ============================================================================
// USER STATS
// ============================================================================

/**
 * Get or create user stats
 */
export function getUserStats(userId: string, displayName?: string): UserStats {
  let stats = userStatsStore.get(userId);

  if (!stats) {
    stats = createInitialStats(userId, displayName || 'Player');
    userStatsStore.set(userId, stats);
  }

  return stats;
}

/**
 * Update user stats after a game
 */
export function updateUserStats(
  userId: string,
  gameType: string,
  result: {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    timeMs: number;
    usedHints: boolean;
  }
): UserStats {
  const stats = getUserStats(userId);
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

  userStatsStore.set(userId, stats);
  log.debug({ userId, gameType, xpEarned, newLevel: stats.level }, '📊 Stats updated');

  return stats;
}

/**
 * Record a challenge result
 */
export function recordChallengeResult(userId: string, won: boolean): void {
  const stats = getUserStats(userId);

  if (won) {
    stats.challengesWon++;
    stats.totalXP += XP_CONFIG.winChallenge;
    stats.level = calculateLevel(stats.totalXP);
  } else {
    stats.challengesLost++;
  }

  stats.updatedAt = new Date();
  userStatsStore.set(userId, stats);
}

// ============================================================================
// LEADERBOARDS
// ============================================================================

/**
 * Get a leaderboard
 */
export function getLeaderboard(
  period: LeaderboardPeriod,
  gameType: string | 'overall' = 'overall',
  scope: LeaderboardScope = 'global',
  currentUserId?: string,
  friendIds?: string[]
): Leaderboard {
  const cacheKey = `${period}_${gameType}_${scope}`;
  const cached = leaderboardCache.get(cacheKey);

  // Return cached if fresh (less than 5 minutes old)
  if (cached && Date.now() - cached.lastUpdated.getTime() < 5 * 60 * 1000) {
    // Add current user flag
    if (currentUserId) {
      cached.entries = cached.entries.map((e) => ({
        ...e,
        isCurrentUser: e.userId === currentUserId,
      }));
    }
    return cached;
  }

  // Build leaderboard
  const { start, end } = getPeriodDates(period);
  let entries: LeaderboardEntry[] = [];

  // Get all user stats
  for (const stats of userStatsStore.values()) {
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
      const gameStats = stats.gameStats[gameType];
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

  leaderboardCache.set(cacheKey, leaderboard);
  return leaderboard;
}

/**
 * Get user's rank on a leaderboard
 */
export function getUserRank(
  userId: string,
  period: LeaderboardPeriod = 'weekly',
  gameType: string | 'overall' = 'overall'
): { rank: number; totalUsers: number } | null {
  const leaderboard = getLeaderboard(period, gameType);
  const entry = leaderboard.entries.find((e) => e.userId === userId);

  if (!entry) {
    return { rank: leaderboard.entries.length + 1, totalUsers: leaderboard.entries.length };
  }

  return { rank: entry.rank, totalUsers: leaderboard.entries.length };
}

/**
 * Get leaderboard around a specific user
 */
export function getLeaderboardAroundUser(
  userId: string,
  period: LeaderboardPeriod = 'weekly',
  gameType: string | 'overall' = 'overall',
  contextSize: number = 3
): LeaderboardEntry[] {
  const leaderboard = getLeaderboard(period, gameType, 'global', userId);
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

function createInitialStats(userId: string, displayName: string): UserStats {
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

function getPeriodDates(period: LeaderboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      break;

    case 'weekly':
      // Start of week (Monday)
      const dayOfWeek = now.getDay() || 7; // Make Sunday = 7
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;

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

// ============================================================================
// SEED DATA (for testing)
// ============================================================================

/**
 * Seed leaderboard with test data
 */
export function seedLeaderboardData(): void {
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
    const stats: UserStats = {
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

    userStatsStore.set(user.id, stats);
  }

  log.info('🏆 Seeded leaderboard with test data');
}
