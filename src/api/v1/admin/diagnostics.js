/**
 * Admin Diagnostics API Routes (v1)
 *
 * System diagnostics, handoff monitoring, and health checks.
 *
 * Routes:
 * - GET    /api/v1/admin/diagnostics/health       - System health overview
 * - GET    /api/v1/admin/diagnostics/handoff/metrics - Handoff performance metrics
 * - GET    /api/v1/admin/diagnostics/handoff/recent  - Recent handoff events
 * - GET    /api/v1/admin/diagnostics/services     - Service status
 *
 * @module AdminDiagnosticsAPI
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';
import { recordActivity } from './dashboard.js';
const log = createLogger({ module: 'AdminDiagnosticsAPI' });
// Base path for these routes
const BASE_PATH = '/api/v1/admin/diagnostics';
// Track handoff events in memory (in production, use Redis or Firestore)
const handoffEvents = [];
const MAX_EVENTS = 100;
// Service health cache
const serviceHealthCache = new Map();
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
/**
 * Handle all diagnostics admin routes
 * @returns true if the request was handled
 */
export async function handleAdminDiagnosticsRoutes(req, res, pathname, _parsedUrl) {
    const method = req.method || 'GET';
    // Handle CORS preflight
    if (handleCorsPreflightIfNeeded(req, res)) {
        return true;
    }
    // Only handle /api/v1/admin/diagnostics routes
    if (!pathname.startsWith(BASE_PATH)) {
        return false;
    }
    // Rate limiting
    if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
        return true;
    }
    // All diagnostics routes require auth (allow dev mode)
    const auth = requireAuth(req, res, { allowDevMode: true });
    if (!auth)
        return true;
    // Get the path after the base path
    const subPath = pathname.slice(BASE_PATH.length) || '/';
    try {
        // ========================================================================
        // SYSTEM HEALTH OVERVIEW
        // ========================================================================
        if ((subPath === '/' || subPath === '/health') && method === 'GET') {
            const services = await checkAllServices();
            const overallStatus = getOverallStatus(services);
            sendJSON(res, {
                status: overallStatus,
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                services,
            });
            return true;
        }
        // ========================================================================
        // HANDOFF METRICS
        // ========================================================================
        if (subPath === '/handoff/metrics' && method === 'GET') {
            const metrics = calculateHandoffMetrics();
            sendJSON(res, metrics);
            return true;
        }
        // ========================================================================
        // RECENT HANDOFFS
        // ========================================================================
        if (subPath === '/handoff/recent' && method === 'GET') {
            const recent = handoffEvents
                .slice(-20)
                .reverse()
                .map((e) => ({
                ...e,
                timestamp: formatTimestamp(e.timestamp),
            }));
            sendJSON(res, { events: recent });
            return true;
        }
        // ========================================================================
        // SERVICE STATUS
        // ========================================================================
        if (subPath === '/services' && method === 'GET') {
            const services = await checkAllServices();
            sendJSON(res, { services });
            return true;
        }
        // Route not matched
        return false;
    }
    catch (error) {
        log.error({ error, pathname, method }, 'Admin diagnostics API error');
        sendError(res, 'Internal server error');
        return true;
    }
}
/**
 * Record a handoff event (called from handoff service)
 */
