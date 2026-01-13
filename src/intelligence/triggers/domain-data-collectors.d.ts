/**
 * Domain Data Collectors
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Collectors for each persona's domain that gather relevant data
 * for life context synthesis.
 *
 * Each collector:
 * - Pulls data from the appropriate service (when available)
 * - Computes stress/wellness indicators
 * - Returns domain-specific snapshot data
 * - Gracefully returns null if data unavailable
 *
 * NOTE: These collectors are designed to be resilient. If a service
 * doesn't exist yet, they will return null rather than failing.
 *
 * @module domain-data-collectors
 */
import type { SleepDomainData, CalendarDomainData, FinanceDomainData, GoalsDomainData, RelationshipDomainData, HabitsDomainData, DomainDataCollector } from './life-context-snapshot.js';
/**
 * Cache TTL configuration by domain
 * Different domains have different update frequencies
 */
declare const CACHE_TTL_MS: {
    readonly sleep: number;
    readonly calendar: number;
    readonly finance: number;
    readonly goals: number;
    readonly relationships: number;
    readonly habits: number;
};
type DomainType = keyof typeof CACHE_TTL_MS;
/**
 * Clear cache for a specific user and domain
 */
export declare function clearDomainCache(userId: string, domain?: DomainType): void;
/**
 * Clear entire cache (useful for tests)
 */
export declare function clearAllDomainCaches(): void;
/**
 * Get cache statistics
 */
export declare function getDomainCacheStats(): {
    totalEntries: number;
    entriesByDomain: Record<string, number>;
    oldestEntryAge: number | null;
};
/**
 * Collect sleep-related data from health summaries and conversation history
 * Uses real health data when available, falls back to conversation signals
 */
export declare const sleepDataCollector: DomainDataCollector<SleepDomainData>;
/**
 * Collect calendar-related data from the calendar service
 */
export declare const calendarDataCollector: DomainDataCollector<CalendarDomainData>;
/**
 * Collect finance-related signals from conversation history
 * Note: We don't access actual financial data, only conversation signals
 */
export declare const financeDataCollector: DomainDataCollector<FinanceDomainData>;
/**
 * Collect goal-related data from conversation and memory
 * NOTE: Full implementation pending milestones service
 */
export declare const goalsDataCollector: DomainDataCollector<GoalsDomainData>;
/**
 * Collect relationship and existential data from conversation history
 */
export declare const relationshipDataCollector: DomainDataCollector<RelationshipDomainData>;
/**
 * Collect habit tracking data for overall wellness picture
 * NOTE: Full implementation pending habit tracking service
 */
export declare const habitsDataCollector: DomainDataCollector<HabitsDomainData>;
/**
 * All available domain data collectors
 */
export declare const domainCollectors: {
    readonly sleep: DomainDataCollector<SleepDomainData>;
    readonly calendar: DomainDataCollector<CalendarDomainData>;
    readonly finance: DomainDataCollector<FinanceDomainData>;
    readonly goals: DomainDataCollector<GoalsDomainData>;
    readonly relationships: DomainDataCollector<RelationshipDomainData>;
    readonly habits: DomainDataCollector<HabitsDomainData>;
};
/**
 * Collect all domain data for a user
 * Uses tiered caching to avoid repeated expensive lookups
 */
export declare function collectAllDomainData(userId: string, windowDays?: number, options?: {
    bypassCache?: boolean;
}): Promise<{
    sleep: SleepDomainData | null;
    calendar: CalendarDomainData | null;
    finance: FinanceDomainData | null;
    goals: GoalsDomainData | null;
    relationships: RelationshipDomainData | null;
    habits: HabitsDomainData | null;
    cacheStats?: {
        hits: number;
        misses: number;
    };
}>;
export {};
//# sourceMappingURL=domain-data-collectors.d.ts.map