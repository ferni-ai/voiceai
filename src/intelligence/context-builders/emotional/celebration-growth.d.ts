/**
 * Celebration & Growth Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates the CelebrationEngine and GrowthVisibilityEngine into
 * the context injection system. This makes celebration and growth
 * recognition AUTOMATIC, not something we have to remember to do.
 *
 * Features:
 * - Detects celebration opportunities from user messages
 * - Surfaces growth insights at appropriate moments
 * - Injects celebration/growth guidance into agent prompts
 * - Tracks what resonates with users
 *
 * @module CelebrationGrowthContext
 */
import { type CelebrationResponse, type CelebrationTrigger } from '../../../services/celebration-engine.js';
import { type GrowthReflection } from '../../../services/growth-visibility-engine.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build celebration context injections
 */
declare function buildCelebrationContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Format celebration for prompt injection
 */
declare function formatCelebrationForPrompt(trigger: CelebrationTrigger, response: CelebrationResponse): string;
/**
 * Build growth visibility context injections
 */
declare function buildGrowthContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Format growth reflection for prompt injection
 */
declare function formatGrowthForPrompt(reflection: GrowthReflection): string;
/**
 * Build celebration and growth context injections
 */
declare function buildCelebrationAndGrowthContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildCelebrationAndGrowthContext, buildCelebrationContext, buildGrowthContext, formatCelebrationForPrompt, formatGrowthForPrompt, };
declare const _default: {
    buildCelebrationContext: typeof buildCelebrationContext;
    buildGrowthContext: typeof buildGrowthContext;
    buildCelebrationAndGrowthContext: typeof buildCelebrationAndGrowthContext;
};
export default _default;
//# sourceMappingURL=celebration-growth.d.ts.map