/**
 * Superhuman Integration for Context Builders
 *
 * Bridges the 10 superhuman services with persona context builders.
 * Each persona can selectively use superhuman capabilities relevant to their domain.
 *
 * SUPERHUMAN CAPABILITIES:
 * 1. Commitment Keeper - Tracks promises, intentions, decisions
 * 2. Predictive Coaching - Anticipates struggles from patterns
 * 3. Life Narrative - Builds coherent story of user's journey
 * 4. Values Alignment - Tracks stated vs demonstrated values
 * 5. Emotional First Aid - Crisis protocols and grounding
 * 6. Relationship Network - Maps user's relationship ecosystem
 * 7. Capacity Guardian - Monitors energy and burnout risk
 * 8. Dream Keeper - Guards long-term aspirations
 * 9. Relationship Milestones - Celebrates Ferni journey milestones
 * 10. Seasonal Awareness - Connects patterns to seasons/cycles
 *
 * @module intelligence/context-builders/superhuman-integration
 */
import type { SuperhumanCapabilities } from '../core/shared-types.js';
export type PersonaSuperhuman = 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan';
interface SuperhumanSelectors {
    /** Which capabilities this persona should use */
    capabilities: (keyof SuperhumanCapabilities)[];
    /** Priority order (first = most important) */
    priorityOrder: (keyof SuperhumanCapabilities)[];
    /** Max tokens to inject (to avoid prompt bloat) */
    maxTokens: number;
}
declare const PERSONA_SUPERHUMAN_MAP: Record<PersonaSuperhuman, SuperhumanSelectors>;
/**
 * Get superhuman context for a specific persona.
 * Uses lazy loading to avoid importing heavy modules unless needed.
 * Includes performance tracking for monitoring.
 */
export declare function getSuperhuman(userId: string, persona: PersonaSuperhuman, options?: {
    forceRefresh?: boolean;
    crisisSignal?: string;
    currentTranscript?: string;
    currentTopics?: string[];
    currentEmotion?: string;
    currentMentionedPerson?: string;
}): Promise<string>;
/**
 * Get commitment-related superhuman context (useful for Maya, Peter)
 */
export declare function getCommitmentContext(userId: string): Promise<string>;
/**
 * Get predictive coaching context (useful for Peter, Maya)
 *
 * This now integrates THREE systems:
 * 1. Predictive coaching (temporal/emotional patterns)
 * 2. Coaching patterns (linguistic patterns)
 * 3. Superhuman observations ("only I would notice" insights)
 */
export declare function getPredictiveContext(userId: string, sessionId?: string): Promise<string>;
/**
 * Get life narrative context (useful for Nayan, Jordan)
 */
export declare function getNarrativeContext(userId: string): Promise<string>;
/**
 * Get values alignment context (useful for Nayan, Peter)
 */
export declare function getValuesContext(userId: string): Promise<string>;
/**
 * Get capacity/burnout context (useful for Maya, Alex)
 */
export declare function getCapacityContext(userId: string): Promise<string>;
/**
 * Get dream keeper context (useful for Jordan, Nayan)
 */
export declare function getDreamContext(userId: string): Promise<string>;
/**
 * Get relationship network context (useful for Alex)
 */
export declare function getNetworkContext(userId: string): Promise<string>;
/**
 * Get seasonal awareness context (useful for all)
 */
export declare function getSeasonalContext(userId: string): Promise<string>;
/**
 * Clear cached superhuman context for a user
 */
export declare function clearSuperhumanCache(userId: string): void;
/**
 * Clear all superhuman cache
 */
export declare function clearAllSuperhumanCache(): void;
/**
 * Pre-warm cache for a user (call during session start)
 * This builds context in the background so it's ready when needed.
 */
export declare function warmupSuperhumanCache(userId: string): Promise<void>;
/**
 * Get cache statistics for debugging
 */
export declare function getCacheStats(): {
    fullCacheSize: number;
    stableCacheSize: number;
    normalCacheSize: number;
    freshCacheSize: number;
};
interface PerformanceEntry {
    builderName: string;
    durationMs: number;
    userId: string;
    persona: PersonaSuperhuman;
    timestamp: number;
    cacheHit: boolean;
}
/**
 * Get performance statistics
 */
export declare function getPerformanceStats(): {
    totalCalls: number;
    averageDurationMs: number;
    cacheHitRate: number;
    slowestCall: PerformanceEntry | null;
    recentCalls: PerformanceEntry[];
};
/**
 * Clear performance log
 */
export declare function clearPerformanceLog(): void;
/**
 * Wrap a context builder with performance tracking
 */
export declare function withPerformanceTracking<T>(builderName: string, fn: () => Promise<T>, meta: {
    userId: string;
    persona: PersonaSuperhuman;
    cacheHit?: boolean;
}): Promise<T>;
export { PERSONA_SUPERHUMAN_MAP };
//# sourceMappingURL=superhuman-integration.d.ts.map