/**
 * 🎮 Game Store
 *
 * Persistence layer for game data. Saves to EngagementProfile in Firestore.
 *
 * Responsibilities:
 * - Load game memory when session starts
 * - Save game memory after each game
 * - Save musical DNA after significant changes
 * - Handle offline/failure gracefully
 */
import type { GameMemory, MusicMemory } from '../../types/user-profile.js';
/**
 * Load game memory for a user
 * Called at session start
 */
export declare function loadGameMemory(userId: string): Promise<GameMemory>;
/**
 * Load music memory for a user
 */
export declare function loadMusicMemory(userId: string): Promise<MusicMemory | null>;
/**
 * Save game memory for a user
 * Debounced to avoid too many writes
 */
export declare function saveGameMemory(userId: string, gameMemory: GameMemory): Promise<void>;
/**
 * Save music memory for a user
 */
export declare function saveMusicMemory(userId: string, musicMemory: MusicMemory): Promise<void>;
/**
 * Force immediate save for a user (call on session end)
 */
export declare function forceSaveGameMemory(userId: string): Promise<void>;
/**
 * Get cached game memory (no async)
 * Returns null if not loaded
 */
export declare function getCachedGameMemory(userId: string): GameMemory | null;
/**
 * Update cached game memory without saving
 * Used during active games for quick updates
 */
export declare function updateCachedGameMemory(userId: string, gameMemory: GameMemory): void;
/**
 * Clear cache for a user (on session end)
 */
export declare function clearCache(userId: string): void;
/**
 * Record a game session completion
 * Handles all the persistence in one call
 */
export declare function recordGameCompletion(userId: string, gameType: string, score: number, roundsPlayed: number, durationSeconds: number, personaId: string, highlights?: string[]): Promise<void>;
/**
 * Update musical DNA (affinities)
 * Called after significant game actions
 */
export declare function updateMusicalDNA(userId: string, item: string, guessTimeMs: number, correct: boolean, genre?: string, decade?: string): Promise<void>;
/**
 * Flush all pending saves on shutdown
 */
export declare function shutdown(): Promise<void>;
//# sourceMappingURL=game-store.d.ts.map