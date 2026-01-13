import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Patterns that indicate a story is about to be told
 */
declare const STORY_TRIGGER_PATTERNS: RegExp[];
/**
 * User requests for stories
 */
declare const STORY_REQUEST_PATTERNS: RegExp;
/**
 * Build storytelling-related context injections
 */
declare function buildStorytellingContext(input: ContextBuilderInput): ContextInjection[];
/**
 * Reset music offer cooldown (call at session start)
 */
export declare function resetStorytellingState(): void;
export { buildStorytellingContext, STORY_TRIGGER_PATTERNS, STORY_REQUEST_PATTERNS };
//# sourceMappingURL=storytelling.d.ts.map