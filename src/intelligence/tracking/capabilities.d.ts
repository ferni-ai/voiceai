/**
 * Capability Learning System
 *
 * Tracks which capability mentions lead to engagement, feeding into
 * the collective learning system to improve domain fluency over time.
 *
 * This implements the "Community Learning" layer from COLLECTIVE-LEARNING.md:
 * - Aggregates anonymized learning signals across users
 * - Discovers which capability framings resonate best
 * - Feeds back into domain fluency context builder
 *
 * > "Better than human" = learning from every conversation to get smarter
 *
 * @module intelligence/capability-learning
 */
/**
 * Aggregated effectiveness pattern across all users
 */
export interface CapabilityPattern {
    /** Domain name */
    domain: string;
    /** How often this domain is surfaced */
    surfaceCount: number;
    /** How often users engage after surfacing */
    engagementCount: number;
    /** How often a tool is actually used */
    toolUseCount: number;
    /** Engagement rate (engagementCount / surfaceCount) */
    engagementRate: number;
    /** Tool use rate (toolUseCount / surfaceCount) */
    toolUseRate: number;
    /** Best emotional contexts for this domain */
    bestEmotionalContexts: Array<{
        emotion: string;
        engagementRate: number;
    }>;
    /** Best personas for surfacing this domain */
    bestPersonas: Array<{
        personaId: string;
        engagementRate: number;
    }>;
    /** Sample size (for confidence) */
    sampleSize: number;
    /** Last updated */
    lastUpdated: Date;
}
/**
 * Track which domains were recently surfaced for a session
 * Called from domain-fluency builder when domains are surfaced
 */
export declare function trackSurfacedDomains(sessionKey: string, domains: string[]): void;
/**
 * Get domains that were recently surfaced (within last 30 seconds)
 * Used by engagement detection to know what capabilities user might be responding to
 */
export declare function getRecentlySurfacedDomains(sessionKey: string): string[];
/**
 * Called when a session ends - aggregates learning data
 */
export declare function finalizeSessionLearning(sessionKey: string, userId: string): Promise<void>;
/**
 * Called when user engages with a capability domain
 * (e.g., asks follow-up questions, expresses interest)
 */
export declare function onUserEngagedWithCapability(sessionKey: string, domain: string): void;
/**
 * Called when a tool is used in a domain
 * (e.g., playMusic called after music capability surfaced)
 */
export declare function onToolUsedInDomain(sessionKey: string, domain: string): void;
/**
 * Called when any tool is executed - auto-maps to domain
 */
export declare function onToolExecuted(sessionKey: string, toolName: string): void;
/**
 * Get the most effective domains overall
 */
export declare function getMostEffectiveDomains(limit?: number): CapabilityPattern[];
/**
 * Get best emotional context for a domain
 */
export declare function getBestEmotionalContext(domain: string): string | null;
/**
 * Get best persona for a domain
 */
export declare function getBestPersonaForDomain(domain: string): string | null;
/**
 * Get engagement rate for a domain
 */
export declare function getDomainEngagementRate(domain: string): number;
/**
 * Get all patterns (for debugging/admin)
 */
export declare function getAllPatterns(): CapabilityPattern[];
/**
 * Save aggregate patterns to Firestore
 */
export declare function persistPatterns(): Promise<void>;
/**
 * Load aggregate patterns from Firestore
 */
export declare function loadPatterns(): Promise<void>;
/**
 * Initialize the capability learning system
 */
export declare function initializeCapabilityLearning(): Promise<void>;
declare const _default: {
    finalizeSessionLearning: typeof finalizeSessionLearning;
    onUserEngagedWithCapability: typeof onUserEngagedWithCapability;
    onToolUsedInDomain: typeof onToolUsedInDomain;
    onToolExecuted: typeof onToolExecuted;
    getMostEffectiveDomains: typeof getMostEffectiveDomains;
    getBestEmotionalContext: typeof getBestEmotionalContext;
    getBestPersonaForDomain: typeof getBestPersonaForDomain;
    getDomainEngagementRate: typeof getDomainEngagementRate;
    getAllPatterns: typeof getAllPatterns;
    initializeCapabilityLearning: typeof initializeCapabilityLearning;
};
export default _default;
//# sourceMappingURL=capabilities.d.ts.map