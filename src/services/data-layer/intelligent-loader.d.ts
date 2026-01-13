/**
 * Intelligent Data Loader
 *
 * Lazy-loads user data by domain on-demand, rather than loading everything upfront.
 * This dramatically reduces session startup time and memory usage.
 *
 * Philosophy: Load what you need, when you need it. Like a human brain,
 * we don't recall everything at once - we retrieve relevant memories.
 *
 * @module services/data-layer/intelligent-loader
 */
/**
 * Data domains that can be loaded independently
 */
export type DataDomain = 'profile' | 'habits' | 'tasks' | 'finance' | 'calendar' | 'social' | 'health' | 'coaching' | 'milestones' | 'music' | 'games' | 'trust' | 'insights' | 'intelligence';
/**
 * Domain loading configuration
 */
interface DomainConfig {
    /** Priority: 'critical' loads at session start, 'background' loads async */
    priority: 'critical' | 'background' | 'on-demand';
    /** TTL for cached domain data in ms */
    cacheTTLMs: number;
    /** Dependencies - other domains that must be loaded first */
    dependencies?: DataDomain[];
    /** Keywords that trigger this domain to load */
    triggerKeywords: string[];
    /** Max items to load (for pagination) */
    maxItems?: number;
}
/**
 * Domain loading stats for observability
 */
export interface LoaderStats {
    domainsLoaded: number;
    cacheHits: number;
    cacheMisses: number;
    totalLoadTimeMs: number;
    domainBreakdown: Record<DataDomain, {
        loaded: boolean;
        loadTimeMs: number;
    }>;
}
declare const DOMAIN_CONFIG: Record<DataDomain, DomainConfig>;
export declare class IntelligentDataLoader {
    private userId;
    private sessionId;
    private domainCache;
    private loadingPromises;
    private stats;
    constructor(userId: string, sessionId: string);
    /**
     * Initialize session - loads ONLY critical domains, others load on-demand
     */
    initializeSession(): Promise<void>;
    /**
     * Get domain data - loads on-demand if not cached
     */
    getDomain<T = unknown>(domain: DataDomain): Promise<T | null>;
    /**
     * Detect domains from user message and preload them
     * Call this BEFORE processing the user message for predictive loading
     */
    preloadFromMessage(message: string): Promise<DataDomain[]>;
    /**
     * Get loader statistics for observability
     */
    getStats(): LoaderStats;
    /**
     * Clear all cached data (call at session end)
     */
    clearCache(): void;
    /**
     * Detect which domains are relevant based on text content
     */
    detectDomainsFromText(text: string): DataDomain[];
    private getDomainsByPriority;
    private getCachedDomain;
    private isCacheValid;
    private loadDomain;
    private doLoadDomain;
    private loadProfile;
    private loadHabits;
    private loadTasks;
    private loadFinance;
    private loadCalendar;
    private loadSocialGraph;
    private loadHealth;
    private loadCoaching;
    private loadMilestones;
    private loadMusicPreferences;
    private loadGameHistory;
    private loadTrustData;
    private loadCrossPersonaInsights;
    private loadIntelligenceState;
}
/**
 * Get or create an intelligent loader for a session
 */
export declare function getIntelligentLoader(userId: string, sessionId: string): IntelligentDataLoader;
/**
 * Clean up loader for a session
 */
export declare function cleanupLoader(userId: string, sessionId: string): void;
/**
 * Clean up all loaders (for shutdown)
 */
export declare function cleanupAllLoaders(): void;
export { DOMAIN_CONFIG };
//# sourceMappingURL=intelligent-loader.d.ts.map