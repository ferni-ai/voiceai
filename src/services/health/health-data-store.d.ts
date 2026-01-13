/**
 * Health Data Store
 *
 * > "Better than human means knowing, not guessing."
 *
 * Privacy-first storage of health summaries.
 * We store insights, not raw health records.
 *
 * @module services/health/health-data-store
 */
import type { HealthSummary, HealthContext, HealthPreferences, HealthSyncRequest, HealthSyncResponse } from './types.js';
/**
 * Store health summary for a user
 */
export declare function storeHealthSummary(summary: HealthSummary): Promise<void>;
/**
 * Get health summary for a specific date
 */
export declare function getHealthSummary(userId: string, date: string): Promise<HealthSummary | null>;
/**
 * Get recent health summaries (last N days)
 */
export declare function getRecentHealthSummaries(userId: string, days?: number): Promise<HealthSummary[]>;
/**
 * Get user's health preferences
 */
export declare function getHealthPreferences(userId: string): Promise<HealthPreferences | null>;
/**
 * Update user's health preferences
 */
export declare function updateHealthPreferences(userId: string, preferences: Partial<HealthPreferences>): Promise<void>;
/**
 * Handle health sync from mobile app
 */
export declare function handleHealthSync(request: HealthSyncRequest): Promise<HealthSyncResponse>;
/**
 * Build health context for LLM injection
 */
export declare function buildHealthContext(userId: string): Promise<HealthContext>;
/**
 * Format health context for LLM injection
 */
export declare function getHealthContextInjection(userId: string): Promise<string>;
export declare const healthDataStore: {
    storeHealthSummary: typeof storeHealthSummary;
    getHealthSummary: typeof getHealthSummary;
    getRecentHealthSummaries: typeof getRecentHealthSummaries;
    getHealthPreferences: typeof getHealthPreferences;
    updateHealthPreferences: typeof updateHealthPreferences;
    handleHealthSync: typeof handleHealthSync;
    buildHealthContext: typeof buildHealthContext;
    getHealthContextInjection: typeof getHealthContextInjection;
};
//# sourceMappingURL=health-data-store.d.ts.map