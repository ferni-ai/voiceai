/**
 * 🎮 Game Persistence Service
 *
 * Handles saving/loading game state to user profile.
 * Enables:
 * - Cross-session high scores
 * - "We played last time" memory
 * - Game history tracking
 */
import type { GameMemory, UserProfile } from '../../types/user-profile.js';
import type { GameSession, GameType } from './types.js';
/**
 * Initialize empty game memory
 */
export declare function createEmptyGameMemory(): GameMemory;
/**
 * Get game memory from user profile (or create empty)
 */
export declare function getGameMemory(userProfile?: UserProfile): GameMemory;
/**
 * Save a completed game session to user profile
 */
export declare function saveGameSession(gameMemory: GameMemory, session: GameSession, highlights?: string[]): GameMemory;
/**
 * Save a Name That Tune correct guess
 */
export declare function saveSongGuessed(gameMemory: GameMemory, songName: string): void;
/**
 * Save Desert Island picks (these are meaningful!)
 */
export declare function saveDesertIslandPicks(gameMemory: GameMemory, picks: string[]): void;
/**
 * Get a "we played before" intro based on game history
 */
export declare function getGameHistoryIntro(gameMemory: GameMemory, gameType: GameType, personaId: string): string | null;
/**
 * Get a personalized game suggestion based on history
 */
export declare function getSuggestedGame(gameMemory: GameMemory): {
    gameType: GameType;
    reason: string;
} | null;
/**
 * Update last activity timestamp
 */
export declare function updateGameActivity(): void;
/**
 * Check if game should be auto-ended due to inactivity
 */
export declare function shouldAutoEndGame(): boolean;
/**
 * Reset activity tracker
 */
export declare function resetGameActivity(): void;
/**
 * Detect topic change that suggests user has moved on from game
 * Returns true if the message seems unrelated to the game
 */
export declare function detectTopicChange(userMessage: string, activeGameType: GameType | null): boolean;
//# sourceMappingURL=game-persistence.d.ts.map