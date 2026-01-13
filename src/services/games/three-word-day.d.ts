/**
 * 📝 Three Word Day Implementation
 *
 * A simple but powerful reflection game where users describe
 * their day, mood, or experience in exactly three words.
 * Ferni then explores the meaning behind each word.
 *
 * Perfect for: daily check-ins, emotional awareness, pattern discovery
 */
import type { TextGameResult } from './text-game-types.js';
export interface ThreeWordDayState {
    /** The prompt type for this session */
    promptType: 'day' | 'mood' | 'week' | 'moment' | 'year' | 'custom';
    /** Custom prompt if provided */
    customPrompt?: string;
    /** The three words provided by user */
    words: string[];
    /** Which word we're currently exploring (0, 1, 2, or 'complete') */
    explorationPhase: number | 'complete';
    /** Insights gathered during exploration */
    insights: string[];
    /** Whether the game has concluded */
    concluded: boolean;
}
export interface ThreeWordDayResult extends TextGameResult {
    newState: ThreeWordDayState;
}
export declare function createInitialState(promptType?: ThreeWordDayState['promptType'], customPrompt?: string): ThreeWordDayState;
export declare function processInput(state: ThreeWordDayState, input: string): ThreeWordDayResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: ThreeWordDayState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: ThreeWordDayState): ThreeWordDayResult;
//# sourceMappingURL=three-word-day.d.ts.map