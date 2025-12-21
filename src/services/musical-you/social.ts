/**
 * 🤝 Musical You Social Features
 *
 * Friend challenges, leaderboards, and taste matching:
 * - Send and accept challenges
 * - Track leaderboards
 * - Calculate taste match between users
 *
 * @module MusicalYouSocial
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  MusicChallenge,
  Leaderboard,
  LeaderboardEntry,
  TasteMatch,
} from './types.js';
import type { GameMemory } from '../../types/user-profile.js';

const log = createLogger({ module: 'MusicalYouSocial' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const challenges = new Map<string, MusicChallenge>();
const leaderboards = new Map<string, Leaderboard>();
const tasteMatches = new Map<string, TasteMatch>();

// ============================================================================
// CHALLENGES
// ============================================================================

/**
 * Send a music challenge to a friend
 */
export function sendChallenge(
  challengerId: string,
  challengerName: string,
  challengeeId: string,
  gameType: string,
  challengerScore: number,
  challengerTime?: number
): MusicChallenge {
  const challengeId = `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const challenge: MusicChallenge = {
    id: challengeId,
    type: 'score-beat',
    gameType,
    challengerId,
    challengerName,
    challengerScore,
    challengerTime,
    challengeeId,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };

  challenges.set(challengeId, challenge);

  log.info(
    { challengeId, challengerId, challengeeId, gameType, score: challengerScore },
    '🎯 Challenge sent'
  );

  return challenge;
}

/**
 * Get challenges for a user
 */
export function getUserChallenges(
  userId: string,
  type: 'sent' | 'received' | 'all' = 'all'
): MusicChallenge[] {
  const allChallenges = Array.from(challenges.values());

  return allChallenges.filter((c) => {
    // Filter out expired
    if (c.status === 'pending' && new Date() > c.expiresAt) {
      c.status = 'expired';
    }

    if (type === 'sent') return c.challengerId === userId;
    if (type === 'received') return c.challengeeId === userId;
    return c.challengerId === userId || c.challengeeId === userId;
  });
}

/**
 * Get a specific challenge
 */
export function getChallenge(challengeId: string): MusicChallenge | null {
  return challenges.get(challengeId) || null;
}

/**
 * Accept and complete a challenge
 */
export function completeChallenge(
  challengeId: string,
  challengeeScore: number,
  challengeeTime?: number,
  challengeeName?: string
): MusicChallenge | null {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;

  if (challenge.status !== 'pending') {
    log.warn({ challengeId, status: challenge.status }, 'Challenge not pending');
    return challenge;
  }

  challenge.challengeeScore = challengeeScore;
  challenge.challengeeTime = challengeeTime;
  challenge.challengeeName = challengeeName;
  challenge.status = 'completed';
  challenge.completedAt = new Date();

  // Determine winner
  if (challengeeScore > challenge.challengerScore) {
    challenge.winnerId = challenge.challengeeId;
  } else if (challenge.challengerScore > challengeeScore) {
    challenge.winnerId = challenge.challengerId;
  } else if (challengeeTime && challenge.challengerTime) {
    // Tie-breaker: faster time wins
    challenge.winnerId = challengeeTime < challenge.challengerTime
      ? challenge.challengeeId
      : challenge.challengerId;
  }

  log.info(
    {
      challengeId,
      challengerScore: challenge.challengerScore,
      challengeeScore,
      winnerId: challenge.winnerId,
    },
    '🏆 Challenge completed'
  );

  return challenge;
}

/**
 * Decline a challenge
 */
export function declineChallenge(challengeId: string): MusicChallenge | null {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;

  challenge.status = 'declined';

  log.info({ challengeId }, '❌ Challenge declined');

  return challenge;
}

// ============================================================================
// LEADERBOARDS
// ============================================================================

/**
 * Get or create a leaderboard
 */
export function getLeaderboard(
  type: 'weekly' | 'monthly' | 'all-time',
  gameType: string | 'overall' = 'overall'
): Leaderboard {
  const key = `${type}-${gameType}`;
  let leaderboard = leaderboards.get(key);

  if (!leaderboard) {
    leaderboard = {
      type,
      gameType,
      entries: [],
      updatedAt: new Date(),
    };
    leaderboards.set(key, leaderboard);
  }

  return leaderboard;
}

/**
 * Update a user's leaderboard entry
 */
export function updateLeaderboardEntry(
  type: 'weekly' | 'monthly' | 'all-time',
  gameType: string | 'overall',
  userId: string,
  displayName: string,
  score: number,
  gamesPlayed: number,
  bestStreak: number,
  avatarUrl?: string
): LeaderboardEntry {
  const leaderboard = getLeaderboard(type, gameType);

  // Find or create entry
  let entry = leaderboard.entries.find((e) => e.userId === userId);
  const previousRank = entry?.rank || leaderboard.entries.length + 1;

  if (entry) {
    entry.score = Math.max(entry.score, score); // Keep best score
    entry.gamesPlayed = gamesPlayed;
    entry.bestStreak = Math.max(entry.bestStreak, bestStreak);
    if (displayName) entry.displayName = displayName;
    if (avatarUrl) entry.avatarUrl = avatarUrl;
  } else {
    entry = {
      rank: 0, // Will be calculated
      userId,
      displayName,
      score,
      gamesPlayed,
      bestStreak,
      avatarUrl,
      change: 0,
    };
    leaderboard.entries.push(entry);
  }

  // Re-sort and assign ranks
  leaderboard.entries.sort((a, b) => b.score - a.score);
  leaderboard.entries.forEach((e, index) => {
    const newRank = index + 1;
    if (e.userId === userId) {
      e.change = previousRank - newRank;
    }
    e.rank = newRank;
  });

  leaderboard.updatedAt = new Date();

  log.debug({ userId, type, gameType, rank: entry.rank }, '📊 Leaderboard updated');

  return entry;
}

/**
 * Get user's rank on a leaderboard
 */
export function getUserRank(
  userId: string,
  type: 'weekly' | 'monthly' | 'all-time' = 'weekly',
  gameType: string | 'overall' = 'overall'
): LeaderboardEntry | null {
  const leaderboard = getLeaderboard(type, gameType);
  return leaderboard.entries.find((e) => e.userId === userId) || null;
}

/**
 * Get top N entries from leaderboard
 */
export function getTopEntries(
  type: 'weekly' | 'monthly' | 'all-time',
  gameType: string | 'overall',
  limit: number = 10
): LeaderboardEntry[] {
  const leaderboard = getLeaderboard(type, gameType);
  return leaderboard.entries.slice(0, limit);
}

// ============================================================================
// TASTE MATCHING
// ============================================================================

/**
 * Calculate taste match between two users
 */
export function calculateTasteMatch(
  user1Id: string,
  user1Memory: GameMemory,
  user2Id: string,
  user2Memory: GameMemory,
  user1Name?: string,
  user2Name?: string
): TasteMatch {
  const cacheKey = [user1Id, user2Id].sort().join('-');
  
  // Get genre affinities
  const user1Genres = new Set(Object.keys(user1Memory.genreAffinities || {}));
  const user2Genres = new Set(Object.keys(user2Memory.genreAffinities || {}));

  // Get decade affinities
  const user1Decades = new Set(Object.keys(user1Memory.decadeAffinities || {}));
  const user2Decades = new Set(Object.keys(user2Memory.decadeAffinities || {}));

  // Calculate shared and unique
  const sharedGenres = [...user1Genres].filter((g) => user2Genres.has(g));
  const sharedDecades = [...user1Decades].filter((d) => user2Decades.has(d));

  const uniqueToUser1 = [
    ...[...user1Genres].filter((g) => !user2Genres.has(g)),
    ...[...user1Decades].filter((d) => !user2Decades.has(d)),
  ];

  const uniqueToUser2 = [
    ...[...user2Genres].filter((g) => !user1Genres.has(g)),
    ...[...user2Decades].filter((d) => !user1Decades.has(d)),
  ];

  // Calculate match score
  const totalUser1 = user1Genres.size + user1Decades.size;
  const totalUser2 = user2Genres.size + user2Decades.size;
  const sharedTotal = sharedGenres.length + sharedDecades.length;
  const avgTotal = (totalUser1 + totalUser2) / 2;

  let matchScore = avgTotal > 0 ? (sharedTotal / avgTotal) * 100 : 0;

  // Bonus for strong shared affinities
  const user1AffinityScores = Object.values(user1Memory.genreAffinities || {});
  const user2AffinityScores = Object.values(user2Memory.genreAffinities || {});

  for (const genre of sharedGenres) {
    const user1Score = user1AffinityScores.find((a) => a.category === genre)?.affinityScore || 0;
    const user2Score = user2AffinityScores.find((a) => a.category === genre)?.affinityScore || 0;

    // Both users strong in this genre = bonus
    if (user1Score >= 60 && user2Score >= 60) {
      matchScore += 5;
    }
  }

  matchScore = Math.min(100, Math.round(matchScore));

  const tasteMatch: TasteMatch = {
    userId1: user1Id,
    userId2: user2Id,
    matchScore,
    sharedGenres,
    sharedArtists: [], // Would need Spotify data
    sharedDecades,
    uniqueToUser1,
    uniqueToUser2,
    calculatedAt: new Date(),
  };

  tasteMatches.set(cacheKey, tasteMatch);

  log.info(
    { user1: user1Name || user1Id, user2: user2Name || user2Id, matchScore, sharedGenres },
    '🎵 Taste match calculated'
  );

  return tasteMatch;
}

/**
 * Get a cached taste match
 */
export function getCachedTasteMatch(user1Id: string, user2Id: string): TasteMatch | null {
  const cacheKey = [user1Id, user2Id].sort().join('-');
  return tasteMatches.get(cacheKey) || null;
}

/**
 * Generate a taste match description
 */
export function describeTasteMatch(tasteMatch: TasteMatch): string {
  const { matchScore, sharedGenres, sharedDecades } = tasteMatch;

  if (matchScore >= 80) {
    return `Incredible match! You two share a deep love for ${sharedGenres.slice(0, 2).join(' and ')} music${sharedDecades.length > 0 ? `, especially from the ${sharedDecades[0]}` : ''}.`;
  }

  if (matchScore >= 60) {
    return `Great taste match! You both appreciate ${sharedGenres.slice(0, 2).join(' and ')}${sharedDecades.length > 0 ? ` and have a thing for ${sharedDecades[0]} music` : ''}.`;
  }

  if (matchScore >= 40) {
    return `Decent overlap! You share some common ground with ${sharedGenres[0] || 'music'}, but you each bring unique flavors to the mix.`;
  }

  return `Different musical worlds! You could each introduce the other to something new—that's exciting!`;
}

