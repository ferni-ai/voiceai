/**
 * 🤔 Would You Rather Implementation
 *
 * Classic dilemma game presenting two choices and
 * encouraging thoughtful discussion.
 *
 * Voice-friendly implementation with natural conversation flow.
 */
import type { TextGameResult, WouldYouRatherState } from './text-game-types.js';
export declare function createInitialState(category?: WouldYouRatherState['currentCategory']): WouldYouRatherState;
export interface WouldYouRatherResult extends TextGameResult {
    newState: WouldYouRatherState;
}
/**
 * Process user input (their choice)
 */
export declare function processInput(state: WouldYouRatherState, input: string): WouldYouRatherResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: WouldYouRatherState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: WouldYouRatherState): WouldYouRatherResult;
//# sourceMappingURL=would-you-rather.d.ts.map