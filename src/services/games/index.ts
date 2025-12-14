/**
 * 🎮 Games Service
 *
 * Interactive games for engaging conversations and building trust.
 *
 * ## Available Music Games
 * - **Name That Tune**: Guess the song from a clip
 * - **One Word Song**: Say a word, find a song with that word
 * - **Desert Island Discs**: Pick 5 songs for a desert island
 * - **This or That**: Choose between two songs
 * - **Mood DJ Challenge**: Describe a mood, pick a matching song
 *
 * ## Available Text Games
 * - **Tic-Tac-Toe**: Classic 3x3 grid game with voice-friendly positions
 * - (Coming soon: 20 Questions, Word Association, Would You Rather)
 *
 * ## Architecture
 * ```
 * GameEngine (music) → Music Games (implementations)
 *                    → Game Music (iTunes/playback)
 *                    → Game Store (Firestore persistence)
 *                    → Game Intelligence (DNA, milestones)
 *                    → Game Analytics (usage tracking)
 *
 * TextGameEngine → Tic-Tac-Toe (board game logic)
 *               → (Future: 20 Questions, Word Association, etc.)
 * ```
 *
 * ## Quick Start - Music Games
 * ```typescript
 * import { getGameEngine, trackGameStart } from './services/games';
 *
 * const engine = getGameEngine('ferni');
 * await engine.initializeForUser(userId);
 * const result = await engine.startGame('name-that-tune');
 * ```
 *
 * ## Quick Start - Text Games
 * ```typescript
 * import { getTextGameEngine } from './services/games';
 *
 * const engine = getTextGameEngine('ferni');
 * const result = await engine.startGame('tic-tac-toe');
 * const moveResult = await engine.makeMove('center');
 * ```
 *
 * ## Documentation
 * See `/docs/features/MUSIC-GAMES.md` for full documentation.
 *
 * @module services/games
 * @see {@link file:///docs/features/MUSIC-GAMES.md} Full documentation
 */

// Types
export type { IGameImplementation } from './game-engine.js';
export type * from './text-game-types.js';
export type * from './types.js';

// Game Engine - import first so we can use it locally
import {
  GameEngine,
  getActiveGameEngineCount,
  getGameEngine,
  // Session-scoped (preferred)
  getSessionGameEngine,
  resetAllGameEngines,
  resetGameEngine,
  resetSessionGameEngine,
} from './game-engine.js';

export {
  GameEngine,
  getActiveGameEngineCount,
  getGameEngine,
  // Session-scoped (preferred)
  getSessionGameEngine,
  resetAllGameEngines,
  resetGameEngine,
  resetSessionGameEngine,
};

// Text Game Engine
import {
  TextGameEngine,
  getActiveTextGameEngineCount,
  // Session-scoped (preferred)
  getSessionTextGameEngine,
  getTextGameEngine,
  resetAllTextGameEngines,
  resetSessionTextGameEngine,
  resetTextGameEngine,
} from './text-game-engine.js';

export {
  TextGameEngine,
  getActiveTextGameEngineCount,
  // Session-scoped (preferred)
  getSessionTextGameEngine,
  getTextGameEngine,
  resetAllTextGameEngines,
  resetSessionTextGameEngine,
  resetTextGameEngine,
};

// Music Games
export { getMusicGameImplementation, setGameMemoryForGames } from './music-games.js';

// Text Games - Tic-Tac-Toe
export {
  checkWinner as checkTicTacToeWinner,
  createInitialState as createTicTacToeState,
  describeBoardForVoice as describeTicTacToeBoard,
  getAIMove as getTicTacToeAIMove,
  isValidMove as isTicTacToeMoveValid,
  makeMove as makeTicTacToeMove,
  parsePosition as parseTicTacToePosition,
  processUserMove as processTicTacToeMove,
} from './tic-tac-toe.js';

// Game Music Helper (for playing music during games)
export {
  duckForUserGuess,
  fadeOutGameTrack,
  getRandomGameSongs,
  isPlaying as isGameMusicPlaying,
  isMusicAvailable,
  playGameTrack,
  searchSong,
  searchSongForMood,
  searchSongWithWord,
  stopGameTrack,
  unduckAfterGuess,
  type SearchResult as GameSearchResult,
  type GameTrack,
} from './game-music.js';

