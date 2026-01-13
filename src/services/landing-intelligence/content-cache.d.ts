/**
 * Landing Page Content Cache
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pre-generates and caches AI content to minimize API costs:
 *
 * - Daily batch generation (runs at 4am)
 * - Firestore persistence with TTL
 * - Edge cache headers for CDN caching
 * - Smart fallbacks for cache misses
 *
 * Cost optimization: ~$0.05/month instead of $$$$/month
 */
export interface CachedHero {
    id: string;
    eyebrow: string;
    headline: string;
    subhead: string;
    cta: string;
    context: {
        timeBlock: 'lateNight' | 'earlyMorning' | 'morning' | 'afternoon' | 'evening';
        visitorType: 'new' | 'returning' | 'loyal';
    };
    generatedAt: Date;
    expiresAt: Date;
}
export interface CachedSocialProof {
    id: string;
    messages: Array<{
        text: string;
        type: 'memory' | 'presence' | 'understanding' | 'moment';
    }>;
    generatedAt: Date;
    expiresAt: Date;
}
export interface CachedMemoryStory {
    id: string;
    theme: string;
    moments: Array<{
        date: string;
        speaker: 'user' | 'ferni';
        text: string;
    }>;
    generatedAt: Date;
    expiresAt: Date;
}
export interface CachedLateNightScenario {
    id: string;
    time: string;
    thought: string;
    limits: Array<{
        who: string;
        why: string;
    }>;
    ferniResponse: string;
    generatedAt: Date;
    expiresAt: Date;
}
export interface CachedUseCaseQuote {
    id: string;
    category: string;
    quotes: string[];
    generatedAt: Date;
    expiresAt: Date;
}
declare const CONFIG: {
    collections: {
        heroes: string;
        socialProof: string;
        memoryStories: string;
        lateNightScenarios: string;
        useCaseQuotes: string;
    };
    ttl: {
        heroes: number;
        socialProof: number;
        memoryStories: number;
        lateNightScenarios: number;
        useCaseQuotes: number;
    };
    variations: {
        heroes: number;
        socialProof: number;
        memoryStories: number;
        lateNightScenarios: number;
        useCaseQuotes: number;
    };
    cacheHeaders: {
        heroes: string;
        socialProof: string;
        memoryStories: string;
        lateNightScenarios: string;
        useCaseQuotes: string;
    };
};
/**
 * Get cached hero for context, or fallback
 */
export declare function getCachedHero(timeBlock: string, visitorType: string): Promise<CachedHero | null>;
/**
 * Get cached social proof messages
 */
export declare function getCachedSocialProof(count?: number): Promise<CachedSocialProof['messages']>;
/**
 * Get cached memory stories
 */
export declare function getCachedMemoryStories(): Promise<CachedMemoryStory[]>;
/**
 * Get cached late night scenarios
 */
export declare function getCachedLateNightScenarios(): Promise<CachedLateNightScenario[]>;
/**
 * Get cached use case quotes for a category
 */
export declare function getCachedUseCaseQuotes(category: string): Promise<string[]>;
/**
 * Generate all hero variations and cache them
 */
export declare function generateAndCacheHeroes(): Promise<number>;
/**
 * Generate social proof messages and cache them
 */
export declare function generateAndCacheSocialProof(): Promise<number>;
/**
 * Run full batch generation (call from daily cron job)
 */
export declare function runBatchGeneration(): Promise<{
    heroes: number;
    socialProof: number;
    totalCost: string;
}>;
/**
 * Get cache control header for content type
 */
export declare function getCacheControlHeader(contentType: keyof typeof CONFIG.cacheHeaders): string;
export { CONFIG as CONTENT_CACHE_CONFIG };
//# sourceMappingURL=content-cache.d.ts.map