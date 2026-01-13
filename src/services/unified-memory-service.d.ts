/**
 * Unified Memory Service
 *
 * THE SINGLE ENTRY POINT for all memory operations in Ferni.
 *
 * This service wraps the MemoryOrchestrator and provides:
 * - Consistent API for tools, context builders, and agents
 * - Timing intelligence (when to surface memories)
 * - Learning from user reactions (what works, what doesn't)
 * - Memory lifecycle (consolidation, decay, reinforcement)
 * - Graph storage for associative memory
 *
 * Philosophy: No component should access memory storage directly.
 * Everything flows through this service, which ensures:
 * 1. Consistent context enrichment
 * 2. Proper timing decisions
 * 3. Learning from interactions
 * 4. Memory consolidation and decay
 * 5. Graph-based associative recall
 * 6. Unified telemetry
 *
 * @module services/unified-memory-service
 */
import { type OrchestratedMemory, type RecallContext } from '../memory/index.js';
import { type ConsolidationResult } from '../memory/memory-consolidator.js';
import { type MemoryLink, type SpreadingActivationResult } from '../memory/memory-graph.js';
/**
 * Timing decision for memory surfacing
 */
export interface TimingDecision {
    shouldSurface: boolean;
    reason: 'emotional_state' | 'conversation_flow' | 'low_confidence' | 'cooldown' | 'always';
    confidence: number;
    delay?: 'immediate' | 'next_pause' | 'session_end';
}
/**
 * Phrasing suggestion for natural memory integration
 */
export interface PhrasingSuggestion {
    style: 'callback' | 'anticipatory' | 'natural_weave' | 'direct';
    template?: string;
    personaVoice: boolean;
}
/**
 * Feedback for learning what works
 */
export interface MemoryFeedback {
    memoryId: string;
    userId: string;
    action: 'surfaced' | 'ignored' | 'dismissed' | 'engaged';
    context: {
        emotionalState?: string;
        conversationPhase?: string;
        personaId?: string;
    };
    timestamp: Date;
}
/**
 * Associated memory from spreading activation
 */
export interface AssociatedMemory {
    memoryId: string;
    content: string;
    activation: number;
    distance: number;
    reason: string;
    linkTypes: string[];
}
/**
 * Enhanced recall result with timing, phrasing, and associative memories
 */
export interface EnhancedRecallResult extends OrchestratedMemory {
    timing: TimingDecision;
    phrasing: PhrasingSuggestion;
    /** Associated memories from spreading activation (Better Than Human) */
    associatedMemories: AssociatedMemory[];
}
/**
 * Simple search options for tools
 */
export interface ToolSearchOptions {
    query: string;
    userId?: string;
    limit?: number;
    minScore?: number;
}
/**
 * Simplified RecallContext for service API
 * This is a convenience wrapper - internally converts to full RecallContext from memory module
 */
export interface SimpleRecallContext {
    userId: string;
    currentInput: string;
    currentEmotion?: string;
    currentTopic?: string;
    turnNumber?: number;
    sessionId?: string;
    personaId?: string;
    conversationTurn?: number;
}
export type { RecallContext } from '../memory/index.js';
/**
 * Simple memory write for tools
 */
export interface MemoryWriteInput {
    userId: string;
    content: string;
    type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone';
    importance: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
}
/**
 * The Unified Memory Service - single source of truth for all memory operations
 */
