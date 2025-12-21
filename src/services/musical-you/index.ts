/**
 * 🎵 Musical You Service
 *
 * Your soundtrack, understood.
 *
 * Music games, Spotify integration, shareable identity cards,
 * and social/multiplayer features.
 *
 * ## Features
 * - Music Games (Name That Tune, Desert Island, etc.)
 * - Musical DNA tracking and personality analysis
 * - Spotify deep integration (library games, Our Songs)
 * - Shareable cards for social media
 * - Friend challenges and leaderboards
 * - Daily music challenges
 *
 * ## Quick Start
 * ```typescript
 * import { getMusicalDNA, generateDNACard, sendChallenge } from './services/musical-you';
 *
 * // Get user's musical profile
 * const dna = await getMusicalDNA(userId, gameMemory);
 *
 * // Generate shareable card
 * const card = generateDNACard(userId, dna);
 *
 * // Challenge a friend
 * sendChallenge(userId, 'My Name', friendId, 'name-that-tune', 85);
 * ```
 *
 * @module MusicalYou
 * @see {@link file:///docs/plans/CREATIVE-MUSICAL-YOU-PLAN.md} Full documentation
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { GameMemory } from '../../types/user-profile.js';

// Import all submodules
import {
  generateMusicalDNA,
  generateCoachingMessage,
  generateTimeMachine,
  type TimeMachineEntry,
} from './musical-dna.js';

import {
  getDailyChallenge,
  getUpcomingChallenges,
  getUserChallengeProgress,
  startDailyChallenge,
  completeDailyChallenge,
  calculateUserStreak,
  getUserChallengeStats,
} from './daily-challenges.js';

import {
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
} from './social.js';

import {
  generateMusicalDNACard,
  generateDesertIslandCard,
  generateGameVictoryCard,
  generateWeeklyRecapCard,
  getCard,
  getUserCards,
  generateMusicalDNASVG,
  generateDesertIslandSVG,
  generateVictorySVG,
} from './shareable-cards.js';

import {
  syncSpotifyLibrary,
  getSpotifyLibrary,
  getRandomPlayableTracks,
  hasEnoughPlayableContent,
  getChallengerTracks,
  getOurSongsPlaylist,
  addOurSong,
  syncOurSongsToSpotify,
  analyzeLibraryTaste,
} from './spotify-library.js';

import {
  getRandomLyricRound,
  checkLyricAnswer,
  createLyricGameSession,
  getRandomDecadeRound,
  checkDecadeGuess,
  createDecadeGameSession,
  getRandomTriviaQuestions,
  getShuffledTriviaOptions,
  checkTriviaAnswer,
  createTriviaGameSession,
  type LyricGameSession,
  type DecadeGameSession,
  type TriviaGameSession,
} from './new-games.js';

// Apple Music integration
import {
  generateDeveloperToken as generateAppleMusicToken,
  syncAppleMusicLibrary,
  getAppleMusicLibrary,
  isAppleMusicConnected,
  analyzeAppleMusicTaste,
  getAppleMusicTracksForGames,
  getHeavyRotationTracks,
  getRecentlyPlayedTracks,
} from './apple-music.js';

const log = createLogger({ module: 'MusicalYou' });

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Musical DNA
  MusicalDNA,
  MusicalPersonalityType,
  GenreAffinity,
  DecadeAffinity,
  ArtistAffinity,
  MusicalTrait,
  MusicalTraitType,
  MusicalMilestone,
  MilestoneType,

  // Spotify
  SpotifyLibraryData,
  SpotifyTrack,
  SpotifyArtist,
  OurSongsPlaylist,
  OurSong,

  // Shareable Cards
  CardType,
  ShareableCard,
  MusicalDNACardData,
  DesertIslandCardData,
  GameVictoryCardData,
  WeeklyRecapCardData,

  // Social
  MusicChallenge,
  Leaderboard,
  LeaderboardEntry,
  TasteMatch,

  // Daily Challenges
  DailyChallenge,
  DailyChallengeType,
  UserDailyChallengeProgress,

  // Memorable Moments
  MemorableMoment,
  MomentType,

  // Desert Island
  DesertIslandPicks,
  DesertIslandSong,

  // New Games
  FinishTheLyricRound,
  DecadeChallengeRound,
  MusicTriviaQuestion,

  // Apple Music
  AppleMusicLibraryData,
  AppleMusicTrack,
  AppleMusicArtist,
  AppleMusicPlaylist,
  AppleMusicTasteAnalysis,
  MusicSourcesStatus,
} from './types.js';

export type { TimeMachineEntry };

// ============================================================================
// MAIN API - MUSICAL DNA
// ============================================================================

/**
 * Get user's Musical DNA profile
 */
export async function getMusicalDNA(
  userId: string,
  gameMemory?: GameMemory | null,
  spotifyAccessToken?: string
) {
  if (!gameMemory) {
    log.debug({ userId }, 'No game memory for Musical DNA');
    return null;
  }

  return generateMusicalDNA(userId, gameMemory, spotifyAccessToken);
}

/**
 * Get coaching message based on Musical DNA
 */
export { generateCoachingMessage };

/**
 * Generate time machine (discovery timeline)
 */
export { generateTimeMachine };

// ============================================================================
// MAIN API - SHAREABLE CARDS
// ============================================================================

/**
 * Generate a shareable Musical DNA card
 */
