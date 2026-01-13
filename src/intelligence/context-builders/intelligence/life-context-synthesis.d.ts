/**
 * Life Context Synthesis Context Builder
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * "Better Than Human" - Responds to LIFE CONTEXT, not just words.
 *
 * This builder injects cross-domain awareness that no human friend
 * could consistently provide. It synthesizes signals from all personas'
 * domains to understand the user's full life situation.
 *
 * Example pattern detection:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Ferni surfaces: "You're carrying a lot right now"
 *
 * @module LifeContextSynthesis
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import type { LifeContextSnapshot, SynthesisTrigger } from '../../triggers/index.js';
/**
 * Check if we should surface life context this turn
 */
declare function shouldSurfaceThisTurn(sessionId: string, turnCount: number): boolean;
/**
 * Format trigger for injection
 */
declare function formatTriggerGuidance(trigger: SynthesisTrigger): string;
/**
 * Format patterns for injection
 */
declare function formatPatternGuidance(patterns: LifeContextSnapshot['patterns']): string;
export declare const lifeContextSynthesisBuilder: {
    name: string;
    description: string;
    priority: number;
    category: BuilderCategory;
    build: (input: ContextBuilderInput) => Promise<ContextInjection[]>;
};
export { shouldSurfaceThisTurn, formatTriggerGuidance, formatPatternGuidance };
/**
 * Clear surfacing history (for testing)
 */
export declare function clearLifeContextSurfacingHistory(): void;
//# sourceMappingURL=life-context-synthesis.d.ts.map