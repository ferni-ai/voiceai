/**
 * 🔗 Word Association Implementation
 *
 * A word chain game where players take turns saying words
 * that relate to the previous word.
 *
 * Voice-friendly implementation with natural conversation flow.
 */
import type { TextGameResult, WordAssociationState } from './text-game-types.js';
export declare function createInitialState(): WordAssociationState;
export interface WordAssociationResult extends TextGameResult {
    newState: WordAssociationState;
}
/**
 * Process user input (their associated word)
 */
export declare function processInput(state: WordAssociationState, input: string): WordAssociationResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: WordAssociationState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: WordAssociationState): WordAssociationResult;
//# sourceMappingURL=word-association.d.ts.map