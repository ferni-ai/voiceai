/**
 * 😊 Emoji Story Implementation
 *
 * A creative expression game where users tell a story using only emojis,
 * then Ferni helps decode and explore the emotions behind them.
 *
 * Perfect for: emotional expression, creative play, bypassing verbal filters
 */
import type { TextGameResult } from './text-game-types.js';
export interface EmojiStoryState {
    /** Current phase */
    phase: 'prompt' | 'collecting' | 'decoding' | 'reflecting' | 'complete';
    /** The topic/prompt for the story */
    topic: 'day' | 'mood' | 'dream' | 'challenge' | 'relationship' | 'custom';
    /** Custom topic if provided */
    customTopic?: string;
    /** Emojis collected */
    emojis: string[];
    /** Ferni's interpretation */
    interpretation?: string;
    /** User's correction/confirmation */
    userMeaning?: string;
    /** Whether game has concluded */
    concluded: boolean;
}
export interface EmojiStoryResult extends TextGameResult {
    newState: EmojiStoryState;
}
export declare function createInitialState(topic?: EmojiStoryState['topic'], customTopic?: string): EmojiStoryState;
export declare function processInput(state: EmojiStoryState, input: string): EmojiStoryResult;
/**
 * Describe current game state for voice
 */
export declare function describeStateForVoice(state: EmojiStoryState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: EmojiStoryState): EmojiStoryResult;
/**
 * Get the emoji story (for saving)
 */
export declare function getEmojiStory(state: EmojiStoryState): {
    emojis: string[];
    meaning?: string;
};
//# sourceMappingURL=emoji-story.d.ts.map