/**
 * 🎮 Games Service
 *
 * Interactive music games for engaging conversations and building trust.
 * 
 * ## Available Games
 * - **Name That Tune**: Guess the song from a clip
 * - **One Word Song**: Say a word, find a song with that word
 * - **Desert Island Discs**: Pick 5 songs for a desert island
 * - **This or That**: Choose between two songs
 * - **Mood DJ Challenge**: Describe a mood, pick a matching song
 * 
 * ## Architecture
 * ```
 * GameEngine (lifecycle) → Music Games (implementations)
 *                       → Game Music (iTunes/playback)
 *                       → Game Store (Firestore persistence)
 *                       → Game Intelligence (DNA, milestones)
 *                       → Game Analytics (usage tracking)
 * ```
 * 
 * ## Quick Start
 * ```typescript
 * import { getGameEngine, trackGameStart } from './services/games';
 * 
 * // Get engine
 * const engine = getGameEngine('ferni');
 * 
 * // Initialize for user (loads persisted data)
 * await engine.initializeForUser(userId);
 * 
 * // Start a game
 * const result = await engine.startGame('name-that-tune');
 * 
 * // Track analytics
 * trackGameStart(userId, 'name-that-tune', 'ferni');
 * ```
 * 
 * ## Documentation
 * See `/docs/features/MUSIC-GAMES.md` for full documentation.
 * 
 * @module services/games
 * @see {@link file:///docs/features/MUSIC-GAMES.md} Full documentation
 */

// Types
export * from './types.js';

// Game Engine - import first so we can use it locally
import { GameEngine, getGameEngine, resetGameEngine } from './game-engine.js';
export { GameEngine, getGameEngine, resetGameEngine };
export type { IGameImplementation } from './game-engine.js';

// Music Games
export { getMusicGameImplementation, setGameMemoryForGames } from './music-games.js';

// Game Music Helper (for playing music during games)
export {
  searchSong,
  searchSongWithWord,
  searchSongForMood,
  getRandomGameSongs,
  playGameTrack,
  stopGameTrack,
  fadeOutGameTrack,
  isMusicAvailable,
  isPlaying as isGameMusicPlaying,
  duckForUserGuess,
  unduckAfterGuess,
  type GameTrack,
  type SearchResult as GameSearchResult,
} from './game-music.js';

// ============================================================================
// GAME STATE HELPERS (for silence handler integration)
// ============================================================================

/**
 * Check if a game is currently active
 * Used by silence handler to avoid interrupting games
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
 * Get current game type (if active)
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
 * Get game context for silence handler
 */
export function getGameContextForSilence(): {
  isGameActive: boolean;
  activeGameType: string | null;
} {
  return {
    isGameActive: isGameCurrentlyActive(),
    activeGameType: getCurrentGameType(),
  };
}

// ============================================================================
// GAME PERSISTENCE (cross-session memory)
// ============================================================================

export {
  createEmptyGameMemory,
  getGameMemory,
  saveGameSession,
  saveSongGuessed,
  saveDesertIslandPicks,
  getGameHistoryIntro,
  getSuggestedGame,
  updateGameActivity,
  shouldAutoEndGame,
  resetGameActivity,
  detectTopicChange,
} from './game-persistence.js';

// ============================================================================
// GAME SOUND EFFECTS
// ============================================================================

export {
  getVerbalSoundEffect,
  playGameSound,
  getGameFeedback,
  playGameStartSound,
  playGameEndSound,
} from './game-sounds.js';

// ============================================================================
// 🧠 GAME INTELLIGENCE ("More than human" features)
// ============================================================================

export {
  // Musical DNA tracking
  recordGuess,
  getTopAffinities,
  getWeakAreas,
  
  // Adaptive difficulty
  analyzeDifficulty,
  
  // Milestone detection
  checkMilestones,
  
  // Musical personality
  analyzeMusicalPersonality,
  getPersonalityComment,
  
  // Conversation callbacks
  storeConversationHint,
  getConversationCallback,
  
  // Song selection intelligence
  getSongSelectionContext,
  getMusicalDNAMessage,
  
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
  
  // Types
  type MusicInsights,
  type PersonalitySummary,
  type AffinityDisplay,
  type MilestoneDisplay,
  type MemorableMoment,
  type JourneyStats,
  type PersonaPlayStats,
} from './game-insights.js';

// ============================================================================
// 🔴 GAME STORE (Persistence)
// ============================================================================

export {
  // Loading
  loadGameMemory,
  loadMusicMemory,
  
  // Saving
  saveGameMemory,
  saveMusicMemory,
  forceSaveGameMemory,
  
  // Quick access
  getCachedGameMemory,
  updateCachedGameMemory,
  clearCache,
  
  // Convenience
  recordGameCompletion,
  updateMusicalDNA,
  
  // Shutdown
  shutdown as shutdownGameStore,
} from './game-store.js';

// ============================================================================
// 📊 GAME ANALYTICS
// ============================================================================

export {
  // Tracking
  trackGameEvent,
  trackGameStart,
  trackGameComplete,
  trackGameAbandoned,
  trackAnswer,
  trackDashboardOpen,
  trackProactiveOffer,
  
  // Getters
  getAnalyticsSummary,
  getUserEvents,
  getGameTypeBreakdown,
  resetAnalytics,
  
  // Types
  type GameEvent,
  type GameEventType,
  type GameAnalyticsSummary,
} from './game-analytics.js';

// ============================================================================
// 🎵 PRELOADING
// ============================================================================

export {
  preloadNextRoundSongs,
  getPreloadedOrSearch,
  clearPreloadQueue,
  getPreloadQueueSize,
} from './game-music.js';
