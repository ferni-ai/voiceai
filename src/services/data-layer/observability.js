/**
 * Semantic Data Layer Observability
 *
 * Monitoring, metrics, and health checks for the semantic data store.
 *
 * @module data-layer/observability
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store.js';
import { DEFAULT_INDEXING_POLICY, getPoliciesByDomain } from './indexing-policy.js';
const log = createLogger({ module: 'DataLayerObservability' });
// ============================================================================
// IN-MEMORY TRACKING (For real-time metrics)
// ============================================================================
const recentOperations = [];
const recentErrors = [];
const MAX_TRACKED_OPERATIONS = 100;
const MAX_TRACKED_ERRORS = 50;
/**
 * Track an indexing operation (called by store hooks)
 */
export function trackIndexingOperation(entityType, userId, operation, durationMs, success) {
    recentOperations.unshift({
        entityType,
        userId: userId.slice(0, 8) + '...', // Truncate for privacy
        operation,
        timestamp: new Date().toISOString(),
        durationMs,
        success,
    });
    // Trim to max size
    if (recentOperations.length > MAX_TRACKED_OPERATIONS) {
        recentOperations.length = MAX_TRACKED_OPERATIONS;
    }
}
/**
 * Track an indexing error
 */
export function trackIndexingError(entityType, userId, error) {
    recentErrors.unshift({
        entityType,
        userId: userId.slice(0, 8) + '...', // Truncate for privacy
        error: error.slice(0, 200),
        timestamp: new Date().toISOString(),
    });
    // Trim to max size
    if (recentErrors.length > MAX_TRACKED_ERRORS) {
        recentErrors.length = MAX_TRACKED_ERRORS;
    }
    log.warn({ entityType, error: error.slice(0, 100) }, 'Indexing error tracked');
}
// ============================================================================
// METRICS
// ============================================================================
/**
 * Get semantic store metrics
 */
export async function getSemanticStoreMetrics() {
    const vectorStore = getFirestoreVectorStore();
    let totalDocuments = 0;
    const documentsByDomain = {};
    const documentsByEntity = {};
    try {
        // Get stats from vector store if available
        const stats = await vectorStore.getStats?.();
        if (stats) {
            totalDocuments = stats.documentCount || 0;
        }
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to get vector store stats');
    }
    // Calculate recent activity
    const successfulOps = recentOperations.filter((op) => op.success);
    const lastIndexed = successfulOps[0]?.timestamp;
    // Determine health
    let health = 'healthy';
    const recentErrorRate = recentErrors.length / Math.max(recentOperations.length, 1);
    if (recentErrorRate > 0.2) {
        health = 'unhealthy';
    }
    else if (recentErrorRate > 0.05) {
        health = 'degraded';
    }
    return {
        totalDocuments,
        documentsByDomain,
        documentsByEntity,
        recentIndexingOperations: recentOperations.slice(0, 10),
        indexingErrors: recentErrors.slice(0, 10),
        storageEstimateBytes: totalDocuments * 1500, // ~1.5KB per doc average
        lastIndexedAt: lastIndexed,
        health,
    };
}
/**
 * Get detailed diagnostics
 */
export async function getSemanticStoreDiagnostics() {
    const vectorStore = getFirestoreVectorStore();
    // Check vector store status
    let vectorStoreStatus = 'disconnected';
    try {
        await vectorStore.initialize?.();
        vectorStoreStatus = 'connected';
    }
    catch (error) {
        vectorStoreStatus = 'error';
        log.warn({ error: String(error) }, 'Vector store connection check failed');
    }
    // Embedding service - assume available if vector store is connected
    const embeddingServiceStatus = vectorStoreStatus === 'connected' ? 'available' : 'unavailable';
    // Policy configuration
    const policy = DEFAULT_INDEXING_POLICY;
    const byDomain = getPoliciesByDomain();
    const enabledTypes = policy.entities.filter((e) => e.priority !== 'never');
    const disabledTypes = policy.entities.filter((e) => e.priority === 'never');
    const domainCoverage = {};
    for (const [domain, policies] of Object.entries(byDomain)) {
        domainCoverage[domain] = policies.length;
    }
    // Recent activity calculation
    const now = Date.now();
    const last5Min = recentOperations.filter((op) => new Date(op.timestamp).getTime() > now - 5 * 60 * 1000).length;
    const lastHour = recentOperations.filter((op) => new Date(op.timestamp).getTime() > now - 60 * 60 * 1000).length;
    const last24Hours = recentOperations.length; // We only keep 100, so approximation
    // Recommendations
    const recommendations = [];
    if (recentErrors.length > 5) {
        recommendations.push(`High error rate detected (${recentErrors.length} recent errors). Check embedding service and Firestore connectivity.`);
    }
    if (vectorStoreStatus !== 'connected') {
        recommendations.push('Vector store is not connected. Check Firestore configuration.');
    }
    const avgDuration = recentOperations.reduce((sum, op) => sum + op.durationMs, 0) /
        Math.max(recentOperations.length, 1);
    if (avgDuration > 500) {
        recommendations.push(`Average indexing duration is ${Math.round(avgDuration)}ms. Consider batching operations.`);
    }
    return {
        vectorStoreStatus,
        embeddingServiceStatus,
        policyConfiguration: {
            totalEntityTypes: policy.entities.length,
            enabledEntityTypes: enabledTypes.length,
            disabledEntityTypes: disabledTypes.length,
            domainCoverage,
        },
        recentActivity: {
            last5Minutes: last5Min,
            lastHour: lastHour,
            last24Hours: last24Hours,
        },
        recommendations,
    };
}
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Quick health check for the semantic data store
 */
export async function isSemanticStoreHealthy() {
    try {
        const metrics = await getSemanticStoreMetrics();
        return metrics.health === 'healthy';
    }
    catch {
        return false;
    }
}
/**
 * Get health status object (for /health endpoints)
 */
export async function getSemanticStoreHealth() {
    try {
        const metrics = await getSemanticStoreMetrics();
        const diagnostics = await getSemanticStoreDiagnostics();
        return {
            status: metrics.health,
            message: metrics.health === 'healthy'
                ? 'Semantic data store is operational'
                : metrics.health === 'degraded'
                    ? 'Semantic data store has some issues'
                    : 'Semantic data store has critical issues',
            details: {
                totalDocuments: metrics.totalDocuments,
                recentErrors: metrics.indexingErrors.length,
                vectorStoreStatus: diagnostics.vectorStoreStatus,
                lastIndexedAt: metrics.lastIndexedAt,
                recommendations: diagnostics.recommendations,
            },
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            message: `Failed to check health: ${String(error)}`,
            details: {},
        };
    }
}
// ============================================================================
// DASHBOARD DATA
// ============================================================================
/**
 * Get all data for a monitoring dashboard
 */
export async function getDashboardData() {
    const [metrics, diagnostics] = await Promise.all([
        getSemanticStoreMetrics(),
        getSemanticStoreDiagnostics(),
    ]);
    return {
        metrics,
        diagnostics,
        timestamp: new Date().toISOString(),
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { recentOperations as _recentOperations, // For testing
recentErrors as _recentErrors, // For testing
 };
//# sourceMappingURL=observability.js.map