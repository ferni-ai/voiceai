/**
 * Better Than Human Memory Context Builder
 *
 * The unified memory context builder that brings together:
 * - Proactive surfacing with timing intelligence
 * - Natural phrasing for human-like callbacks
 * - Learning from feedback
 * - Graph-based association
 *
 * This replaces fragmented memory context builders with a single,
 * coherent source of memory context.
 *
 * @module intelligence/context-builders/memory/better-than-human-memory
 */
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';
interface BetterThanHumanConfig {
    minTurnForProactive: number;
    maxInjectionsPerTurn: number;
    enableGraphTraversal: boolean;
    enableLearning: boolean;
}
export declare function configureBetterThanHumanMemory(newConfig: Partial<BetterThanHumanConfig>): void;
declare function buildBetterThanHumanMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildBetterThanHumanMemoryContext, buildBetterThanHumanMemoryContext as default };
export declare const betterThanHumanMemoryBuilder: {
    name: string;
    description: string;
    build: typeof buildBetterThanHumanMemoryContext;
    priority: number;
    category: BuilderCategory;
};
//# sourceMappingURL=better-than-human-memory.d.ts.map