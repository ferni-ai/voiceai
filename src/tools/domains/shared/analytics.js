/**
 * Tool Usage Analytics
 *
 * Tracks tool usage for monitoring, debugging, and optimization.
 * Designed to be lightweight and non-blocking.
 *
 * PERSISTENCE: Uses Firestore for analytics storage with in-memory caching.
 *
 * USAGE:
 *   import { trackToolUsage, getToolMetrics } from '../shared/analytics.js';
 *
 *   execute: async (params, { ctx: toolCtx }) => {
 *     const tracker = trackToolUsage('logExercise', 'health');
 *     try {
 *       // ... tool logic
 *       tracker.success();
 *     } catch (error) {
 *       tracker.error(error);
 *       throw error;
 *     }
 *   }
 */
import admin from 'firebase-admin';
import { getLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
// ============================================================================
// FIRESTORE SETUP
// ============================================================================
const EVENTS_COLLECTION = 'tool_analytics_events';
const METRICS_COLLECTION = 'tool_analytics_metrics';
let firestoreInstance = null;
let firestoreInitAttempted = false;
function getFirestore() {
    if (firestoreInstance)
        return firestoreInstance;
    if (firestoreInitAttempted)
        return null;
    firestoreInitAttempted = true;
    try {
        if (admin.apps.length === 0) {
            const projectId = process.env.GCP_PROJECT_ID ||
                process.env.FIREBASE_PROJECT_ID ||
                process.env.GOOGLE_CLOUD_PROJECT;
            if (projectId) {
                admin.initializeApp({ projectId });
            }
            else {
                admin.initializeApp();
            }
        }
        firestoreInstance = admin.firestore();
        return firestoreInstance;
    }
    catch {
        // Firebase not available - that's okay, we'll use in-memory only
        return null;
    }
}
/**
 * Send event to analytics service (Firestore)
 * Non-blocking - fires and forgets
 */
async function sendToAnalyticsService(event) {
    const db = getFirestore();
    if (!db)
        return;
    try {
        await db.collection(EVENTS_COLLECTION).add(cleanForFirestore({
            ...event,
            timestamp: event.timestamp,
        }));
        // Update aggregated metrics
        const metricsRef = db.collection(METRICS_COLLECTION).doc(`${event.domain}:${event.toolId}`);
        await metricsRef.set(cleanForFirestore({
            toolId: event.toolId,
            domain: event.domain,
            totalCalls: admin.firestore.FieldValue.increment(1),
            successCount: admin.firestore.FieldValue.increment(event.success ? 1 : 0),
            errorCount: admin.firestore.FieldValue.increment(event.success ? 0 : 1),
            totalDurationMs: admin.firestore.FieldValue.increment(event.durationMs),
            lastCalled: event.timestamp,
        }), { merge: true });
    }
    catch (error) {
        // Non-critical - log but don't throw
        getLogger().debug({ error, toolId: event.toolId }, 'Failed to send tool analytics (non-critical)');
    }
}
// ============================================================================
// IN-MEMORY STORE (Replace with persistent store in production)
// ============================================================================
const usageStore = [];
const MAX_STORE_SIZE = 10000; // Limit memory usage
// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================
/**
 * Start tracking a tool execution
 * Returns a tracker object with success/error methods
 */
export function trackToolUsage(toolId, domain, options) {
    const startTime = Date.now();
    const recordEvent = (success, errorMsg, metadata) => {
        const event = {
            toolId,
            domain,
            success,
            durationMs: Date.now() - startTime,
            timestamp: new Date(),
            userId: options?.userId,
            agentId: options?.agentId,
            error: errorMsg,
            metadata: { ...options?.metadata, ...metadata },
        };
        // Store event
        usageStore.push(event);
        // Trim if too large
        if (usageStore.length > MAX_STORE_SIZE) {
            usageStore.splice(0, usageStore.length - MAX_STORE_SIZE);
        }
        // Log for observability
        if (success) {
            getLogger().debug({ toolId, domain, durationMs: event.durationMs }, 'Tool executed successfully');
        }
        else {
            getLogger().warn({ toolId, domain, durationMs: event.durationMs, error: errorMsg }, 'Tool execution failed');
        }
        // Send to analytics service (non-blocking)
        void sendToAnalyticsService(event);
    };
    return {
        success: (metadata) => {
            recordEvent(true, undefined, metadata);
        },
        error: (error, metadata) => {
            const errorMsg = error instanceof Error ? error.message : error;
            recordEvent(false, errorMsg, metadata);
        },
    };
}
/**
 * Simple one-line tracking for successful executions
 */
export function trackToolSuccess(toolId, domain, durationMs, metadata) {
    const event = {
        toolId,
        domain,
        success: true,
        durationMs,
        timestamp: new Date(),
        metadata,
    };
    usageStore.push(event);
}
/**
 * Simple one-line tracking for failed executions
 */
export function trackToolError(toolId, domain, error, durationMs, metadata) {
    const event = {
        toolId,
        domain,
        success: false,
        durationMs,
        timestamp: new Date(),
        error,
        metadata,
    };
    usageStore.push(event);
    getLogger().warn({ toolId, domain, error }, 'Tool error tracked');
}
// ============================================================================
// METRICS FUNCTIONS
// ============================================================================
/**
 * Get metrics for a specific tool
 */
export function getToolMetrics(toolId) {
    const events = usageStore.filter((e) => e.toolId === toolId);
    if (events.length === 0)
        return null;
    const successEvents = events.filter((e) => e.success);
    const errorEvents = events.filter((e) => !e.success);
    const totalDuration = events.reduce((sum, e) => sum + e.durationMs, 0);
    return {
        toolId,
        domain: events[0].domain,
        totalCalls: events.length,
        successCount: successEvents.length,
        errorCount: errorEvents.length,
        avgDurationMs: Math.round(totalDuration / events.length),
        lastCalled: events.length > 0 ? events[events.length - 1].timestamp : null,
        errorRate: events.length > 0 ? errorEvents.length / events.length : 0,
    };
}
/**
 * Get metrics for a domain
 */
export function getDomainMetrics(domain) {
    const events = usageStore.filter((e) => e.domain === domain);
    if (events.length === 0)
        return null;
    const toolBreakdown = {};
    events.forEach((e) => {
        toolBreakdown[e.toolId] = (toolBreakdown[e.toolId] || 0) + 1;
    });
    const totalDuration = events.reduce((sum, e) => sum + e.durationMs, 0);
    const errorCount = events.filter((e) => !e.success).length;
    return {
        domain,
        totalCalls: events.length,
        toolBreakdown,
        avgDurationMs: Math.round(totalDuration / events.length),
        errorRate: events.length > 0 ? errorCount / events.length : 0,
    };
}
/**
 * Get all domain metrics
 */
export function getAllDomainMetrics() {
    const domains = [...new Set(usageStore.map((e) => e.domain))];
    return domains.map((d) => getDomainMetrics(d)).filter((m) => m !== null);
}
/**
 * Get most used tools
 */
export function getMostUsedTools(limit = 10) {
    const toolIds = [...new Set(usageStore.map((e) => e.toolId))];
    return toolIds
        .map((id) => getToolMetrics(id))
        .filter((m) => m !== null)
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, limit);
}
/**
 * Get tools with highest error rates
 */