// ============================================================================
// GAME STATE HELPERS (for silence handler integration)
// ============================================================================

/**
 * Check if a music game is currently active (legacy singleton)
 * Used by silence handler to avoid interrupting games
 * @deprecated Use isSessionGameActive(sessionId) instead
 */
export function isGameCurrentlyActive(): boolean {
  try {
    const engine = getGameEngine();
    return engine.isGameActive();
  } catch {
    return false;
  }
}

/**
 * Check if a text game is currently active (legacy singleton)
 * @deprecated Use isSessionTextGameActive(sessionId) instead
 */
export function isTextGameCurrentlyActive(): boolean {
  try {
    const engine = getTextGameEngine();
    return engine.isGameActive();
  } catch {
    return false;
  }
}

/**
 * Check if ANY game (music or text) is currently active (legacy singleton)
 * @deprecated Use isAnySessionGameActive(sessionId) instead
 */
export function isAnyGameActive(): boolean {
  return isGameCurrentlyActive() || isTextGameCurrentlyActive();
}

/**
 * Get current game type (if active) (legacy singleton)
 * @deprecated Use getSessionGameType(sessionId) instead
 */
export function getCurrentGameType(): string | null {
  try {
    const engine = getGameEngine();
    return engine.getCurrentGameType();
  } catch {
    return null;
  }
}

/**
 * Get current text game type (if active) (legacy singleton)
 * @deprecated Use getSessionTextGameType(sessionId) instead
 */
export function getCurrentTextGameType(): string | null {
  try {
    const engine = getTextGameEngine();
    return engine.getCurrentGameType();
  } catch {
    return null;
  }
}

/**
 * Get game context for silence handler (legacy singleton)
 * @deprecated Use getSessionGameContext(sessionId) instead
 */
export function getGameContextForSilence(): {
  isGameActive: boolean;
  activeGameType: string | null;
} {
  const musicGame = isGameCurrentlyActive();
  const textGame = isTextGameCurrentlyActive();

  return {
    isGameActive: musicGame || textGame,
    activeGameType: musicGame ? getCurrentGameType() : textGame ? getCurrentTextGameType() : null,
  };
}

// ============================================================================
// SESSION-SCOPED GAME STATE HELPERS (preferred)
// ============================================================================

/**
 * Check if a music game is active for a specific session
 */
export function isSessionGameActive(sessionId: string): boolean {
  try {
    const engine = getSessionGameEngine(sessionId);
    return engine.isGameActive();
  } catch {
    return false;
  }
}

/**
 * Check if a text game is active for a specific session
 */
export function isSessionTextGameActive(sessionId: string): boolean {
  try {
    const engine = getSessionTextGameEngine(sessionId);
    return engine.isGameActive();
  } catch {
    return false;
  }
}

/**
 * Check if ANY game is active for a specific session
 */
export function isAnySessionGameActive(sessionId: string): boolean {
  return isSessionGameActive(sessionId) || isSessionTextGameActive(sessionId);
}

/**
 * Get current game type for a specific session
 */
export function getSessionGameType(sessionId: string): string | null {
  try {
    const engine = getSessionGameEngine(sessionId);
    return engine.getCurrentGameType();
  } catch {
    return null;
  }
}

/**
 * Get current text game type for a specific session
 */
export function getSessionTextGameType(sessionId: string): string | null {
  try {
    const engine = getSessionTextGameEngine(sessionId);
    return engine.getCurrentGameType();
  } catch {
    return null;
  }
}

/**
 * Get game context for a specific session (for silence handler)
 */
export function getSessionGameContext(sessionId: string): {
  isGameActive: boolean;
  activeGameType: string | null;
} {
  const musicGame = isSessionGameActive(sessionId);
  const textGame = isSessionTextGameActive(sessionId);

  return {
    isGameActive: musicGame || textGame,
    activeGameType: musicGame
      ? getSessionGameType(sessionId)
      : textGame
        ? getSessionTextGameType(sessionId)
        : null,
  };
}

