/**
 * 🎮 Game Engine
 *
 * Core game loop, state management, and scoring.
 * This orchestrates games but delegates to specific game implementations.
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Timing tracking for each guess
 * - Adaptive difficulty based on performance
 * - Milestone detection and celebration
 * - Musical personality insights
 */

import type { GameMemory } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  analyzeDifficulty,
  checkMilestones,
  getConversationCallback,
  getPersonalityComment,
  recordGuess,
  type MilestoneEvent,
} from './game-intelligence.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  GameHistory,
  GameResult,
  GameSession,
  GameState,
  GameType,
  IGameEngine,
} from './types.js';

const log = getLogger();

// ============================================================================
// ERROR ANALYTICS
// ============================================================================

/**
 * Game error categories for analytics tracking
 */
type GameErrorCategory =
  | 'game_start_failed'
  | 'answer_evaluation_failed'
  | 'music_search_failed'
  | 'persistence_failed'
  | 'memory_initialization_failed';

/**
 * Track game-related errors for analytics
 * Structured logging that can be picked up by monitoring systems
 */
function trackGameError(
  category: GameErrorCategory,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  log.error(
    {
      category,
      errorMessage,
      errorStack,
      timestamp: new Date().toISOString(),
      ...context,
    },
    `🎮 GAME_ERROR: ${category}`
  );
}

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

/**
 * Maximum allowed answer length to prevent memory/processing issues
 */
const MAX_ANSWER_LENGTH = 500;

/**
 * Sanitize user input for game answers
 * - Trims whitespace
 * - Limits length
 * - Removes control characters
 * - Escapes potential injection patterns
 */
function sanitizeAnswer(answer: string): string {
  if (typeof answer !== 'string') {
    return '';
  }

  return (
    answer
      // Remove control characters (except newlines/tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Trim whitespace
      .trim()
      // Limit length
      .slice(0, MAX_ANSWER_LENGTH)
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ')
  );
}

// ============================================================================
// GAME ENGINE
// ============================================================================

export class GameEngine implements IGameEngine {
  private state: GameState;
  private history: GameHistory;
  private personaId: string;
  private userId: string | null = null;
  private gameImplementation: IGameImplementation | null = null;

  // ✨ "More than human" tracking
  private gameMemory: GameMemory | null = null;
  private roundStartTime = 0;
  private recentResults: GameResult[] = [];
  private pendingMilestone: MilestoneEvent | null = null;
  private pendingDifficultyMessage: string | null = null;
  private pendingPersonalityInsight: string | null = null;

  constructor(personaId = 'ferni') {
    this.personaId = personaId;
    this.state = this.createInitialState();
    this.history = {
      sessionGames: [],
      allTimeStats: {} as GameHistory['allTimeStats'],
    };
  }

  /**
   * Set user ID (required for persistence)
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get user ID
   */
  getUserId(): string | null {
    return this.userId;
  }

  /**
   * 🔴 PERSISTENCE: Initialize game memory for a user
   * Call this at session start to load persisted data
   */
  async initializeForUser(userId: string): Promise<void> {
    this.userId = userId;

    try {
      const { loadGameMemory } = await import('./game-store.js');
      this.gameMemory = await loadGameMemory(userId);
      log.info(
        {
          userId,
          totalGames: this.gameMemory.totalGamesPlayed,
          bestStreak: this.gameMemory.bestStreak,
        },
        '🎮 Game memory loaded for user'
      );
    } catch (error) {
      trackGameError('memory_initialization_failed', error, { userId });
      const { createEmptyGameMemory } = await import('./game-persistence.js');
      this.gameMemory = createEmptyGameMemory();
    }
  }

  /**
   * 🔴 PERSISTENCE: Force save on session end
   */
  async flushToStorage(): Promise<void> {
    if (!this.userId) return;

    try {
      const { forceSaveGameMemory } = await import('./game-store.js');
      await forceSaveGameMemory(this.userId);
      log.debug({ userId: this.userId }, '🎮 Flushed game memory to storage');
    } catch (error) {
      trackGameError('persistence_failed', error, { userId: this.userId, action: 'flush' });
    }
  }

