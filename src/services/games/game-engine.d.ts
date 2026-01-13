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
import { type MilestoneEvent } from './game-intelligence.js';
import type { GameHistory, GameResult, GameSession, GameState, GameType, IGameEngine } from './types.js';
export declare class GameEngine implements IGameEngine {
    private state;
    private history;
    private personaId;
    private userId;
    private gameImplementation;
    private gameMemory;
    private roundStartTime;
    private recentResults;
    private pendingMilestone;
    private pendingDifficultyMessage;
    private pendingPersonalityInsight;
    constructor(personaId?: string);
    /**
     * Set user ID (required for persistence)
     */
    setUserId(userId: string): void;
    /**
     * Get user ID
     */
    getUserId(): string | null;
    /**
     * 🔴 PERSISTENCE: Initialize game memory for a user
     * Call this at session start to load persisted data
     */
    initializeForUser(userId: string): Promise<void>;
    /**
     * 🔴 PERSISTENCE: Force save on session end
     */
    flushToStorage(): Promise<void>;
    /**
     * Set game memory for "more than human" features
     */
    setGameMemory(memory: GameMemory): void;
    /**
     * Get current game memory (for persistence)
     */
    getGameMemory(): GameMemory | null;
    private createInitialState;
    getState(): GameState;
    startGame(gameType: GameType, config?: Record<string, unknown>): Promise<string>;
    submitAnswer(answer: string): Promise<GameResult>;
    getHint(): string | null;
    skipRound(): Promise<GameResult>;
    endGame(): GameSession;
    /**
     * 🔴 PERSISTENCE: Save game completion to Firestore
     */
    private persistGameCompletion;
    /**
     * 🔴 PERSISTENCE: Save musical DNA updates
     * Called after each guess to track genre/decade affinities
     */
    private persistMusicalDNA;
    /**
     * ✨ Get pending milestone celebration (if any)
     */
    getPendingMilestone(): MilestoneEvent | null;
    /**
     * ✨ Get current guess timing (for UI display)
     */
    getCurrentGuessTime(): number;
    /**
     * ✨ Get adaptive difficulty multiplier
     */
    getAdaptiveDifficulty(): number;
    /**
     * ✨ Get fastest guess time
     */
    getFastestGuess(): {
        timeMs: number;
        song: string;
    } | null;
    /**
     * ✨ Get current streak
     */
    getCurrentStreak(): number;
    /**
     * ✨ Get best streak
     */
    getBestStreak(): number;
    pauseGame(): void;
    resumeGame(): void;
    getHistory(): GameHistory;
    private getGameImplementation;
    private updateAllTimeStats;
    /**
     * Set persona ID (for persona-specific game responses)
     */
    setPersonaId(personaId: string): void;
    /**
     * Check if a game is currently active
     */
    isGameActive(): boolean;
    /**
     * Get current game type
     */
    getCurrentGameType(): GameType | null;
}
export interface IGameImplementation {
    /** Initialize the game and return initial state */
    initialize: (config?: Record<string, unknown>) => Promise<{
        initialState: Record<string, unknown>;
        totalRounds: number;
        welcomeMessage: string;
    }>;
    /** Evaluate an answer */
    evaluateAnswer: (answer: string, gameData: Record<string, unknown>, round: number) => Promise<GameResult>;
    /** Set up the next round */
    setupNextRound: (gameData: Record<string, unknown>, nextRound: number) => Promise<Record<string, unknown>>;
    /** Get a hint */
    getHint: (gameData: Record<string, unknown>) => string | null;
    /** Handle skip */
    handleSkip: (gameData: Record<string, unknown>) => Promise<GameResult>;
}
/**
 * Get or create a GameEngine for a specific session.
 * This prevents persona/state mixing between concurrent sessions.
 *
 * @param sessionId - The session ID (required for proper isolation)
 * @param personaId - Optional persona ID for the engine
 */
export declare function getSessionGameEngine(sessionId: string, personaId?: string): GameEngine;
/**
 * Reset and remove a session's GameEngine.
 * Call this when a session ends to prevent memory leaks.
 */
export declare function resetSessionGameEngine(sessionId: string): void;
/**
 * Get count of active session game engines (for monitoring).
 */
export declare function getActiveGameEngineCount(): number;
/**
 * Reset all game engines (for testing only).
 */
export declare function resetAllGameEngines(): void;
/**
 * @deprecated Use getSessionGameEngine(sessionId) instead to prevent state mixing.
 */
export declare function getGameEngine(personaId?: string): GameEngine;
/**
 * @deprecated Use resetSessionGameEngine(sessionId) instead.
 */
export declare function resetGameEngine(): void;
//# sourceMappingURL=game-engine.d.ts.map