export function getProblematicTools(minCalls = 5) {
    const toolIds = [...new Set(usageStore.map((e) => e.toolId))];
    return toolIds
        .map((id) => getToolMetrics(id))
        .filter((m) => m !== null && m.totalCalls >= minCalls)
        .sort((a, b) => b.errorRate - a.errorRate)
        .filter((m) => m.errorRate > 0);
}
/**
 * Get recent errors for debugging
 */
export function getRecentErrors(limit = 20) {
    return usageStore
        .filter((e) => !e.success)
        .slice(-limit)
        .reverse();
}
// ============================================================================
// ALERTS
// ============================================================================
/**
 * Check if a tool has concerning error rate
 */
export function hasHighErrorRate(toolId, threshold = 0.1) {
    const metrics = getToolMetrics(toolId);
    if (!metrics || metrics.totalCalls < 5)
        return false;
    return metrics.errorRate > threshold;
}
/**
 * Check if any crisis tools have errors (critical alert)
 */
export function hasCrisisToolErrors() {
    const crisisEvents = usageStore.filter((e) => e.domain === 'crisis' && !e.success);
    return crisisEvents.length > 0;
}
/**
 * Get crisis tool health status
 */
export function getCrisisToolHealth() {
    const crisisErrors = usageStore.filter((e) => e.domain === 'crisis' && !e.success);
    return {
        healthy: crisisErrors.length === 0,
        errorCount: crisisErrors.length,
        lastError: crisisErrors.length > 0 ? crisisErrors[crisisErrors.length - 1] : null,
    };
}
// ============================================================================
// MAINTENANCE
// ============================================================================
/**
 * Clear all stored events (for testing)
 */
export function clearAnalytics() {
    usageStore.length = 0;
}
/**
 * Get raw event count
 */
export function getEventCount() {
    return usageStore.length;
}
/**
 * Export events for external analysis
 */
export function exportEvents(since) {
    if (!since)
        return [...usageStore];
    return usageStore.filter((e) => e.timestamp >= since);
}
// ============================================================================
// FIRESTORE QUERIES
// ============================================================================
/**
 * Load metrics from Firestore (for dashboard/admin)
 */
export async function loadMetricsFromFirestore() {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        const snapshot = await db.collection(METRICS_COLLECTION).get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            const totalCalls = data.totalCalls || 0;
            return {
                toolId: data.toolId,
                domain: data.domain,
                totalCalls,
                successCount: data.successCount || 0,
                errorCount: data.errorCount || 0,
                avgDurationMs: totalCalls > 0 ? Math.round((data.totalDurationMs || 0) / totalCalls) : 0,
                lastCalled: data.lastCalled?.toDate() || null,
                errorRate: totalCalls > 0 ? (data.errorCount || 0) / totalCalls : 0,
            };
        });
    }
    catch (error) {
        getLogger().warn({ error }, 'Failed to load tool metrics from Firestore');
        return [];
    }
}
/**
 * Query recent events from Firestore
 */
export async function queryEventsFromFirestore(options) {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        let query = db.collection(EVENTS_COLLECTION);
        if (options.toolId) {
            query = query.where('toolId', '==', options.toolId);
        }
        if (options.domain) {
            query = query.where('domain', '==', options.domain);
        }
        if (options.since) {
            query = query.where('timestamp', '>=', options.since);
        }
        const snapshot = await query
            .orderBy('timestamp', 'desc')
            .limit(options.limit || 100)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp?.toDate() || new Date(data.timestamp),
            };
        });
    }
    catch (error) {
        getLogger().warn({ error }, 'Failed to query tool events from Firestore');
        return [];
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    trackToolUsage,
    trackToolSuccess,
    trackToolError,
    getToolMetrics,
    getDomainMetrics,
    getAllDomainMetrics,
    getMostUsedTools,
    getProblematicTools,
    getRecentErrors,
    hasHighErrorRate,
    hasCrisisToolErrors,
    getCrisisToolHealth,
    clearAnalytics,
    getEventCount,
    exportEvents,
    loadMetricsFromFirestore,
    queryEventsFromFirestore,
};
//# sourceMappingURL=analytics.js.map