export function generateDNACard(
  userId: string,
  dna: Awaited<ReturnType<typeof generateMusicalDNA>>
) {
  if (!dna) {
    log.warn({ userId }, 'Cannot generate DNA card without DNA');
    return null;
  }

  return generateMusicalDNACard(userId, dna);
}

// Re-export card generators
export {
  generateDesertIslandCard,
  generateGameVictoryCard,
  generateWeeklyRecapCard,
  getCard,
  getUserCards,
  generateMusicalDNASVG,
  generateDesertIslandSVG,
  generateVictorySVG,
};

// ============================================================================
// MAIN API - SOCIAL FEATURES
// ============================================================================

/**
 * Send a music challenge to a friend
 */
export function sendMusicChallenge(
  challengerId: string,
  challengerName: string,
  challengeeId: string,
  gameType: string,
  challengerScore: number,
  challengerTime?: number
) {
  return sendChallenge(
    challengerId,
    challengerName,
    challengeeId,
    gameType,
    challengerScore,
    challengerTime
  );
}

// Re-export social features
export {
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

// ============================================================================
// MAIN API - DAILY CHALLENGES
// ============================================================================

// Re-export daily challenge features
export {
  getDailyChallenge,
  getUpcomingChallenges,
  getUserChallengeProgress,
  startDailyChallenge,
  completeDailyChallenge,
  calculateUserStreak,
  getUserChallengeStats,
};

// ============================================================================
// MAIN API - SPOTIFY INTEGRATION
// ============================================================================

// Re-export Spotify features
export {
  syncSpotifyLibrary,
  getSpotifyLibrary,
  getRandomPlayableTracks,
  hasEnoughPlayableContent,
  getChallengerTracks,
  getOurSongsPlaylist,
  addOurSong,
  syncOurSongsToSpotify,
  analyzeLibraryTaste,
};

// ============================================================================
// MAIN API - APPLE MUSIC INTEGRATION
// ============================================================================

// Re-export Apple Music features
export {
  generateAppleMusicToken,
  syncAppleMusicLibrary,
  getAppleMusicLibrary,
  isAppleMusicConnected,
  analyzeAppleMusicTaste,
  getAppleMusicTracksForGames,
  getHeavyRotationTracks,
  getRecentlyPlayedTracks,
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get a complete Musical You profile for a user
 * Includes DNA, stats, cards, social info, and challenges
 */
export async function getMusicalYouProfile(
  userId: string,
  gameMemory: GameMemory | null,
  spotifyAccessToken?: string,
  appleMusicTokens?: { developer: string; user: string }
) {
  const dna = await getMusicalDNA(userId, gameMemory, spotifyAccessToken);

  // Check Apple Music connection status
  const appleMusicConnected = isAppleMusicConnected(userId);
  const appleMusicLibrary = appleMusicConnected ? await getAppleMusicLibrary(userId) : null;

  return {
    dna,
    coachingMessage: dna ? generateCoachingMessage(dna) : null,
    timeMachine: dna ? generateTimeMachine(dna) : [],
    dailyChallenge: getDailyChallenge(),
    challengeStats: getUserChallengeStats(userId),
    socialStats: getUserSocialStats(userId),
    cards: getUserCards(userId),
    leaderboardRank: getUserRank(userId),
    // Music source status
    musicSources: {
      games: {
        connected: true,
        gamesPlayed: gameMemory?.totalGamesPlayed || 0,
        lastPlayed: gameMemory?.updatedAt || null,
      },
      spotify: {
        connected: !!spotifyAccessToken,
        trackCount: 0, // Would need to fetch
        lastSynced: null,
      },
      appleMusic: {
        connected: appleMusicConnected,
        trackCount: appleMusicLibrary?.libraryTrackCount || 0,
        lastSynced: appleMusicLibrary?.lastSyncedAt || null,
      },
    },
    // Legacy fields for backward compatibility
    spotifyConnected: !!spotifyAccessToken,
    appleMusicConnected,
  };
}

/**
 * Record a game result and update all relevant stats
 */
export function recordGameResult(
  userId: string,
  displayName: string,
  gameType: string,
  score: number,
  gamesPlayed: number,
  bestStreak: number
) {
  // Update leaderboard
  updateLeaderboardEntry('weekly', gameType, userId, displayName, score, gamesPlayed, bestStreak);
  updateLeaderboardEntry('weekly', 'overall', userId, displayName, score, gamesPlayed, bestStreak);
  updateLeaderboardEntry('all-time', gameType, userId, displayName, score, gamesPlayed, bestStreak);
  updateLeaderboardEntry('all-time', 'overall', userId, displayName, score, gamesPlayed, bestStreak);

  log.info({ userId, gameType, score }, '🎮 Recorded game result');
}

// ============================================================================
// NEW GAMES - FINISH LYRIC, DECADE, TRIVIA
// ============================================================================

export type { LyricGameSession, DecadeGameSession, TriviaGameSession };

// Finish the Lyric
export {
  getRandomLyricRound,
  checkLyricAnswer,
  createLyricGameSession,
};

// Decade Challenge
export {
  getRandomDecadeRound,
  checkDecadeGuess,
  createDecadeGameSession,
};

// Music Trivia
export {
  getRandomTriviaQuestions,
  getShuffledTriviaOptions,
  checkTriviaAnswer,
  createTriviaGameSession,
};