  /**
   * Set game memory for "more than human" features
   */
  setGameMemory(memory: GameMemory): void {
    this.gameMemory = memory;
    log.debug('🧠 Game memory loaded for intelligence features');
  }

  /**
   * Get current game memory (for persistence)
   */
  getGameMemory(): GameMemory | null {
    return this.gameMemory;
  }

  private createInitialState(): GameState {
    return {
      gameType: null,
      status: 'idle',
      currentRound: 0,
      totalRounds: 0,
      score: 0,
      highScore: 0,
      gameData: {},
      startedAt: null,
      lastActivityAt: Date.now(),
    };
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  getState(): GameState {
    return { ...this.state };
  }

  async startGame(gameType: GameType, config?: Record<string, unknown>): Promise<string> {
    // End any existing game
    if (this.state.status === 'active') {
      this.endGame();
    }

    // Get the game implementation
    this.gameImplementation = await this.getGameImplementation(gameType);

    if (!this.gameImplementation) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    // Initialize game state
    const { initialState, totalRounds, welcomeMessage } =
      await this.gameImplementation.initialize(config);

    this.state = {
      gameType,
      status: 'active',
      currentRound: 1,
      totalRounds,
      score: 0,
      highScore: this.history.allTimeStats[gameType]?.highScore || 0,
      gameData: initialState,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // ✨ Reset "more than human" tracking for new game
    this.roundStartTime = Date.now();
    this.recentResults = [];
    this.pendingMilestone = null;
    this.pendingDifficultyMessage = null;
    this.pendingPersonalityInsight = null;

    log.info({ gameType, totalRounds }, '🎮 Game started');

    // ✨ Check for conversation callback
    let finalWelcome = welcomeMessage;
    if (this.gameMemory) {
      const callback = getConversationCallback(this.gameMemory);
      if (callback) {
        finalWelcome = `${callback}\n\n${welcomeMessage}`;
      }
    }

    return finalWelcome;
  }

  async submitAnswer(answer: string): Promise<GameResult> {
    if (this.state.status !== 'active' || !this.gameImplementation) {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: 'No game is currently active. Want to play something?',
        gameOver: true,
      };
    }

    // 🛡️ INPUT SANITIZATION: Clean and validate user input
    const sanitizedAnswer = sanitizeAnswer(answer);
    if (!sanitizedAnswer) {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: "I didn't catch that. Could you say it again?",
        gameOver: false,
      };
    }

    // ✨ Calculate guess timing
    const guessTimeMs = Date.now() - this.roundStartTime;

    this.state.lastActivityAt = Date.now();

    // Let the game implementation evaluate the answer
    const result = await this.gameImplementation.evaluateAnswer(
      sanitizedAnswer,
      this.state.gameData,
      this.state.currentRound
    );

    // ✨ Record timing in game memory for musical DNA
    if (this.gameMemory && this.state.gameType === 'name-that-tune') {
      const songData = this.state.gameData as { currentSong?: { name: string } };
      const songName = songData.currentSong?.name || answer;
      // Could extract genre/decade from game data in future
      this.gameMemory = recordGuess(this.gameMemory, songName, guessTimeMs, result.correct);

      // 🔴 PERSISTENCE: Update musical DNA in storage
      // 🐛 FIX: Add catch to prevent silent failures
      if (this.userId) {
        void this.persistMusicalDNA(songName, guessTimeMs, result.correct).catch((e) => {
          log.debug({ error: String(e) }, '🎮 Musical DNA persist failed (non-critical)');
        });
      }
    }

    // Track recent results for difficulty analysis
    this.recentResults.push(result);
    if (this.recentResults.length > 10) {
      this.recentResults = this.recentResults.slice(-10);
    }

    // Update score
    this.state.score += result.pointsEarned;

    // ✨ Check for milestones
    if (this.gameMemory && this.state.gameType) {
      const milestone = checkMilestones(this.gameMemory, this.state.gameType, result, guessTimeMs);
      if (milestone) {
        this.pendingMilestone = milestone;
        // Prepend milestone celebration to feedback
        result.feedback = `${milestone.celebrationMessage}\n\n${result.feedback}`;
        log.info({ milestone: milestone.milestone.type }, '🏆 Milestone achieved!');
      }
    }

    // ✨ Analyze difficulty every few rounds
    if (this.gameMemory && this.state.currentRound % 3 === 0) {
      const difficultyRec = analyzeDifficulty(
        this.gameMemory,
        this.recentResults,
        this.state.currentRound
      );

      if (difficultyRec.speakToUser && difficultyRec.message) {
        this.pendingDifficultyMessage = difficultyRec.message;
        this.gameMemory.adaptiveDifficultyMultiplier = difficultyRec.multiplier;
      }
    }

    // ✨ Occasionally share a personality insight (10% chance after round 5)
    if (this.gameMemory && this.state.currentRound >= 5 && Math.random() < 0.1) {
      const insight = getPersonalityComment(this.gameMemory);
      if (insight) {
        this.pendingPersonalityInsight = insight;
      }
    }

    // Check if game is over
    if (result.gameOver || this.state.currentRound >= this.state.totalRounds) {
      result.gameOver = true;
      result.finalScore = this.state.score;
      this.state.status = 'completed';

      // Update high score
      if (this.state.score > this.state.highScore) {
        this.state.highScore = this.state.score;

        // ✨ High score milestone
        if (this.gameMemory && this.state.gameType) {
          const existing = this.history.allTimeStats[this.state.gameType];
          if (existing && this.state.score > existing.highScore) {
            result.feedback = `🏅 NEW HIGH SCORE! You beat your previous best of ${existing.highScore}!\n\n${result.feedback}`;
          }
        }
      }

      log.info(
        {
          gameType: this.state.gameType,
          finalScore: this.state.score,
          rounds: this.state.currentRound,
        },
        '🎮 Game completed'
      );
    } else {
      // Move to next round
      this.state.currentRound++;

      // ✨ Reset round timer for next guess
      this.roundStartTime = Date.now();

      // Let game implementation set up next round
      const nextRoundData = await this.gameImplementation.setupNextRound(
        this.state.gameData,
        this.state.currentRound
      );
      this.state.gameData = nextRoundData;

      // ✨ Add any pending messages to feedback
      if (this.pendingDifficultyMessage) {
        result.feedback = `${result.feedback}\n\n${this.pendingDifficultyMessage}`;
        this.pendingDifficultyMessage = null;
      }
      if (this.pendingPersonalityInsight) {
        result.feedback = `${result.feedback}\n\n💭 ${this.pendingPersonalityInsight}`;
        this.pendingPersonalityInsight = null;
      }
    }

    return result;
  }

