/**
 * 🏆 Tiny Win Tracker Implementation
 *
 * A positivity practice where users identify and celebrate small victories.
 * Based on research showing that noticing small wins builds momentum
 * and improves overall wellbeing.
 *
 * Perfect for: building positivity, habit reinforcement, self-compassion
 */
import type { TextGameResult } from './text-game-types.js';
export interface TinyWin {
    text: string;
    category?: 'self-care' | 'productivity' | 'connection' | 'growth' | 'other';
    timestamp: string;
}
export interface TinyWinTrackerState {
    /** Current phase */
    phase: 'prompt' | 'collecting' | 'celebrating' | 'another' | 'complete';
    /** Wins collected this session */
    wins: TinyWin[];
    /** Current win being processed */
    currentWin?: string;
    /** Session count */
    sessionWinCount: number;
    /** Whether concluded */
    concluded: boolean;
}
export interface TinyWinTrackerResult extends TextGameResult {
    newState: TinyWinTrackerState;
}
export declare function createInitialState(): TinyWinTrackerState;
export declare function processInput(state: TinyWinTrackerState, input: string): TinyWinTrackerResult;
/**
 * Describe current state for voice
 */
export declare function describeStateForVoice(state: TinyWinTrackerState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: TinyWinTrackerState): TinyWinTrackerResult;
/**
 * Get all wins from the session (for saving)
 */
export declare function getSessionWins(state: TinyWinTrackerState): TinyWin[];
//# sourceMappingURL=tiny-win-tracker.d.ts.map