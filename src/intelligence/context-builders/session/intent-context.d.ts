/**
 * Intent Context Builder
 *
 * Handles intent-based guidance:
 * - Intent-based response guidance
 * - Acknowledgment before advice
 * - Phase-aware guidance
 * - Relationship context
 *
 * These shape the response based on what user wants.
 *
 * Extracted from jack-bogle.ts lines 1007-1051, 1188-1194
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Get acknowledgment phrase before giving advice
 */
declare function getAcknowledgmentBeforeAdvice(emotion: string): string;
/**
 * Build intent-related context injections
 */
declare function buildIntentContext(input: ContextBuilderInput): ContextInjection[];
export { buildIntentContext, getAcknowledgmentBeforeAdvice };
//# sourceMappingURL=intent-context.d.ts.map