/**
 * Dynamic Speech Guidance Context Builder
 *
 * REPLACES static phrase pools with LLM behavioral guidance.
 *
 * Philosophy:
 * - Don't give the LLM phrases to repeat
 * - Guide it on INTENT and let it generate naturally
 * - Match energy and context, not templates
 *
 * This replaces:
 * - natural-tool-calling.ts (PRE_CALL_PHRASES, THINKING_SOUNDS)
 * - tool-fillers.ts (TOOL_FILLERS)
 * - authentic-thinking.ts (personaThinkingPhrases)
 * - processing-intelligence.ts (PROCESSING_PHRASES)
 * - physical-presence.json (coffee_references)
 *
 * @module DynamicSpeechGuidance
 */
import type { ContextBuilder } from '../core/types.js';
export declare const dynamicSpeechGuidanceBuilder: ContextBuilder;
/**
 * Record a phrase that was used (for anti-repetition)
 */
export declare function recordUsedPhrase(sessionId: string, phrase: string): void;
/**
 * Check if a phrase was recently used
 */
export declare function wasRecentlyUsed(sessionId: string, phrase: string): boolean;
/**
 * Clear phrase history for a session
 */
export declare function clearPhraseHistory(sessionId: string): void;
/**
 * Get anti-repetition guidance based on recent phrases
 */
export declare function getAntiRepetitionGuidance(sessionId: string): string | null;
export default dynamicSpeechGuidanceBuilder;
//# sourceMappingURL=dynamic-speech-guidance.d.ts.map