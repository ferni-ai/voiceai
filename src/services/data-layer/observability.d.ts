/**
 * Semantic Data Layer Observability
 *
 * Monitoring, metrics, and health checks for the semantic data store.
 *
 * @module data-layer/observability
 */
import type { EntityType } from './types.js';
export interface SemanticStoreMetrics {
    totalDocuments: number;
    documentsByDomain: Record<string, number>;
    documentsByEntity: Record<string, number>;
    recentIndexingOperations: IndexingOperation[];
    indexingErrors: IndexingError[];
    storageEstimateBytes: number;
    lastIndexedAt?: string;
    health: 'healthy' | 'degraded' | 'unhealthy';
}
export interface IndexingOperation {
    entityType: EntityType;
    userId: string;
    operation: 'create' | 'update' | 'delete';
    timestamp: string;
    durationMs: number;
    success: boolean;
}
export interface IndexingError {
    entityType: EntityType;
    userId: string;
    error: string;
    timestamp: string;
}
export interface SemanticStoreDiagnostics {
    vectorStoreStatus: 'connected' | 'disconnected' | 'error';
    embeddingServiceStatus: 'available' | 'unavailable';
    policyConfiguration: {
        totalEntityTypes: number;
        enabledEntityTypes: number;
        disabledEntityTypes: number;
        domainCoverage: Record<string, number>;
    };
    recentActivity: {
        last5Minutes: number;
        lastHour: number;
        last24Hours: number;
    };
    recommendations: string[];
}
declare const recentOperations: IndexingOperation[];
declare const recentErrors: IndexingError[];
/**
 * Track an indexing operation (called by store hooks)
 */
export declare function trackIndexingOperation(entityType: EntityType, userId: string, operation: 'create' | 'update' | 'delete', durationMs: number, success: boolean): void;
/**
 * Track an indexing error
 */
export declare function trackIndexingError(entityType: EntityType, userId: string, error: string): void;
/**
 * Get semantic store metrics
 */
export declare function getSemanticStoreMetrics(): Promise<SemanticStoreMetrics>;
/**
 * Get detailed diagnostics
 */
export declare function getSemanticStoreDiagnostics(): Promise<SemanticStoreDiagnostics>;
/**
 * Quick health check for the semantic data store
 */
export declare function isSemanticStoreHealthy(): Promise<boolean>;
/**
 * Get health status object (for /health endpoints)
 */
export declare function getSemanticStoreHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    details: Record<string, unknown>;
}>;
/**
 * Get all data for a monitoring dashboard
 */
export declare function getDashboardData(): Promise<{
    metrics: SemanticStoreMetrics;
    diagnostics: SemanticStoreDiagnostics;
    timestamp: string;
}>;
export { recentOperations as _recentOperations, // For testing
recentErrors as _recentErrors, };
//# sourceMappingURL=observability.d.ts.map