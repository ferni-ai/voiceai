/**
 * 🎵 New Music Games - Phase 2
 *
 * - Finish the Lyric: Complete famous song lyrics
 * - Decade Challenge: Guess the era from the sound
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Curated lyric database with iconic lines
 * - Intelligent decade selection based on user's musical DNA
 * - Voice-first interaction for lyric completion
 */
import type { IGameImplementation } from './game-engine.js';
import type { GameResult } from './types.js';
import type { GameMemory } from '../../types/user-profile.js';
export declare function setGameMemoryForNewGames(memory: GameMemory | null): void;
export declare class FinishTheLyricGame implements IGameImplementation {
    private challenges;
    private currentChallengeIndex;
    private hintsUsed;
    private selectionContext;
    private correctInARow;
    initialize(config?: Record<string, unknown>): Promise<{
        initialState: Record<string, unknown>;
        totalRounds: number;
        welcomeMessage: string;
    }>;
    evaluateAnswer(answer: string, gameData: Record<string, unknown>, round: number): Promise<GameResult>;
    setupNextRound(gameData: Record<string, unknown>, nextRound: number): Promise<Record<string, unknown>>;
    getHint(gameData: Record<string, unknown>): string | null;
    handleSkip(gameData: Record<string, unknown>): Promise<GameResult>;
    private shuffleArray;
    private fuzzyMatch;
    private levenshteinDistance;
}
export declare class DecadeChallengeGame implements IGameImplementation {
    private songs;
    private currentSongIndex;
    private selectionContext;
    private correctInARow;
    initialize(config?: Record<string, unknown>): Promise<{
        initialState: Record<string, unknown>;
        totalRounds: number;
        welcomeMessage: string;
    }>;
    evaluateAnswer(answer: string, gameData: Record<string, unknown>, round: number): Promise<GameResult>;
    setupNextRound(gameData: Record<string, unknown>, nextRound: number): Promise<Record<string, unknown>>;
    getHint(gameData: Record<string, unknown>): string | null;
    handleSkip(gameData: Record<string, unknown>): Promise<GameResult>;
    private selectBalancedSongs;
    private loadPreviewUrls;
    private parseDecadeFromInput;
    private isDecadeClose;
    private shuffleArray;
}
//# sourceMappingURL=new-music-games.d.ts.map