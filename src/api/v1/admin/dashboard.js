/**
 * Admin Dashboard API Routes (v1)
 *
 * Aggregated dashboard data from all systems for the admin portal.
 *
 * Routes:
 * - GET  /api/v1/admin/dashboard/stats    - Aggregated stats from all systems
 * - GET  /api/v1/admin/dashboard/activity - Recent activity across all systems
 * - GET  /api/v1/admin/dashboard/health   - Overall system health summary
 *
 * @module AdminDashboardAPI
 */
import { getActivityByType, getRecentActivity as getRecentActivityFromStore, initializeActivityLog, recordActivity as recordActivityToStore, } from '../../../services/admin-activity.js';
import { getBetterThanHumanTelemetry } from '../../../services/analytics/better-than-human-telemetry.js';
import { calculatePeriodAnalytics } from '../../../services/outreach/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';
const log = createLogger({ module: 'AdminDashboardAPI' });
// Base path for these routes
const BASE_PATH = '/api/v1/admin/dashboard';
// Initialize activity log on module load
let activityLogInitialized = false;
async function ensureActivityLogInitialized() {
    if (!activityLogInitialized) {
        await initializeActivityLog();
        activityLogInitialized = true;
    }
}
/**
 * Record an activity event (async wrapper for Firestore persistence)
 */
export function recordActivity(event) {
    // Fire-and-forget to not block callers
    ensureActivityLogInitialized()
        .then(() => recordActivityToStore(event))
        .catch((error) => log.error({ error }, 'Failed to record activity'));
}
/**
 * Get recent activity events (async)
 */
export async function getRecentActivity(limit = 20) {
    await ensureActivityLogInitialized();
    return getRecentActivityFromStore(limit);
}
// ============================================================================
// ROUTE HANDLER
// ============================================================================
/**
 * Handle all dashboard admin routes
 * @returns true if the request was handled
 */
