/**
 * 📖 Story Builder Implementation
 *
 * Collaborative storytelling game where players
 * take turns adding to a story.
 *
 * Voice-friendly implementation with natural conversation flow.
 */
import type { TextGameResult, StoryBuilderState } from './text-game-types.js';
export declare function createInitialState(genre?: StoryBuilderState['genre']): StoryBuilderState;
export interface StoryBuilderResult extends TextGameResult {
    newState: StoryBuilderState;
}
/**
 * Process user input (their story contribution)
 */
export declare function processInput(state: StoryBuilderState, input: string): StoryBuilderResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: StoryBuilderState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: StoryBuilderState): StoryBuilderResult;
/**
 * Get the full story so far
 */
export declare function getFullStory(state: StoryBuilderState): string;
//# sourceMappingURL=story-builder.d.ts.map