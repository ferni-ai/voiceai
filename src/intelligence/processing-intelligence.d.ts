/**
 * Processing Intelligence
 *
 * UNIFIED system for composing context-aware processing expressions.
 * This replaces the scattered "thinking" phrases across multiple files:
 * - persona-phrases.ts (THINKING_FILLERS)
 * - natural-tool-calling.ts (PRE_CALL_PHRASES)
 * - meaningful-silence.ts (THINKING_OUT_LOUD)
 * - rich-disfluencies.ts (thinking_aloud)
 * - conversation-quality.ts (retry phrases)
 *
 * The key insight: Processing phrases should be COMPOSED based on context,
 * not randomly selected from pools.
 *
 * @module ProcessingIntelligence
 */
import type { ProcessingContext, ProcessingResult, ProcessingType, ProcessingWeight } from '../types/behavior-types.js';
/**
 * Base pause durations by weight (in ms)
 */
declare const BASE_PAUSES: Record<ProcessingWeight, {
    pre: number;
    post: number;
}>;
/**
 * @deprecated REMOVED - LLM generates natural speech from behavioral guidance
 * Kept for backward compatibility, returns empty strings.
 */
declare const PROCESSING_PHRASES: Record<ProcessingType, Record<ProcessingWeight, string[]>>;
/**
 * Avatar expressions to show during processing
 */
declare const AVATAR_EXPRESSIONS: Record<ProcessingType, string>;
/**
 * Compose a context-aware processing expression
 *
 * This is the main entry point that replaces all the scattered processing phrases.
 * Instead of randomly selecting from a pool, it COMPOSES the right response
 * based on multiple contextual dimensions.
 *
 * @param ctx - Processing context with trigger, weight, emotional state, etc.
 * @returns ProcessingResult with phrase, pauses, and avatar expression
 *
 * @example
 * ```typescript
 * const result = composeProcessingExpression({
 *   trigger: 'emotional',
 *   weight: 'heavy',
 *   emotionalState: { primary: 'sad', intensity: 0.8 },
 *   relationshipStage: 'established',
 *   hourOfDay: 23,
 * });
 *
 * // result.phrase: "That's heavy."
 * // result.prePause: 560 (base 400 * 1.4 late night)
 * // result.avatarExpression: "empathy"
 * ```
 */
export declare function composeProcessingExpression(ctx: ProcessingContext): ProcessingResult;
/**
 * Format a processing result as SSML
 */
export declare function formatProcessingAsSSML(result: ProcessingResult): string;
/**
 * Quick helper for tool calls
 */
export declare function getToolCallProcessing(toolName: string, weight?: ProcessingWeight): ProcessingResult;
/**
 * Quick helper for emotional processing
 */
export declare function getEmotionalProcessing(emotionalState: {
    primary: string;
    intensity: number;
}, relationshipStage?: string): ProcessingResult;
/**
 * Quick helper for thinking/reflection
 */
export declare function getThinkingProcessing(weight?: ProcessingWeight, hourOfDay?: number): ProcessingResult;
/**
 * Quick helper for memory recall
 */
export declare function getMemoryRecallProcessing(weight?: ProcessingWeight): ProcessingResult;
/**
 * Quick helper for after tool result
 * Use when processing/displaying results from a tool call
 */
export declare function getAfterToolResultProcessing(weight?: ProcessingWeight, personaId?: string): ProcessingResult;
/**
 * Quick helper for context loading
 * Use when loading persona bundles, settings, or other context
 */
export declare function getContextLoadingProcessing(weight?: ProcessingWeight): ProcessingResult;
/**
 * @deprecated REMOVED - LLM generates persona-appropriate speech naturally
 * Kept for backward compatibility, returns empty strings.
 */
declare const PERSONA_OVERRIDES: Record<string, Partial<Record<ProcessingType, Partial<Record<ProcessingWeight, string[]>>>>>;
/**
 * Get persona-specific processing expression
 */
export declare function composePersonaProcessingExpression(ctx: ProcessingContext): ProcessingResult;
/**
 * Simple API for getting a processing phrase without full context
 *
 * This is useful for integrating with legacy systems that just need
 * a phrase for a given type/weight combination.
 *
 * @param type - The processing type
 * @param weight - The processing weight
 * @returns A randomly selected phrase
 */
export declare function getProcessingPhrase(type: ProcessingType, weight: ProcessingWeight): string;
/**
 * Get a processing phrase with SSML formatting
 *
 * Convenience method that returns a complete SSML-tagged phrase
 * suitable for TTS output.
 */
export declare function getProcessingPhraseWithSSML(type: ProcessingType, weight: ProcessingWeight, options?: {
    emotionalState?: {
        primary: string;
        intensity: number;
    };
    hourOfDay?: number;
    relationshipStage?: string;
}): string;
export type { ProcessingContext, ProcessingResult };
export { AVATAR_EXPRESSIONS, BASE_PAUSES, PERSONA_OVERRIDES, PROCESSING_PHRASES };
//# sourceMappingURL=processing-intelligence.d.ts.map