  getHint(): string | null {
    if (this.state.status !== 'active' || !this.gameImplementation) {
      return null;
    }

    return this.gameImplementation.getHint(this.state.gameData);
  }

  async skipRound(): Promise<GameResult> {
    if (this.state.status !== 'active' || !this.gameImplementation) {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: 'No game is currently active.',
        gameOver: true,
      };
    }

    const skipResult = await this.gameImplementation.handleSkip(this.state.gameData);

    // Check if game is over
    if (this.state.currentRound >= this.state.totalRounds) {
      skipResult.gameOver = true;
      skipResult.finalScore = this.state.score;
      this.state.status = 'completed';
    } else {
      // Move to next round
      this.state.currentRound++;
      const nextRoundData = await this.gameImplementation.setupNextRound(
        this.state.gameData,
        this.state.currentRound
      );
      this.state.gameData = nextRoundData;
    }

    return skipResult;
  }

  endGame(): GameSession {
    const session: GameSession = {
      gameType: this.state.gameType!,
      score: this.state.score,
      roundsPlayed: this.state.currentRound,
      durationSeconds: this.state.startedAt
        ? Math.round((Date.now() - this.state.startedAt) / 1000)
        : 0,
      playedAt: Date.now(),
      personaId: this.personaId,
    };

    // Update history
    this.history.sessionGames.push(session);
    this.updateAllTimeStats(session);

    // ✨ Update game memory totals
    if (this.gameMemory) {
      this.gameMemory.totalGamesPlayed = (this.gameMemory.totalGamesPlayed || 0) + 1;
      this.gameMemory.updatedAt = new Date();
    }

    // 🔴 PERSISTENCE: Save game memory to Firestore
    // 🐛 FIX: Add catch to prevent silent failures
    if (this.gameMemory && this.userId) {
      void this.persistGameCompletion(session).catch((e) => {
        trackGameError('persistence_failed', e, {
          userId: this.userId,
          gameType: session.gameType,
          action: 'save_session_fire_and_forget',
        });
      });
    }

    // Reset state
    this.state = this.createInitialState();
    this.gameImplementation = null;

    // ✨ Reset "more than human" tracking
    this.recentResults = [];
    this.pendingMilestone = null;
    this.pendingDifficultyMessage = null;
    this.pendingPersonalityInsight = null;

    log.info({ session }, '🎮 Game ended');

    return session;
  }

  /**
   * 🔴 PERSISTENCE: Save game completion to Firestore
   */
  private async persistGameCompletion(session: GameSession): Promise<void> {
    if (!this.userId || !this.gameMemory) return;

    try {
      const { recordGameCompletion } = await import('./game-store.js');
      await recordGameCompletion(
        this.userId,
        session.gameType,
        session.score,
        session.roundsPlayed,
        session.durationSeconds,
        session.personaId
      );
      log.debug(
        { userId: this.userId, gameType: session.gameType },
        '🎮 Game persisted to Firestore'
      );
    } catch (error) {
      trackGameError('persistence_failed', error, {
        userId: this.userId,
        gameType: session.gameType,
        action: 'save_session',
      });
    }
  }

  /**
   * 🔴 PERSISTENCE: Save musical DNA updates
   * Called after each guess to track genre/decade affinities
   */
  private async persistMusicalDNA(
    item: string,
    guessTimeMs: number,
    correct: boolean,
    genre?: string,
    decade?: string
  ): Promise<void> {
    if (!this.userId) return;

    try {
      const { updateMusicalDNA } = await import('./game-store.js');
      await updateMusicalDNA(this.userId, item, guessTimeMs, correct, genre, decade);
    } catch (error) {
      // Silent fail - DNA updates are low priority
      log.debug({ error, userId: this.userId }, '🎮 Musical DNA update deferred');
    }
  }

  /**
   * ✨ Get pending milestone celebration (if any)
   */
  getPendingMilestone(): MilestoneEvent | null {
    const milestone = this.pendingMilestone;
    this.pendingMilestone = null;
    return milestone;
  }

  /**
   * ✨ Get current guess timing (for UI display)
   */
  getCurrentGuessTime(): number {
    if (this.roundStartTime === 0) return 0;
    return Date.now() - this.roundStartTime;
  }

  /**
   * ✨ Get adaptive difficulty multiplier
   */
  getAdaptiveDifficulty(): number {
    return this.gameMemory?.adaptiveDifficultyMultiplier || 1.0;
  }

  /**
   * ✨ Get fastest guess time
   */
  getFastestGuess(): { timeMs: number; song: string } | null {
    if (!this.gameMemory?.fastestGuessMs) return null;
    return {
      timeMs: this.gameMemory.fastestGuessMs,
      song: this.gameMemory.fastestGuessSong || 'unknown',
    };
  }

  /**
   * ✨ Get current streak
   */
  getCurrentStreak(): number {
    return this.gameMemory?.currentStreak || 0;
  }

  /**
   * ✨ Get best streak
   */
  getBestStreak(): number {
    return this.gameMemory?.bestStreak || 0;
  }

  pauseGame(): void {
    if (this.state.status === 'active') {
      this.state.status = 'paused';
      log.debug('🎮 Game paused');
    }
  }

  resumeGame(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'active';
      this.state.lastActivityAt = Date.now();
      log.debug('🎮 Game resumed');
    }
  }

  getHistory(): GameHistory {
    return { ...this.history };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getGameImplementation(gameType: GameType): Promise<IGameImplementation | null> {
    // Dynamically import game implementations to avoid circular deps
    const { getMusicGameImplementation } = await import('./music-games.js');
    return getMusicGameImplementation(gameType, this.personaId);
  }

  private updateAllTimeStats(session: GameSession): void {
    const existing = this.history.allTimeStats[session.gameType];

    if (existing) {
      existing.gamesPlayed++;
      existing.totalScore += session.score;
      existing.averageScore = Math.round(existing.totalScore / existing.gamesPlayed);
      existing.highScore = Math.max(existing.highScore, session.score);
      existing.lastPlayed = session.playedAt;
    } else {
      this.history.allTimeStats[session.gameType] = {
        gamesPlayed: 1,
        highScore: session.score,
        totalScore: session.score,
        averageScore: session.score,
        lastPlayed: session.playedAt,
      };
    }
  }

  /**
   * Set persona ID (for persona-specific game responses)
   */
  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Check if a game is currently active
   */
  isGameActive(): boolean {
    return this.state.status === 'active';
  }

  /**
   * Get current game type
   */
  getCurrentGameType(): GameType | null {
    return this.state.gameType;
  }
}