export async function handleAdminDashboardRoutes(req, res, pathname, _parsedUrl) {
    const method = req.method || 'GET';
    // Handle CORS preflight
    if (handleCorsPreflightIfNeeded(req, res)) {
        return true;
    }
    // Only handle /api/v1/admin/dashboard routes
    if (!pathname.startsWith(BASE_PATH)) {
        return false;
    }
    // Rate limiting
    if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
        return true;
    }
    // All dashboard routes require auth (allow dev mode)
    const auth = requireAuth(req, res, { allowDevMode: true });
    if (!auth)
        return true;
    // Get the path after the base path
    const subPath = pathname.slice(BASE_PATH.length) || '/';
    try {
        // ========================================================================
        // AGGREGATED STATS
        // ========================================================================
        if ((subPath === '/' || subPath === '/stats') && method === 'GET') {
            const stats = await getAggregatedStats();
            sendJSON(res, stats);
            return true;
        }
        // ========================================================================
        // RECENT ACTIVITY
        // ========================================================================
        if (subPath === '/activity' && method === 'GET') {
            const recentEvents = await getRecentActivity(20);
            const activity = recentEvents.map((e) => ({
                ...e,
                timestamp: formatTimestamp(e.timestamp),
            }));
            sendJSON(res, { activity, count: activity.length });
            return true;
        }
        // ========================================================================
        // HEALTH SUMMARY
        // ========================================================================
        if (subPath === '/health' && method === 'GET') {
            const health = await getHealthSummary();
            sendJSON(res, health);
            return true;
        }
        // ========================================================================
        // FILTERED ACTIVITY (by type)
        // ========================================================================
        if (subPath.startsWith('/activity/') && method === 'GET') {
            const type = subPath.slice('/activity/'.length);
            const filteredEvents = await getActivityByType(type, 20);
            const filtered = filteredEvents.map((e) => ({
                ...e,
                timestamp: formatTimestamp(e.timestamp),
            }));
            sendJSON(res, { activity: filtered, count: filtered.length, type });
            return true;
        }
        // ========================================================================
        // CAPABILITY PATTERNS - Collective learning insights
        // ========================================================================
        if (subPath === '/capability-patterns' && method === 'GET') {
            const { getAllPatterns, getMostEffectiveDomains } = await import('../../../intelligence/capability-learning.js');
            const allPatterns = getAllPatterns();
            const topPatterns = getMostEffectiveDomains(10);
            // Calculate summary stats
            const totalSamples = allPatterns.reduce((sum, p) => sum + p.sampleSize, 0);
            const avgEngagement = allPatterns.length > 0
                ? allPatterns.reduce((sum, p) => sum + p.engagementRate, 0) / allPatterns.length
                : 0;
            sendJSON(res, {
                summary: {
                    totalDomains: allPatterns.length,
                    totalSamples,
                    averageEngagementRate: Math.round(avgEngagement * 100) / 100,
                    topEngagingDomains: topPatterns.slice(0, 5).map((p) => p.domain),
                },
                topPatterns: topPatterns.map((p) => ({
                    domain: p.domain,
                    engagementRate: Math.round(p.engagementRate * 100) / 100,
                    toolUseRate: Math.round(p.toolUseRate * 100) / 100,
                    sampleSize: p.sampleSize,
                    bestEmotionalContext: p.bestEmotionalContexts[0]?.emotion || null,
                    bestPersona: p.bestPersonas[0]?.personaId || null,
                })),
                allPatterns: allPatterns.map((p) => ({
                    domain: p.domain,
                    surfaceCount: p.surfaceCount,
                    engagementCount: p.engagementCount,
                    toolUseCount: p.toolUseCount,
                    engagementRate: Math.round(p.engagementRate * 100) / 100,
                    sampleSize: p.sampleSize,
                    lastUpdated: p.lastUpdated,
                })),
            });
            return true;
        }
        // Route not matched
        return false;
    }
    catch (error) {
        log.error({ error, pathname, method }, 'Admin dashboard API error');
        sendError(res, 'Internal server error');
        return true;
    }
}
async function getAggregatedStats() {
    // Fetch from various sources (all async now)
    const [agentStats, evalStats, trustStats, systemStats] = await Promise.all([
        getAgentStats(),
        getEvalOpsStats(),
        getTrustStats(),
        getSystemStats(),
    ]);
    const outreach7 = calculatePeriodAnalytics(7);
    const outreach30 = calculatePeriodAnalytics(30);
    void getBetterThanHumanTelemetry().getSummary(7);
    return {
        agents: agentStats,
        conversations: {
            today: systemStats.activeSessions * 10, // Estimate from sessions
            thisWeek: systemStats.activeSessions * 50,
            trend: 'up',
        },
        evalops: evalStats,
        trust: trustStats,
        system: systemStats,
        betterThanHuman: {
            outreach: {
                last7Days: { totalOutreach: outreach7.totalOutreach, responseRate: outreach7.responseRate },
                last30Days: {
                    totalOutreach: outreach30.totalOutreach,
                    responseRate: outreach30.responseRate,
                },
            },
        },
    };
}
async function getAgentStats() {
    try {
        const { AgentRegistry } = await import('../../../personas/registry/unified-registry.js');
        const agents = await AgentRegistry.getEnabledAgents();
        return {
            total: agents?.length || 6,
            active: agents?.length || 6,
        };
    }
    catch {
        return { total: 6, active: 6 };
    }
}
async function getEvalOpsStats() {
    try {
        const { getEvalMetrics } = await import('../../../services/evalops/automation.js');
        const metrics = getEvalMetrics();
        return {
            totalEvaluations: metrics.totalEvaluations,
            passRate: metrics.averageScore,
            flaggedCount: metrics.flaggedResponses,
        };
    }
    catch {
        return { totalEvaluations: 0, passRate: 100, flaggedCount: 0 };
    }
}
async function getTrustStats() {
    try {
        const { getTrustAggregates } = await import('../../../services/trust-systems/index.js');
        const aggregates = getTrustAggregates();
        return {
            totalProfiles: aggregates.totalProfiles,
            avgTrustScore: aggregates.avgTrustScore,
            activeRelationships: aggregates.activeRelationships,
        };
    }
    catch {
        return { totalProfiles: 0, avgTrustScore: 0, activeRelationships: 0 };
    }
}
async function getSystemStats() {
    try {
        const { getAverageLatency } = await import('../../../services/analytics/latency-tracker.js');
        const avgLatency = getAverageLatency();
        // Get recent user events to estimate active sessions
        const recentUserEvents = await getActivityByType('user', 100);
        const oneHourAgo = Date.now() - 3600000;
        const activeSessions = recentUserEvents.filter((e) => e.timestamp.getTime() > oneHourAgo).length;
        return {
            uptime: process.uptime(),
            responseTime: avgLatency > 0 ? avgLatency : 0,
            errorRate: 0.02, // Would need to track actual errors
            activeSessions,
        };
    }
    catch {
        return {
            uptime: process.uptime(),
            responseTime: 0,
            errorRate: 0,
            activeSessions: 0,
        };
    }
}
async function getHealthSummary() {
    try {
        const { getLatencySummary } = await import('../../../services/analytics/latency-tracker.js');
        const latencySummary = getLatencySummary();
        // Map to the expected format
        const services = latencySummary.services
            .filter((s) => ['LiveKit', 'Gemini', 'Cartesia', 'Firestore'].includes(s.name))
            .map((s) => ({
            name: s.name,
            status: s.status,
            latency: s.latency > 0 ? s.latency : undefined,
        }));
        // If no latency data, check env vars for status
        if (services.length === 0) {
            services.push({
                name: 'LiveKit',
                status: process.env.LIVEKIT_URL ? 'healthy' : 'degraded',
                latency: undefined,
            }, {
                name: 'Gemini',
                status: process.env.GOOGLE_API_KEY ? 'healthy' : 'degraded',
                latency: undefined,
            }, {
                name: 'Cartesia',
                status: process.env.CARTESIA_API_KEY ? 'healthy' : 'degraded',
                latency: undefined,
            }, { name: 'Firestore', status: 'healthy', latency: undefined });
        }
        const hasDown = services.some((s) => s.status === 'down');
        const hasDegraded = services.some((s) => s.status === 'degraded');
        return {
            status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'healthy',
            uptime: process.uptime(),
            services,
            timestamp: new Date().toISOString(),
        };
    }
    catch {
        return {
            status: 'degraded',
            uptime: process.uptime(),
            services: [],
            timestamp: new Date().toISOString(),
        };
    }
}
// ============================================================================
// UTILITIES
// ============================================================================
function formatTimestamp(date) {
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 60000)
        return 'just now';
    if (diff < 3600000)
        return `${Math.round(diff / 60000)} min ago`;
    if (diff < 86400000)
        return `${Math.round(diff / 3600000)} hours ago`;
    return `${Math.round(diff / 86400000)} days ago`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default { handleAdminDashboardRoutes, recordActivity, getRecentActivity };
//# sourceMappingURL=dashboard.js.map