/**
 * Latency Tracker Service
 *
 * Tracks real response times from external services for monitoring.
 * Provides rolling averages and current latency data for dashboards.
 *
 * Tracked services:
 * - LiveKit (voice infrastructure)
 * - Gemini (LLM)
 * - Cartesia (TTS)
 * - Firestore (database)
 * - OpenAI (fallback LLM)
 *
 * @module LatencyTracker
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'LatencyTracker' });
// ============================================================================
// STORAGE
// ============================================================================
// Rolling window of latency records (keep last 1000 per service)
const MAX_RECORDS_PER_SERVICE = 1000;
const latencyRecords = new Map();
// Initialize storage for each service
const SERVICES = [
    'livekit',
    'gemini',
    'cartesia',
    'firestore',
    'openai',
    'deepgram',
];
for (const service of SERVICES) {
    latencyRecords.set(service, []);
}
// ============================================================================
// RECORDING
// ============================================================================
/**
 * Record a latency measurement for a service
 */
export function recordLatency(service, durationMs, success = true, operation) {
    const records = latencyRecords.get(service);
    if (!records) {
        log.warn({ service }, 'Unknown service for latency tracking');
        return;
    }
    const record = {
        service,
        durationMs,
        timestamp: new Date(),
        success,
        operation,
    };
    records.push(record);
    // Trim to max size (keep most recent)
    if (records.length > MAX_RECORDS_PER_SERVICE) {
        records.shift();
    }
    log.debug({ service, durationMs, success, operation }, 'Latency recorded');
}
/**
 * Wrap an async operation to automatically track its latency
 */
export async function trackLatency(service, operation, fn) {
    const start = Date.now();
    let success = true;
    try {
        return await fn();
    }
    catch (error) {
        success = false;
        throw error;
    }
    finally {
        const duration = Date.now() - start;
        recordLatency(service, duration, success, operation);
    }
}
/**
 * Create a latency-tracking wrapper for a function
 */
export function withLatencyTracking(service, operation, fn) {
    return async (...args) => {
        return trackLatency(service, operation, async () => fn(...args));
    };
}
// ============================================================================
// STATISTICS
// ============================================================================
/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues, p) {
    if (sortedValues.length === 0)
        return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
}
/**
 * Get latency statistics for a specific service
 */
export function getServiceStats(service) {
    const records = latencyRecords.get(service) || [];
    if (records.length === 0) {
        return {
            service,
            avgLatencyMs: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            minLatencyMs: 0,
            maxLatencyMs: 0,
            totalCalls: 0,
            successRate: 100,
            lastLatencyMs: null,
            lastCallTime: null,
        };
    }
    const durations = records.map((r) => r.durationMs);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const successCount = records.filter((r) => r.success).length;
    const lastRecord = records[records.length - 1];
    return {
        service,
        avgLatencyMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        p50LatencyMs: Math.round(percentile(sortedDurations, 50)),
        p95LatencyMs: Math.round(percentile(sortedDurations, 95)),
        p99LatencyMs: Math.round(percentile(sortedDurations, 99)),
        minLatencyMs: Math.round(Math.min(...durations)),
        maxLatencyMs: Math.round(Math.max(...durations)),
        totalCalls: records.length,
        successRate: Math.round((successCount / records.length) * 100),
        lastLatencyMs: lastRecord.durationMs,
        lastCallTime: lastRecord.timestamp,
    };
}
/**
 * Get latency statistics for all services
 */
export function getAllServiceStats() {
    const stats = {};
    for (const service of SERVICES) {
        stats[service] = getServiceStats(service);
    }
    return stats;
}
/**
 * Get average latency across all services (for dashboard overview)
 */
export function getAverageLatency() {
    let totalLatency = 0;
    let count = 0;
    for (const service of SERVICES) {
        const records = latencyRecords.get(service) || [];
        if (records.length > 0) {
            // Use last 10 records for "current" average
            const recentRecords = records.slice(-10);
            const avg = recentRecords.reduce((a, r) => a + r.durationMs, 0) / recentRecords.length;
            totalLatency += avg;
            count++;
        }
    }
    return count > 0 ? Math.round(totalLatency / count) : 0;
}
/**
 * Get summary for dashboard display
 */
export function getLatencySummary() {
    const allStats = getAllServiceStats();
    const services = SERVICES.map((service) => {
        const stats = allStats[service];
        let status = 'healthy';
        // Determine status based on latency and success rate
        if (stats.successRate < 50) {
            status = 'down';
        }
        else if (stats.successRate < 90 || stats.avgLatencyMs > 1000) {
            status = 'degraded';
        }
        // Format service name for display
        const displayNames = {
            livekit: 'LiveKit',
            gemini: 'Gemini',
            cartesia: 'Cartesia',
            firestore: 'Firestore',
            openai: 'OpenAI',
            deepgram: 'Deepgram',
        };
        return {
            name: displayNames[service],
            latency: stats.lastLatencyMs ?? stats.avgLatencyMs,
            status,
        };
    });
    return {
        avgResponseTime: getAverageLatency(),
        services,
    };
}
// ============================================================================
// HEALTH CHECK INTEGRATION
// ============================================================================
/**
 * Perform a health check on a service by pinging it
 * Returns latency in ms or -1 if failed
 */
export async function pingService(service) {
    const start = Date.now();
    try {
        switch (service) {
            case 'firestore': {
                // Firestore health check - simple read
                const { getFirestore } = await import('firebase-admin/firestore');
                const db = getFirestore();
                await db.collection('_health').doc('ping').get();
                break;
            }
            case 'gemini': {
                // Gemini - check API key exists (actual ping would cost tokens)
                if (!process.env.GOOGLE_API_KEY) {
                    throw new Error('Not configured');
                }
                break;
            }
            case 'cartesia': {
                // Cartesia - check API key exists
                if (!process.env.CARTESIA_API_KEY) {
                    throw new Error('Not configured');
                }
                break;
            }
            case 'livekit': {
                // LiveKit - check URL configured
                if (!process.env.LIVEKIT_URL) {
                    throw new Error('Not configured');
                }
                break;
            }
            default:
                // Default: just return a nominal latency
                break;
        }
        const duration = Date.now() - start;
        recordLatency(service, duration, true, 'health_check');
        return duration;
    }
    catch (error) {
        const duration = Date.now() - start;
        recordLatency(service, duration, false, 'health_check');
        log.warn({ service, error }, 'Service health check failed');
        return -1;
    }
}
/**
 * Run health checks on all services
 */
export async function healthCheckAllServices() {
    const results = await Promise.all(SERVICES.map(async (service) => {
        const latency = await pingService(service);
        return {
            service,
            latency: latency >= 0 ? latency : 0,
            healthy: latency >= 0,
        };
    }));
    return results;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordLatency,
    trackLatency,
    withLatencyTracking,
    getServiceStats,
    getAllServiceStats,
    getAverageLatency,
    getLatencySummary,
    pingService,
    healthCheckAllServices,
};
//# sourceMappingURL=latency-tracker.js.map