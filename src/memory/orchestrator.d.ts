/**
 * Memory Orchestrator
 *
 * Single entry point for all memory operations.
 * Coordinates all memory subsystems to provide unified, deduplicated context.
 *
 * Philosophy: The brain doesn't have separate "semantic memory", "emotional memory",
 * and "episodic memory" departments that each send their own memo. It integrates
 * everything into a coherent stream of consciousness. This orchestrator does the same
 * for Ferni's memory.
 *
 * @module memory/orchestrator
 */
import type { MemoryOrchestrator as MemoryOrchestratorInterface, OrchestratedMemory, RecallContext, ConversationTurn } from './interfaces/index.js';
interface OrchestratorConfig {
    /** Maximum primary memories to include (default: 5) */
    maxPrimaryMemories: number;
    /** Maximum callbacks to suggest (default: 3) */
    maxCallbacks: number;
    /** Minimum score for memory inclusion (default: 0.3) */
    minMemoryScore: number;
    /** Whether to include behavioral patterns (default: true) */
    includeBehavioralPatterns: boolean;
    /** Whether to include communication preferences (default: true) */
    includeCommunicationPreferences: boolean;
}
export declare class MemoryOrchestratorImpl implements MemoryOrchestratorInterface {
    private config;
    private explainer;
    private sessionPrimer;
    private referenceGenerator;
    private signalExtractor;
    private associativeMemories;
    private commPreferences;
    private emotionalThreading;
    private patternDetectors;
    constructor(config?: Partial<OrchestratorConfig>);
    /**
     * Main recall function - coordinates all memory subsystems
     */
    recall(context: RecallContext): Promise<OrchestratedMemory>;
    /**
     * Record an interaction for memory learning
     */
    recordInteraction(context: {
        userId: string;
        turns: ConversationTurn[];
        sessionEmotion?: string;
        personaId: string;
        sessionId?: string;
        sessionEndState?: 'positive' | 'neutral' | 'heavy' | 'unresolved' | 'hopeful';
    }): Promise<void>;
    /**
     * Get memory health stats
     */
    getMemoryHealth(userId: string): Promise<{
        totalMemories: number;
        recentMemories: number;
        strongMemories: number;
        emotionalMemories: number;
        commitments: number;
    }>;
    /**
     * Gather memories from all sources
     */
    private gatherMemories;
    /**
     * Rank and deduplicate memories
     */
    private rankAndDeduplicate;
    /**
     * Categorize memories into primary and callbacks
     */
    private categorizeMemories;
    /**
     * Determine when a callback should be used
     */
    private determineCallbackTiming;
    /**
     * Get unified emotional context
     */
    private getEmotionalContext;
    /**
     * Format everything for prompt injection
     */
    private formatForPrompt;
    /**
     * Map entity type to memory item type
     */
    private mapEntityTypeToMemoryType;
    /**
     * Convert entity to memory content string
     */
    private entityToContent;
    /**
     * Map relationship stage from unified emotional memory to our interface type
     */
    private mapRelationshipStage;
    /**
     * Extract topics that seem unresolved
     */
    private extractUnresolvedTopics;
    private getAssociativeMemory;
    private getEmotionalThreading;
    private getPatternDetector;
}
export declare function getMemoryOrchestrator(): MemoryOrchestratorInterface;
export declare function resetMemoryOrchestrator(): void;
declare const _default: {
    MemoryOrchestratorImpl: typeof MemoryOrchestratorImpl;
    getMemoryOrchestrator: typeof getMemoryOrchestrator;
    resetMemoryOrchestrator: typeof resetMemoryOrchestrator;
};
export default _default;
//# sourceMappingURL=orchestrator.d.ts.map