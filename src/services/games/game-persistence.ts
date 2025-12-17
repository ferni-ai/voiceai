/**
 * 🎮 Game Persistence Service
 *
 * Handles saving/loading game state to user profile.
 * Enables:
 * - Cross-session high scores
 * - "We played last time" memory
 * - Game history tracking
 */

import type { GameMemory, GameSessionRecord, UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { GameSession, GameType } from './types.js';

const log = getLogger();

// ============================================================================
// GAME MEMORY HELPERS
// ============================================================================

/**
 * Initialize empty game memory
 */
export function createEmptyGameMemory(): GameMemory {
  return {
    gameStats: {},
    recentGames: [],
    favoriteGames: [],
    totalGamesPlayed: 0,
    updatedAt: new Date(),
  };
}

/**
 * Get game memory from user profile (or create empty)
 */
export function getGameMemory(userProfile?: UserProfile): GameMemory {
  if (userProfile?.gameMemory) {
    return userProfile.gameMemory;
  }
  return createEmptyGameMemory();
}

// ============================================================================
// SAVE GAME RESULTS
// ============================================================================

/**
 * Save a completed game session to user profile
 */
export function saveGameSession(
  gameMemory: GameMemory,
  session: GameSession,
  highlights?: string[]
): GameMemory {
  const record: GameSessionRecord = {
    gameType: session.gameType,
    score: session.score,
    roundsPlayed: session.roundsPlayed,
    durationSeconds: session.durationSeconds,
    playedAt: new Date(session.playedAt),
    personaId: session.personaId,
    highlights,
  };

  // Update game-specific stats
  const { gameType } = session;
  const existing = gameMemory.gameStats[gameType];

  if (existing) {
    existing.gamesPlayed++;
    existing.totalScore += session.score;
    existing.averageScore = Math.round(existing.totalScore / existing.gamesPlayed);
    existing.highScore = Math.max(existing.highScore, session.score);
    existing.lastPlayed = new Date(session.playedAt);
  } else {
    gameMemory.gameStats[gameType] = {
      gamesPlayed: 1,
      highScore: session.score,
      totalScore: session.score,
      averageScore: session.score,
      lastPlayed: new Date(session.playedAt),
    };
  }

  // Add to recent games (keep last 20)
  gameMemory.recentGames.unshift(record);
  if (gameMemory.recentGames.length > 20) {
    gameMemory.recentGames = gameMemory.recentGames.slice(0, 20);
  }

  // Update total
  gameMemory.totalGamesPlayed++;

  // Update last game
  gameMemory.lastGamePlayed = {
    gameType: session.gameType,
    playedAt: new Date(session.playedAt),
    score: session.score,
  };

  // Update favorite games (top 3 most played)
  const sortedByPlays = Object.entries(gameMemory.gameStats)
    .sort(([, a], [, b]) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, 3)
    .map(([type]) => type);
  gameMemory.favoriteGames = sortedByPlays;

  gameMemory.updatedAt = new Date();

  log.info(
    {
      gameType,
      score: session.score,
      totalGames: gameMemory.totalGamesPlayed,
    },
    '🎮 Game session saved to profile'
  );

  return gameMemory;
}

/**
 * Save a Name That Tune correct guess
 */
export function saveSongGuessed(gameMemory: GameMemory, songName: string): void {
  if (!gameMemory.songsGuessedCorrectly) {
    gameMemory.songsGuessedCorrectly = [];
  }

  if (!gameMemory.songsGuessedCorrectly.includes(songName)) {
    gameMemory.songsGuessedCorrectly.push(songName);
    // Keep last 50
    if (gameMemory.songsGuessedCorrectly.length > 50) {
      gameMemory.songsGuessedCorrectly = gameMemory.songsGuessedCorrectly.slice(-50);
    }
  }
}

/**
 * Save Desert Island picks (these are meaningful!)
 */
export function saveDesertIslandPicks(gameMemory: GameMemory, picks: string[]): void {
  gameMemory.desertIslandPicks = picks;
  gameMemory.updatedAt = new Date();

  log.info({ picks }, '🎮 Desert Island picks saved');
}

// ============================================================================
// CROSS-SESSION MEMORY
// ============================================================================

/**
 * Get a "we played before" intro based on game history
 */
export function getGameHistoryIntro(
  gameMemory: GameMemory,
  gameType: GameType,
  personaId: string
): string | null {
  const stats = gameMemory.gameStats[gameType];

  if (!stats || stats.gamesPlayed === 0) {
    return null; // Never played before
  }

  const daysSinceLast = Math.floor(
    (Date.now() - new Date(stats.lastPlayed).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Different intros based on history
  const intros: Record<string, string[]> = {
    'name-that-tune': [
      `We've played Name That Tune ${stats.gamesPlayed} times! Your high score is ${stats.highScore}. Ready to beat it?`,
      `Last time you scored ${stats.highScore} points! Think you can do better?`,
      `You're getting good at this - ${stats.gamesPlayed} games and counting!`,
    ],
    'one-word-song': [
      `We've done One Word Song before! You're pretty creative with words.`,
      `Back for more word association? Let's find some new songs!`,
    ],
    'desert-island-discs': [
      gameMemory.desertIslandPicks
        ? `Last time your picks were: ${gameMemory.desertIslandPicks.slice(0, 2).join(', ')}... Want to reconsider?`
        : `Let's see if your island playlist has changed!`,
    ],
    'this-or-that': [
      `We've done This or That ${stats.gamesPlayed} times. I'm learning your taste!`,
    ],
    'mood-dj-challenge': [
      `I remember our Mood DJ sessions! My average rating was... okay, let's not talk about that.`,
      `Ready to test my DJ skills again?`,
    ],
  };

  const gameIntros = intros[gameType] || [];

  if (gameIntros.length === 0) {
    return `We've played this ${stats.gamesPlayed} times! Your best: ${stats.highScore}`;
  }

  // Add time-based flavor
  if (daysSinceLast > 7) {
    return `It's been ${daysSinceLast} days since we played this! ${
      gameIntros[Math.floor(Math.random() * gameIntros.length)]
    }`;
  }

  return gameIntros[Math.floor(Math.random() * gameIntros.length)];
}

/**
 * Get a personalized game suggestion based on history
 */
export function getSuggestedGame(gameMemory: GameMemory): {
  gameType: GameType;
  reason: string;
} | null {
  // If they have favorites, suggest one they haven't played recently
  if (gameMemory.favoriteGames.length > 0) {
    const favorite = gameMemory.favoriteGames[0] as GameType;
    const stats = gameMemory.gameStats[favorite];

    if (stats) {
      const daysSince = Math.floor(
        (Date.now() - new Date(stats.lastPlayed).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince > 3) {
        return {
          gameType: favorite,
          reason: `It's been ${daysSince} days since we played ${formatGameName(favorite)}! Want to go again?`,
        };
      }
    }
  }

  // Suggest a game they haven't tried
  const allGames: GameType[] = [
    'name-that-tune',
    'one-word-song',
    'desert-island-discs',
    'this-or-that',
    'mood-dj-challenge',
  ];

  const unplayed = allGames.filter((g) => !gameMemory.gameStats[g]);
  if (unplayed.length > 0) {
    const suggestion = unplayed[Math.floor(Math.random() * unplayed.length)];
    return {
      gameType: suggestion,
      reason: `Hey, we haven't tried ${formatGameName(suggestion)} yet! Want to give it a shot?`,
    };
  }

  return null;
}

/**
 * Format game type to human-readable name
 */
function formatGameName(gameType: GameType): string {
  const names: Record<GameType, string> = {
    'name-that-tune': 'Name That Tune',
    'one-word-song': 'One Word Song',
    'desert-island-discs': 'Desert Island Discs',
    'this-or-that': 'This or That',
    'mood-dj-challenge': 'Mood DJ Challenge',
    'finish-the-lyric': 'Finish the Lyric',
    'decade-challenge': 'Decade Challenge',
  };
  return names[gameType] || gameType;
}

// ============================================================================
// AUTO-CLEANUP
// ============================================================================

/** Inactivity timeout in milliseconds (2 minutes) */
const GAME_INACTIVITY_TIMEOUT = 2 * 60 * 1000;

/** Track last activity time */
let lastGameActivity = 0;

/**
 * Update last activity timestamp
 */
export function updateGameActivity(): void {
  lastGameActivity = Date.now();
}

/**
 * Check if game should be auto-ended due to inactivity
 */
export function shouldAutoEndGame(): boolean {
  if (lastGameActivity === 0) return false;
  return Date.now() - lastGameActivity > GAME_INACTIVITY_TIMEOUT;
}

/**
 * Reset activity tracker
 */
export function resetGameActivity(): void {
  lastGameActivity = 0;
}

/**
 * Detect topic change that suggests user has moved on from game
 * Returns true if the message seems unrelated to the game
 */
export function detectTopicChange(userMessage: string, activeGameType: GameType | null): boolean {
  if (!activeGameType) return false;

  const message = userMessage.toLowerCase();

  // Game-related keywords that suggest they're still playing
  const gameKeywords = [
    'guess',
    'answer',
    'hint',
    'skip',
    'next',
    'score',
    'points',
    'song',
    'music',
    'play',
    'tune',
    'artist',
    'band',
    'a',
    'b',
    'first',
    'second', // for This or That
    'word',
    'love',
    'night',
    'happy', // common One Word Song words
  ];

  // Check if message contains game keywords
  const hasGameKeyword = gameKeywords.some((kw) => message.includes(kw));

  // Non-game topics that suggest they've moved on
  const offTopicKeywords = [
    'weather',
    'news',
    'tell me about',
    'what do you think',
    'how are you',
    'help me',
    'can you',
    'i need',
    'calendar',
    'remind',
    'schedule',
    'email',
    'actually',
    'nevermind',
    'forget it',
    'stop',
  ];

  const hasOffTopic = offTopicKeywords.some((kw) => message.includes(kw));

  // If they explicitly want to stop or move on
  const wantsToStop = [
    'stop the game',
    'end game',
    'quit',
    'done playing',
    "i'm done",
    'enough',
    "let's do something else",
  ].some((phrase) => message.includes(phrase));

  if (wantsToStop) return true;

  // If message has off-topic keywords but no game keywords, they might have moved on
  if (hasOffTopic && !hasGameKeyword) return true;

  // Very long messages that don't seem like game answers
  if (message.length > 100 && !hasGameKeyword) return true;

  return false;
}
