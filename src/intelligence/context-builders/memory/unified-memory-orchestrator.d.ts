/**
 * Unified Memory Orchestrator Context Builder
 *
 * This is the central memory context builder that coordinates ALL memory subsystems
 * through the MemoryOrchestrator. It provides:
 *
 * 1. Semantic memory retrieval (RAG-style)
 * 2. Associative memory triggers (human-like recall)
 * 3. Emotional threading across sessions
 * 4. Behavioral pattern awareness
 * 5. Communication preferences
 * 6. Natural reference generation
 *
 * Philosophy: Instead of multiple memory builders each injecting their own context,
 * this single builder coordinates all memory to provide coherent, deduplicated context.
 *
 * @module intelligence/context-builders/unified-memory-orchestrator
 */
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
interface UnifiedMemoryConfig {
    /** Maximum context length before truncation */
    maxContextLength: number;
    /** Enable behavioral pattern injection */
    enableBehavioralPatterns: boolean;
    /** Enable approach guidance injection */
    enableApproachGuidance: boolean;
    /** Minimum turn count before injecting callback suggestions */
    minTurnForCallbacks: number;
}
/**
 * Configure the unified memory orchestrator
 */
declare function configureUnifiedMemoryOrchestrator(newConfig: Partial<UnifiedMemoryConfig>): void;
/**
 * Build unified memory context through the orchestrator
 */
declare function buildUnifiedMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * The unified memory orchestrator context builder.
 *
 * This replaces the fragmented memory builder approach with a single,
 * coordinated memory system that:
 * - Deduplicates across all memory sources
 * - Ranks by relevance
 * - Generates natural references
 * - Tracks emotional continuity
 * - Learns communication preferences
 * - Detects behavioral patterns
 */
export declare const unifiedMemoryOrchestratorBuilder: ContextBuilder;
export { buildUnifiedMemoryContext, configureUnifiedMemoryOrchestrator, type UnifiedMemoryConfig };
export default unifiedMemoryOrchestratorBuilder;
//# sourceMappingURL=unified-memory-orchestrator.d.ts.map