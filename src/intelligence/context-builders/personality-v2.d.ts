/**
 * Personality v2 Context Builder
 *
 * Integrates the v2 personality system with the context builder infrastructure.
 * This provides SUPERHUMAN personality intelligence to all personas.
 *
 * Features:
 * - Anticipation (predict emotions before expressed)
 * - Timing intelligence (know when to share vs. listen)
 * - Vulnerability detection and callbacks
 * - Pattern surfacing
 * - Growth celebration
 *
 * @module intelligence/context-builders/personality-v2
 */
import { type ContextBuilderInput, type ContextInjection } from './index.js';
/**
 * Build personality context for LLM injection
 */
declare function buildPersonalityV2Context(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Register the personality v2 context builder
 *
 * Call this during application startup to enable v2 personality intelligence.
 */
export declare function registerPersonalityV2Builder(): void;
export { buildPersonalityV2Context };
//# sourceMappingURL=personality-v2.d.ts.map