/**
 * Memory Consolidation Service
 *
 * Periodically summarizes and consolidates trust data to prevent
 * unbounded growth while preserving the most important signals.
 *
 * Philosophy: Human memory naturally consolidates. We don't remember
 * every moment, but we remember the important ones, and patterns
 * emerge from repeated experiences.
 *
 * Consolidation strategy:
 * 1. Archive old observations after they become patterns
 * 2. Merge similar boundaries into stronger boundaries
 * 3. Summarize growth patterns into milestone markers
 * 4. Keep only the best callback moments (quality over quantity)
 * 5. Consolidate small wins into themes
 *
 * @module MemoryConsolidation
 */
export interface ConsolidationConfig {
    /** Max age in days before archiving */
    maxAgeBeforeArchiveDays: number;
    /** Min occurrences before pattern is established */
    minOccurrencesForPattern: number;
    /** Max items to keep per category */
    maxItemsPerCategory: number;
    /** Max boundaries to keep */
    maxBoundaries: number;
    /** Max growth patterns to keep */
    maxGrowthPatterns: number;
    /** Max shared moments to keep */
    maxSharedMoments: number;
    /** Max small wins to keep */
    maxSmallWins: number;
}
export interface ConsolidationResult {
    success: boolean;
    archived: {
        boundaries: number;
        growthPatterns: number;
        sharedMoments: number;
        smallWins: number;
        unsaidSignals: number;
    };
    merged: {
        boundaries: number;
        patterns: number;
    };
    summaries: {
        boundaryThemes: string[];
        growthMilestones: string[];
        relationshipHighlights: string[];
    };
    durationMs: number;
}
export interface ArchivedMemory {
    id: string;
    type: 'boundary' | 'growth' | 'moment' | 'win' | 'signal';
    originalData: unknown;
    summary: string;
    archivedAt: Date;
    occurrences: number;
}
export interface ConsolidatedProfile {
    /** Archived memories for reference */
    archive: ArchivedMemory[];
    /** Summary themes */
    themes: {
        boundaries: string[];
        growth: string[];
        relationship: string[];
        wins: string[];
    };
    /** Milestone markers */
    milestones: Array<{
        date: Date;
        type: string;
        description: string;
    }>;
    /** Last consolidation timestamp */
    lastConsolidatedAt: Date;
    /** Total items processed */
    totalItemsProcessed: number;
}
/**
 * Consolidate all trust profiles for a user (public API)
 */
export declare function consolidateTrustProfiles(userId: string, profiles: Record<string, unknown>, config?: Partial<ConsolidationConfig>): Promise<ConsolidationResult>;
/**
 * Get consolidated profile for a user (public API)
 */
export declare function getConsolidatedProfile(userId: string): ConsolidatedProfile | null;
/**
 * Get themes for context building (public API)
 */
export declare function getThemesForContext(userId: string): {
    boundaries: string[];
    growth: string[];
    relationship: string[];
    wins: string[];
} | null;
/**
 * Get milestones for reflection (public API)
 */
export declare function getMilestones(userId: string, since?: Date): Array<{
    date: Date;
    type: string;
    description: string;
}>;
/**
 * Search archive (public API)
 */
export declare function searchArchive(userId: string, query: string): ArchivedMemory[];
/**
 * Run scheduled consolidation for all active users (public API)
 */
export declare function runScheduledConsolidation(userIds: string[], profileLoader: (userId: string) => Promise<Record<string, unknown>>, config?: Partial<ConsolidationConfig>): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    totalArchived: number;
}>;
declare const _default: {
    consolidateTrustProfiles: typeof consolidateTrustProfiles;
    getConsolidatedProfile: typeof getConsolidatedProfile;
    getThemesForContext: typeof getThemesForContext;
    getMilestones: typeof getMilestones;
    searchArchive: typeof searchArchive;
    runScheduledConsolidation: typeof runScheduledConsolidation;
};
export default _default;
//# sourceMappingURL=memory-consolidation.d.ts.map