/**
 * 📰 Headline Writer Implementation
 *
 * A creative reflection game where users write newspaper headlines
 * about their own life - past, present, or future. The framing
 * helps create distance and perspective on life events.
 *
 * Based on narrative therapy techniques for reframing experiences.
 *
 * Perfect for: perspective-taking, life review, goal visualization
 */
import type { TextGameResult } from './text-game-types.js';
export type HeadlineTimeframe = 'today' | 'this_week' | 'this_month' | 'this_year' | 'past' | 'future' | 'dream';
export type HeadlineTone = 'triumphant' | 'honest' | 'humorous' | 'hopeful' | 'any';
export interface Headline {
    text: string;
    timeframe: HeadlineTimeframe;
    tone?: HeadlineTone;
    subheadline?: string;
}
export interface HeadlineWriterState {
    /** Current phase of the game */
    phase: 'prompt' | 'writing' | 'subheadline' | 'reflection' | 'another' | 'complete';
    /** Current prompt/timeframe */
    currentTimeframe: HeadlineTimeframe;
    /** Current tone suggestion */
    suggestedTone: HeadlineTone;
    /** Headlines written this session */
    headlines: Headline[];
    /** Current headline being crafted */
    currentHeadline?: Partial<Headline>;
    /** Round number */
    round: number;
}
export interface HeadlineWriterResult extends TextGameResult {
    newState: HeadlineWriterState;
}
export declare function createInitialState(timeframe?: HeadlineTimeframe, tone?: HeadlineTone): HeadlineWriterState;
export declare function processInput(state: HeadlineWriterState, input: string): HeadlineWriterResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: HeadlineWriterState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: HeadlineWriterState): HeadlineWriterResult;
/**
 * Get all headlines from the session (for saving)
 */
export declare function getSessionHeadlines(state: HeadlineWriterState): Headline[];
//# sourceMappingURL=headline-writer.d.ts.map