// ============================================================================
// SOCIAL STATS
// ============================================================================

/**
 * Get social stats for a user
 */
export function getUserSocialStats(userId: string): {
  challengesSent: number;
  challengesReceived: number;
  challengesWon: number;
  challengesLost: number;
  currentLeaderboardRank: number | null;
  tasteMatchesCalculated: number;
} {
  const userChallenges = getUserChallenges(userId, 'all');

  const sent = userChallenges.filter((c) => c.challengerId === userId);
  const received = userChallenges.filter((c) => c.challengeeId === userId);
  const completed = userChallenges.filter((c) => c.status === 'completed');

  const won = completed.filter((c) => c.winnerId === userId).length;
  const lost = completed.filter((c) => c.winnerId && c.winnerId !== userId).length;

  const rank = getUserRank(userId, 'weekly', 'overall');

  // Count taste matches
  let tasteMatchCount = 0;
  for (const key of tasteMatches.keys()) {
    if (key.includes(userId)) tasteMatchCount++;
  }

  return {
    challengesSent: sent.length,
    challengesReceived: received.length,
    challengesWon: won,
    challengesLost: lost,
    currentLeaderboardRank: rank?.rank || null,
    tasteMatchesCalculated: tasteMatchCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sendChallenge,
  getUserChallenges,
  getChallenge,
  completeChallenge,
  declineChallenge,
  getLeaderboard,
  updateLeaderboardEntry,
  getUserRank,
  getTopEntries,
  calculateTasteMatch,
  getCachedTasteMatch,
  describeTasteMatch,
  getUserSocialStats,
};