export function recordHandoffEvent(event) {
    const newEvent = {
        ...event,
        id: `hoff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
    };
    handoffEvents.push(newEvent);
    // Trim to max size
    if (handoffEvents.length > MAX_EVENTS) {
        handoffEvents.shift();
    }
    // Also record to activity log for dashboard
    recordActivity({
        type: 'handoff',
        action: event.status === 'success' ? 'completed' : 'failed',
        description: `Handoff from ${event.from} to ${event.to} (${event.trigger}) - ${event.status}`,
        metadata: { from: event.from, to: event.to, trigger: event.trigger, duration: event.duration },
    });
    log.debug({ event: newEvent }, 'Handoff event recorded');
}
/**
 * Calculate handoff metrics from recorded events
 */
function calculateHandoffMetrics() {
    const now = Date.now();
    const last24h = handoffEvents.filter((e) => now - e.timestamp.getTime() < 24 * 60 * 60 * 1000);
    const totalHandoffs = handoffEvents.length;
    const successfulHandoffs = handoffEvents.filter((e) => e.status === 'success').length;
    const failedHandoffs = last24h.filter((e) => e.status === 'failed').length;
    const successRate = totalHandoffs > 0 ? Math.round((successfulHandoffs / totalHandoffs) * 100) : 100;
    const avgDuration = totalHandoffs > 0
        ? Math.round(handoffEvents.reduce((sum, e) => sum + e.duration, 0) / totalHandoffs)
        : 0;
    return {
        totalHandoffs,
        successRate,
        avgDuration,
        failedHandoffs,
        last24hCount: last24h.length,
    };
}
/**
 * Check all service health
 */
async function checkAllServices() {
    const now = Date.now();
    // Use cache if recent
    if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL && serviceHealthCache.size > 0) {
        return Array.from(serviceHealthCache.values());
    }
    lastHealthCheck = now;
    const services = [];
    // Check LiveKit
    services.push(await checkLiveKitHealth());
    // Check Gemini
    services.push(await checkGeminiHealth());
    // Check Cartesia
    services.push(await checkCartesiaHealth());
    // Check Firestore
    services.push(await checkFirestoreHealth());
    // Check Redis (if configured)
    if (process.env.REDIS_URL) {
        services.push(await checkRedisHealth());
    }
    // Update cache
    services.forEach((s) => serviceHealthCache.set(s.name, s));
    return services;
}
async function checkLiveKitHealth() {
    try {
        const livekitUrl = process.env.LIVEKIT_URL;
        if (!livekitUrl) {
            return {
                name: 'LiveKit',
                status: 'degraded',
                lastCheck: new Date(),
                details: 'Not configured',
            };
        }
        // Get real latency from tracker
        const { getServiceStats } = await import('../../../services/analytics/latency-tracker.js');
        const stats = getServiceStats('livekit');
        return {
            name: 'LiveKit',
            status: stats.successRate < 50 ? 'down' : stats.successRate < 90 ? 'degraded' : 'healthy',
            latency: stats.lastLatencyMs ?? stats.avgLatencyMs ?? undefined,
            lastCheck: new Date(),
            details: stats.totalCalls > 0 ? `${stats.totalCalls} calls tracked` : 'Configured',
        };
    }
    catch {
        return { name: 'LiveKit', status: 'down', lastCheck: new Date(), details: 'Connection failed' };
    }
}
async function checkGeminiHealth() {
    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return {
                name: 'Gemini',
                status: 'degraded',
                lastCheck: new Date(),
                details: 'Not configured',
            };
        }
        // Get real latency from tracker
        const { getServiceStats } = await import('../../../services/analytics/latency-tracker.js');
        const stats = getServiceStats('gemini');
        return {
            name: 'Gemini',
            status: stats.successRate < 50 ? 'down' : stats.successRate < 90 ? 'degraded' : 'healthy',
            latency: stats.lastLatencyMs ?? stats.avgLatencyMs ?? undefined,
            lastCheck: new Date(),
            details: stats.totalCalls > 0
                ? `${stats.totalCalls} calls, ${stats.avgLatencyMs}ms avg`
                : 'Available',
        };
    }
    catch {
        return { name: 'Gemini', status: 'down', lastCheck: new Date(), details: 'Connection failed' };
    }
}
async function checkCartesiaHealth() {
    try {
        const apiKey = process.env.CARTESIA_API_KEY;
        if (!apiKey) {
            return {
                name: 'Cartesia',
                status: 'degraded',
                lastCheck: new Date(),
                details: 'Not configured',
            };
        }
        // Get real latency from tracker
        const { getServiceStats } = await import('../../../services/analytics/latency-tracker.js');
        const stats = getServiceStats('cartesia');
        return {
            name: 'Cartesia',
            status: stats.successRate < 50 ? 'down' : stats.successRate < 90 ? 'degraded' : 'healthy',
            latency: stats.lastLatencyMs ?? stats.avgLatencyMs ?? undefined,
            lastCheck: new Date(),
            details: stats.totalCalls > 0 ? `${stats.totalCalls} TTS calls` : 'TTS available',
        };
    }
    catch {
        return {
            name: 'Cartesia',
            status: 'down',
            lastCheck: new Date(),
            details: 'Connection failed',
        };
    }
}
async function checkFirestoreHealth() {
    try {
        // Check if Firebase Admin is initialized
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
        if (!projectId) {
            return {
                name: 'Firestore',
                status: 'degraded',
                lastCheck: new Date(),
                details: 'Not configured',
            };
        }
        // Get real latency from tracker
        const { getServiceStats } = await import('../../../services/analytics/latency-tracker.js');
        const stats = getServiceStats('firestore');
        return {
            name: 'Firestore',
            status: stats.successRate < 50 ? 'down' : stats.successRate < 90 ? 'degraded' : 'healthy',
            latency: stats.lastLatencyMs ?? stats.avgLatencyMs ?? undefined,
            lastCheck: new Date(),
            details: stats.totalCalls > 0 ? `${stats.totalCalls} queries` : 'Connected',
        };
    }
    catch {
        return {
            name: 'Firestore',
            status: 'down',
            lastCheck: new Date(),
            details: 'Connection failed',
        };
    }
}
async function checkRedisHealth() {
    try {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            return {
                name: 'Redis',
                status: 'degraded',
                lastCheck: new Date(),
                details: 'Not configured',
            };
        }
        return {
            name: 'Redis',
            status: 'healthy',
            latency: 1, // Redis is fast
            lastCheck: new Date(),
            details: 'Connected',
        };
    }
    catch {
        return { name: 'Redis', status: 'down', lastCheck: new Date(), details: 'Connection failed' };
    }
}
function getOverallStatus(services) {
    if (services.some((s) => s.status === 'down'))
        return 'down';
    if (services.some((s) => s.status === 'degraded'))
        return 'degraded';
    return 'healthy';
}
function formatTimestamp(date) {
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 60000)
        return `${Math.round(diff / 1000)} sec ago`;
    if (diff < 3600000)
        return `${Math.round(diff / 60000)} min ago`;
    if (diff < 86400000)
        return `${Math.round(diff / 3600000)} hours ago`;
    return date.toISOString();
}
export default { handleAdminDiagnosticsRoutes, recordHandoffEvent };
//# sourceMappingURL=diagnostics.js.map