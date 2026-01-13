/**
 * Proactive Memory Surfacing
 *
 * The crown jewel of "Better Than Human" memory. This service decides:
 * - WHEN to surface a memory (timing intelligence)
 * - WHAT to surface (relevance scoring with learning)
 * - HOW to phrase it (natural reference generation)
 * - WHETHER it landed well (feedback loop)
 *
 * Philosophy: A truly great friend doesn't just remember - they know
 * WHEN to bring something up, and HOW to say it so it lands.
 *
 * @module services/proactive-memory-surfacing
 */
import type { ExplainedMemory, ReferenceStyle } from '../memory/interfaces/index.js';
export interface SurfacingContext {
    userId: string;
    currentInput: string;
    currentEmotion?: string;
    currentTopic?: string;
    personaId: string;
    turnNumber: number;
    sessionId: string;
    recentTopics?: string[];
    personMentioned?: string;
}
export interface SurfacingDecision {
    shouldSurface: boolean;
    reason: string;
    confidence: number;
    memory?: ExplainedMemory;
    phrasing?: string;
    style?: ReferenceStyle['style'];
    decisionFactors: {
        timingScore: number;
        relevanceScore: number;
        emotionalFit: number;
        learningModifier: number;
    };
}
export interface SurfacingResult {
    decision: SurfacingDecision;
    surfacingId?: string;
    relatedMemoryIds?: string[];
}
export interface SurfacingFeedback {
    surfacingId: string;
    reaction: 'engaged' | 'grateful' | 'neutral' | 'negative';
    userResponse?: string;
    followedUp?: boolean;
}
interface SurfacingConfig {
    /** Minimum turns before proactive surfacing (default: 3) */
    minTurnsBeforeSurfacing: number;
    /** Maximum surfaces per session (default: 5) */
    maxSurfacesPerSession: number;
    /** Minimum confidence to surface (default: 0.6) */
    minConfidence: number;
    /** Cooldown between surfaces in turns (default: 4) */
    cooldownTurns: number;
    /** Weight for timing score (default: 0.3) */
    timingWeight: number;
    /** Weight for relevance score (default: 0.4) */
    relevanceWeight: number;
    /** Weight for emotional fit (default: 0.2) */
    emotionalWeight: number;
    /** Weight for learning modifier (default: 0.1) */
    learningWeight: number;
}
export declare class ProactiveMemorySurfacingService {
    private config;
    private referenceGenerator;
    private memoryGraph;
    private learningEngine;
    constructor(config?: Partial<SurfacingConfig>);
    /**
     * Decide whether and how to surface a memory
     * This is the main entry point - call on each turn
     */
    decideSurfacing(context: SurfacingContext): Promise<SurfacingResult>;
    /**
     * Record feedback on a surfacing
     */
    recordFeedback(feedback: SurfacingFeedback): Promise<void>;
    /**
     * Generate context injection for LLM
     * Call this to get the formatted injection for the prompt
     */
    generateContextInjection(result: SurfacingResult): string | null;
    private shouldAttemptSurfacing;
    private selectBestMemory;
    private getRelatedMemoryIds;
    private selectStyle;
    private generatePhrasing;
    private calculateFactors;
    private calculateEmotionalFit;
    private calculateConfidence;
    private recordPendingSurfacing;
}
export declare function getProactiveMemorySurfacing(): ProactiveMemorySurfacingService;
export declare function resetProactiveMemorySurfacing(): void;
/**
 * Reset proactive surfacing state for a specific session
 * Called at session end (P0 Integration)
 */
export declare function resetProactiveSession(sessionId: string): void;
/**
 * Build proactive memory context for LLM injection
 * This can be called from context builders
 */
export declare function buildProactiveMemoryContext(context: SurfacingContext): Promise<string | null>;
declare const _default: {
    getProactiveMemorySurfacing: typeof getProactiveMemorySurfacing;
    resetProactiveMemorySurfacing: typeof resetProactiveMemorySurfacing;
    resetProactiveSession: typeof resetProactiveSession;
    buildProactiveMemoryContext: typeof buildProactiveMemoryContext;
};
export default _default;
//# sourceMappingURL=proactive-memory-surfacing.d.ts.map