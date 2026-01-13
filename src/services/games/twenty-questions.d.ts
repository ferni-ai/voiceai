/**
 * 🎯 20 Questions Implementation
 *
 * Classic guessing game where the AI thinks of something
 * and the user has 20 yes/no questions to guess it.
 *
 * Voice-friendly implementation with natural conversation flow.
 */
import type { TextGameResult, TwentyQuestionsState } from './text-game-types.js';
export declare function createInitialState(category?: TwentyQuestionsState['category']): TwentyQuestionsState;
export interface TwentyQuestionsResult extends TextGameResult {
    newState: TwentyQuestionsState;
}
/**
 * Process user input (question or guess)
 */
export declare function processInput(state: TwentyQuestionsState, input: string): TwentyQuestionsResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: TwentyQuestionsState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: TwentyQuestionsState): TwentyQuestionsResult;
//# sourceMappingURL=twenty-questions.d.ts.map