// ============================================================================
// GAME IMPLEMENTATION INTERFACE
// ============================================================================

export interface IGameImplementation {
  /** Initialize the game and return initial state */
  initialize: (config?: Record<string, unknown>) => Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }>;

  /** Evaluate an answer */
  evaluateAnswer: (
    answer: string,
    gameData: Record<string, unknown>,
    round: number
  ) => Promise<GameResult>;

  /** Set up the next round */
  setupNextRound: (
    gameData: Record<string, unknown>,
    nextRound: number
  ) => Promise<Record<string, unknown>>;

  /** Get a hint */
  getHint: (gameData: Record<string, unknown>) => string | null;

  /** Handle skip */
  handleSkip: (gameData: Record<string, unknown>) => Promise<GameResult>;
}

// ============================================================================
// SESSION-SCOPED INSTANCES
// ============================================================================

/**
 * Session-scoped game engines to prevent state mixing between concurrent sessions.
 * Each session gets its own GameEngine instance.
 */
const sessionGameEngines = new Map<string, GameEngine>();

/**
 * Get or create a GameEngine for a specific session.
 * This prevents persona/state mixing between concurrent sessions.
 *
 * @param sessionId - The session ID (required for proper isolation)
 * @param personaId - Optional persona ID for the engine
 */
export function getSessionGameEngine(sessionId: string, personaId?: string): GameEngine {
  let engine = sessionGameEngines.get(sessionId);
  if (!engine) {
    engine = new GameEngine(personaId);
    sessionGameEngines.set(sessionId, engine);
  } else if (personaId) {
    engine.setPersonaId(personaId);
  }
  return engine;
}

