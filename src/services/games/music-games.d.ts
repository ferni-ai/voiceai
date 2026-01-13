/**
 * 🎵 Music Games
 *
 * Implementations of music-based games.
 * Actually plays music during games using the game-music helper!
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Memory-powered song selection (picks songs based on user history)
 * - Adaptive difficulty (easier/harder based on performance)
 * - Genre/decade affinity tracking
 * - Personality-driven feedback
 */
import type { IGameImplementation } from './game-engine.js';
import type { GameType } from './types.js';
import type { GameMemory } from '../../types/user-profile.js';
/**
 * Set game memory for intelligence features
 */
export declare function setGameMemoryForGames(memory: GameMemory | null): void;
export declare function getMusicGameImplementation(gameType: GameType, personaId: string): IGameImplementation | null;
//# sourceMappingURL=music-games.d.ts.map