export declare class UnifiedMemoryService {
    private orchestrator;
    private timingEngine;
    private phrasingEngine;
    private feedbackCollector;
    private learningEngine;
    private consolidator;
    private decayManager;
    private memoryGraph;
    private pendingSurfacingEvents;
    constructor();
    /**
     * Main recall function with timing, phrasing, and learning intelligence
     * Used by context builders for comprehensive memory retrieval
     */
    recall(context: RecallContext): Promise<EnhancedRecallResult>;
    /**
     * Safe wrapper for getting associated memories - returns empty array on error
     */
    private safeGetAssociatedMemories;
    /**
     * Get associated memories via spreading activation from primary memories
     * This is "Better Than Human" - we can objectively traverse the memory graph
     * to find connections the user might not consciously recall
     */
    private getAssociatedMemoriesFromPrimary;
    /**
     * Simplified recall for proactive surfacing and context builders
     * This accepts a SimpleRecallContext (without requiring full UserProfile)
     */
    simpleRecall(context: SimpleRecallContext): Promise<EnhancedRecallResult>;
    /**
     * Simple semantic search - used by memory tools
     * This replaces direct calls to searchKnowledge
     */
    search(options: ToolSearchOptions): Promise<string | null>;
    /**
     * Simple memory write - used by memory tools
     * Now saves to persistent storage and auto-creates graph links!
     */
    write(input: MemoryWriteInput): Promise<{
        success: boolean;
        memoryId?: string;
        linksCreated?: number;
    }>;
    /**
     * Record feedback on memory surfacing
     */
    recordFeedback(feedback: Omit<MemoryFeedback, 'timestamp'>): void;
    /**
     * Get engagement stats for a user
     */
    getEngagementStats(userId: string): {
        total: number;
        engaged: number;
        dismissed: number;
        engagementRate: number;
    };
    /**
     * Reset session state (call at session end)
     */
    resetSession(userId: string): void;
    /**
     * Get memory health stats
     */
    getHealth(userId: string): Promise<{
        totalMemories: number;
        recentMemories: number;
        strongMemories: number;
        emotionalMemories: number;
        commitments: number;
    }>;
    /**
     * Record user's reaction to a surfaced memory
     * Call this when the user responds after we've surfaced a memory
     */
    recordLearning(userId: string, memoryId: string, userResponse: string, context?: {
        changedTopic?: boolean;
        expressedGratitude?: boolean;
        expressedDiscomfort?: boolean;
    }): Promise<void>;
    /**
     * Get learned thresholds for a user
     * Use this when deciding whether to surface memories proactively
     */
    getLearnings(userId: string): Promise<{
        hasLearnings: boolean;
        totalInteractions: number;
        successRate: number;
        topTopics: string[];
        avoidTopics: string[];
        bestPhase: string | null;
        thresholds: import("../memory/learning-engine.js").UserLearnings["adjustedThresholds"];
    }>;
    /**
     * Score a potential memory surfacing based on user learnings
     */
    scoreMemorySurfacing(userId: string, memoryContent: string, memoryType: string, memoryTopics: string[], context: {
        conversationPhase: 'opening' | 'mid' | 'closing';
        userEmotionalState: 'positive' | 'neutral' | 'negative' | 'vulnerable';
    }): Promise<{
        score: number;
        recommendation: 'surface' | 'skip' | 'defer';
        factors: Record<string, number>;
    }>;
    /**
     * Run memory consolidation for a user
     * This combines related memories into richer, consolidated representations
     * Should be run periodically (e.g., end of session, nightly)
     */
    consolidateMemories(userId: string): Promise<ConsolidationResult>;
    /**
     * Apply decay to a user's memories
     * This updates strength scores based on time and emotional weight
     * Should be run periodically (e.g., nightly)
     */
    applyDecay(userId: string): Promise<{
        memoriesDecayed: number;
        memoriesArchived: number;
        memoriesProtected: number;
    }>;
    /**
     * Reinforce a memory (user mentioned it again)
     * This boosts the memory's strength and prevents decay
     * Now persists to storage!
     */
    reinforceMemory(userId: string, memoryId: string, boostFactor?: number): Promise<{
        previousStrength: number;
        newStrength: number;
    }>;
    /**
     * Get associated memories via graph traversal
     * This enables "spreading activation" - one memory triggers related ones
     */
    getAssociatedMemories(userId: string, memoryId: string, depth?: number): Promise<SpreadingActivationResult[]>;
    /**
     * Create links for a new memory
     * Analyzes the memory and creates links to related existing memories
     * Now actually creates links in graph storage!
     */
    createMemoryLinks(userId: string, newMemoryId: string, newMemoryContent: string, newMemoryTopics?: string[]): Promise<MemoryLink[]>;
    /**
     * Run full maintenance cycle for a user
     * Call at end of session or during off-peak hours
     * Now uses deep integration that actually affects storage!
     */
    runMaintenance(userId: string): Promise<{
        consolidation: ConsolidationResult;
        decay: {
            memoriesDecayed: number;
            memoriesArchived: number;
            memoriesProtected: number;
        };
        graphLinks: number;
    }>;
    /**
     * Get a specific memory by ID
     * Used for deep signal extraction and cleanup operations
     */
    getMemory(userId: string, memoryId: string): Promise<{
        id: string;
        content: string;
        type: string;
        timestamp: Date;
        metadata?: Record<string, unknown>;
    } | null>;
    /**
     * Save a memory directly to storage
     * Used for deep signal extraction and real-time memory capture
     */
    saveMemoryDirect(userId: string, memory: {
        id?: string;
        content: string;
        type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone' | 'signal';
        emotionalWeight?: number;
        topics?: string[];
        metadata?: Record<string, unknown>;
    }): Promise<{
        success: boolean;
        memoryId: string;
    }>;
    private inferPhase;
    /**
     * Record that we're about to surface a memory (for learning)
     */
    private recordPendingSurfacing;
    /**
     * Map emotion string to learning engine's emotional state
     */
    private mapEmotionalState;
}
/**
 * Get the unified memory service singleton
 */
export declare function getUnifiedMemoryService(): UnifiedMemoryService;
/**
 * Reset the singleton (for testing)
 */
export declare function resetUnifiedMemoryService(): void;
/**
 * Get a specific memory by ID
 * Convenience wrapper around UnifiedMemoryService.getMemory
 */
export declare function getMemory(userId: string, memoryId: string): Promise<{
    id: string;
    content: string;
    type: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
} | null>;
/**
 * Save a memory directly to storage
 * Convenience wrapper around UnifiedMemoryService.saveMemoryDirect
 */
export declare function saveMemoryDirect(userId: string, memory: {
    id?: string;
    content: string;
    type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone' | 'signal';
    emotionalWeight?: number;
    topics?: string[];
    metadata?: Record<string, unknown>;
}): Promise<{
    success: boolean;
    memoryId: string;
}>;
//# sourceMappingURL=unified-memory-service.d.ts.map