/**
 * Reset game activity tracking for a specific session
 * This is a session-scoped wrapper around the global activity tracker
 */
export function resetSessionGameActivity(sessionId: string): void {
  // End any active games for this session
  try {
    const engine = getSessionGameEngine(sessionId);
    if (engine.isGameActive()) {
      engine.endGame();
    }
  } catch {
    // Engine not found for this session - that's fine
  }

  try {
    const textEngine = getSessionTextGameEngine(sessionId);
    if (textEngine.isGameActive()) {
      textEngine.endGame();
    }
  } catch {
    // Text engine not found for this session - that's fine
  }
}

// ============================================================================
// GAME PERSISTENCE (cross-session memory)
// ============================================================================

export {
  createEmptyGameMemory,
  detectTopicChange,
  getGameHistoryIntro,
  getGameMemory,
  getSuggestedGame,
  resetGameActivity,
  saveDesertIslandPicks,
  saveGameSession,
  saveSongGuessed,
  shouldAutoEndGame,
  updateGameActivity,
} from './game-persistence.js';

// ============================================================================
// GAME SOUND EFFECTS
// ============================================================================

export {
  getGameFeedback,
  getVerbalSoundEffect,
  playGameEndSound,
  playGameSound,
  playGameStartSound,
} from './game-sounds.js';

// ============================================================================
// 🧠 GAME INTELLIGENCE ("More than human" features)
// ============================================================================

export {
  // Adaptive difficulty
  analyzeDifficulty,
  // Musical personality
  analyzeMusicalPersonality,
  // Milestone detection
  checkMilestones,
  getConversationCallback,
  getMusicalDNAMessage,
  getPersonalityComment,
  // Song selection intelligence
  getSongSelectionContext,
  getTopAffinities,
  getWeakAreas,
  // Musical DNA tracking
  recordGuess,
  // Conversation callbacks
  storeConversationHint,
  // Types
  type DifficultyRecommendation,
  type MilestoneEvent,
  type PersonalityInsight,
  type SongSelectionContext,
} from './game-intelligence.js';

// ============================================================================
// 🎯 GAME INSIGHTS (Dashboard & Conversational)
// ============================================================================

export {
  // Insight generation
  generateMusicInsights,
  getConversationalInsight,
  getGameSuggestion,
  type AffinityDisplay,
  type JourneyStats,
  type MemorableMoment,
  type MilestoneDisplay,
  // Types
  type MusicInsights,
  type PersonaPlayStats,
  type PersonalitySummary,
} from './game-insights.js';

// ============================================================================
// 🔴 GAME STORE (Persistence)
// ============================================================================

export {
  clearCache,
  forceSaveGameMemory,

  // Quick access
  getCachedGameMemory,
  // Loading
  loadGameMemory,
  loadMusicMemory,
  // Convenience
  recordGameCompletion,
  // Saving
  saveGameMemory,
  saveMusicMemory,
  // Shutdown
  shutdown as shutdownGameStore,
  updateCachedGameMemory,
  updateMusicalDNA,
} from './game-store.js';

// ============================================================================
// 📊 GAME ANALYTICS
// ============================================================================

export {
  // Getters
  getAnalyticsSummary,
  getGameTypeBreakdown,
  getUserEvents,
  resetAnalytics,
  trackAnswer,
  trackDashboardOpen,
  trackGameAbandoned,
  trackGameComplete,
  // Tracking
  trackGameEvent,
  trackGameStart,
  trackProactiveOffer,
  type GameAnalyticsSummary,
  // Types
  type GameEvent,
  type GameEventType,
} from './game-analytics.js';

// ============================================================================
// 🎵 PRELOADING
// ============================================================================

export {
  clearPreloadQueue,
  getPreloadQueueSize,
  getPreloadedOrSearch,
  preloadNextRoundSongs,
} from './game-music.js';

// ============================================================================
// 🎮🎵 GAME MUSIC CONTROLLER (Phase 1.5)
// ============================================================================

export {
  getGameMusicController,
  getGameMusicIntensity,
  isGameMusicActive,
  resetGameMusicController,
  type GameMusicEventResult,
  type GameMusicState,
} from './game-music-controller.js';