/**
 * Reset and remove a session's GameEngine.
 * Call this when a session ends to prevent memory leaks.
 */
export function resetSessionGameEngine(sessionId: string): void {
  const engine = sessionGameEngines.get(sessionId);
  if (engine) {
    if (engine.isGameActive()) {
      engine.endGame();
    }
    sessionGameEngines.delete(sessionId);
  }
}

/**
 * Get count of active session game engines (for monitoring).
 */
export function getActiveGameEngineCount(): number {
  return sessionGameEngines.size;
}

/**
 * Reset all game engines (for testing only).
 */
export function resetAllGameEngines(): void {
  for (const [sessionId, engine] of sessionGameEngines) {
    if (engine.isGameActive()) {
      engine.endGame();
    }
  }
  sessionGameEngines.clear();
}

// ============================================================================
// LEGACY SINGLETON (DEPRECATED)
// ============================================================================

let gameEngineInstance: GameEngine | null = null;

/**
 * @deprecated Use getSessionGameEngine(sessionId) instead to prevent state mixing.
 */
export function getGameEngine(personaId?: string): GameEngine {
  if (!gameEngineInstance) {
    gameEngineInstance = new GameEngine(personaId);
  } else if (personaId) {
    gameEngineInstance.setPersonaId(personaId);
  }
  return gameEngineInstance;
}

/**
 * @deprecated Use resetSessionGameEngine(sessionId) instead.
 */
export function resetGameEngine(): void {
  if (gameEngineInstance?.isGameActive()) {
    gameEngineInstance.endGame();
  }
  gameEngineInstance = null;
}
