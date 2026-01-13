/**
 * Health Monitors for Critical Services
 *
 * Proactive health checking for LiveKit, Cartesia, Gemini, Firestore, etc.
 * Detects issues before they impact users.
 *
 * Features:
 * - Periodic health checks for each service
 * - Circuit breaker integration
 * - Anomaly detection integration
 * - Automatic alerting on degradation
 */
import { resilienceMetrics } from '../observability/resilience-metrics.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createCircuitBreaker } from './circuit-breaker.js';
import { recordLatency, recordSuccessRate } from './anomaly-detection.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
const log = createLogger({ module: 'health-monitors' });
// ============================================================================
// MONITORING CONFIGURATION
// ============================================================================
/** Default health check interval (30 seconds) */
const DEFAULT_INTERVAL_MS = 30_000;
/** Critical services get more frequent checks (15 seconds) */
const CRITICAL_INTERVAL_MS = 15_000;
/** Max consecutive failures before alerting */
const ALERT_THRESHOLD = 3;
// Track consecutive failures for alerting
const consecutiveFailures = new Map();
// ============================================================================
// HEALTH CHECK IMPLEMENTATIONS
// ============================================================================
/**
 * LiveKit health check - verify WebSocket connection
 */
async function checkLiveKit() {
    const start = Date.now();
    try {
        // Check if we have LiveKit credentials
        const url = process.env.LIVEKIT_URL;
        if (!url) {
            return {
                healthy: false,
                latencyMs: 0,
                error: 'LIVEKIT_URL not configured',
            };
        }
        // Convert WSS URL to HTTPS for health check
        const healthUrl = url.replace('wss://', 'https://').replace('ws://', 'http://');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(healthUrl, {
                method: 'HEAD',
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            return {
                healthy: response.ok || response.status === 404, // 404 is fine - just checking connectivity
                latencyMs,
                details: `Status: ${response.status}`,
                metadata: { url: healthUrl },
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Cartesia TTS health check - verify API connectivity
 * Note: Cartesia is optional - the voice agent uses Gemini's built-in TTS
 */
async function checkCartesia() {
    const start = Date.now();
    try {
        const apiKey = process.env.CARTESIA_API_KEY;
        if (!apiKey) {
            return {
                healthy: true, // Optional service - Gemini provides built-in TTS
                latencyMs: 0,
                details: 'Cartesia not configured (optional - using Gemini TTS)',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            // Cartesia voices endpoint as health check
            // Note: Cartesia API returns 405 for HEAD requests, so we use GET
            // As of 2024, Cartesia requires a version header in YYYY-MM-DD format
            const response = await fetch('https://api.cartesia.ai/voices', {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey,
                    'Cartesia-Version': '2024-06-10', // Required version header
                },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            // 200 = success, 401/403 = auth issue but API is reachable
            // We consider the service healthy if we can reach it
            return {
                healthy: response.ok || response.status === 401 || response.status === 403,
                latencyMs,
                details: `Status: ${response.status}`,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Gemini AI health check - verify API connectivity
 */
async function checkGemini() {
    const start = Date.now();
    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return {
                healthy: false,
                latencyMs: 0,
                error: 'GOOGLE_API_KEY not configured',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            // List models endpoint as health check
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            return {
                healthy: response.ok,
                latencyMs,
                details: `Status: ${response.status}`,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Firestore health check - verify database connectivity
 */
async function checkFirestore() {
    const start = Date.now();
    try {
        // Dynamic import to avoid loading Firebase unless needed
        const { initializeApp, getApps } = await import('firebase-admin/app');
        const { getFirestore } = await import('firebase-admin/firestore');
        // Initialize if not already
        if (getApps().length === 0) {
            initializeApp();
        }
        const db = getFirestore();
        // Simple read operation to verify connectivity
        const testRef = db.collection('_health_check').doc('test');
        await testRef.get();
        const latencyMs = Date.now() - start;
        return {
            healthy: true,
            latencyMs,
            details: 'Connected to Firestore',
        };
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Deepgram STT health check - verify API connectivity
 * Note: Deepgram is optional - the voice agent uses Gemini's built-in STT
 */
async function checkDeepgram() {
    const start = Date.now();
    try {
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            return {
                healthy: true, // Optional service - Gemini provides built-in STT
                latencyMs: 0,
                details: 'Deepgram not configured (optional - using Gemini STT)',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            // Projects endpoint as health check
            const response = await fetch('https://api.deepgram.com/v1/projects', {
                method: 'GET',
                headers: { Authorization: `Token ${apiKey}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            return {
                healthy: response.ok,
                latencyMs,
                details: `Status: ${response.status}`,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * OpenAI health check - verify API connectivity
 * Note: OpenAI is optional - the voice agent uses Gemini as primary LLM
 */
async function checkOpenAI() {
    const start = Date.now();
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return {
                healthy: true, // Optional service - Gemini is primary LLM
                latencyMs: 0,
                details: 'OpenAI not configured (optional - using Gemini LLM)',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            // Models endpoint as health check
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            return {
                healthy: response.ok,
                latencyMs,
                details: `Status: ${response.status}`,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Memory health check - verify process memory usage
 */
async function checkMemory() {
    const start = Date.now();
    try {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        const heapTotalMB = usage.heapTotal / 1024 / 1024;
        const rssMB = usage.rss / 1024 / 1024;
        // Consider unhealthy if heap usage > 1.5GB or > 90% of total
        const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
        const healthy = heapUsedMB < 1500 && heapPercent < 90;
        return {
            healthy,
            latencyMs: Date.now() - start,
            details: `Heap: ${heapUsedMB.toFixed(0)}MB (${heapPercent.toFixed(1)}%), RSS: ${rssMB.toFixed(0)}MB`,
            metadata: {
                heapUsedMB: Math.round(heapUsedMB),
                heapTotalMB: Math.round(heapTotalMB),
                heapPercent: Math.round(heapPercent),
                rssMB: Math.round(rssMB),
            },
        };
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/**
 * Spotify health check - verify API connectivity (optional service)
 */
async function checkSpotify() {
    const start = Date.now();
    try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        if (!clientId) {
            return {
                healthy: true, // Optional service - not having it is fine
                latencyMs: 0,
                details: 'Spotify not configured (optional)',
            };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            // Check Spotify API availability
            const response = await fetch('https://api.spotify.com/v1/browse/categories?limit=1', {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const latencyMs = Date.now() - start;
            // 401 is expected without auth - just checking connectivity
            return {
                healthy: response.status === 401 || response.ok,
                latencyMs,
                details: `Status: ${response.status}`,
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
// ============================================================================
// MONITOR REGISTRY
// ============================================================================
const monitors = [
    {
        name: 'livekit',
        displayName: 'LiveKit (Voice)',
        category: 'voice',
        criticalFor: ['dispatch', 'session', 'audio'],
        check: checkLiveKit,
    },
    {
        name: 'cartesia',
        displayName: 'Cartesia (TTS)',
        category: 'voice',
        criticalFor: ['audio'],
        check: checkCartesia,
    },
    {
        name: 'deepgram',
        displayName: 'Deepgram (STT)',
        category: 'voice',
        criticalFor: ['audio'],
        check: checkDeepgram,
    },
    {
        name: 'gemini',
        displayName: 'Gemini AI',
        category: 'ai',
        criticalFor: ['session', 'tools'],
        check: checkGemini,
    },
    {
        name: 'openai',
        displayName: 'OpenAI',
        category: 'ai',
        criticalFor: ['session'],
        check: checkOpenAI,
    },
    {
        name: 'firestore',
        displayName: 'Firestore (Database)',
        category: 'database',
        criticalFor: ['memory', 'session'],
        check: checkFirestore,
    },
    {
        name: 'memory',
        displayName: 'Process Memory',
        category: 'integration',
        criticalFor: ['session'],
        check: checkMemory,
    },
    {
        name: 'spotify',
        displayName: 'Spotify (Music)',
        category: 'integration',
        criticalFor: ['tools'],
        check: checkSpotify,
    },
];
// Circuit breakers for health checks themselves
const healthCircuits = new Map();
function getHealthCircuit(name) {
    if (!healthCircuits.has(name)) {
        healthCircuits.set(name, createCircuitBreaker(`health:${name}`, {
            failureThreshold: 3,
            recoveryTimeout: 60000, // 1 minute
            successThreshold: 1,
        }));
    }
    return healthCircuits.get(name);
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Run health check for a specific service
 */
export async function checkServiceHealth(serviceName) {
    const monitor = monitors.find((m) => m.name === serviceName);
    if (!monitor) {
        return null;
    }
    const circuit = getHealthCircuit(serviceName);
    const startTime = Date.now();
    try {
        const result = await circuit.execute(async () => monitor.check());
        // Record metrics for anomaly detection
        recordLatency(`health:${serviceName}`, result.latencyMs);
        recordSuccessRate(`health:${serviceName}`, result.healthy ? 100 : 0);
        // Record to resilience metrics
        resilienceMetrics.recordHealthCheck(serviceName, result.healthy, result.latencyMs, undefined, result.healthy, result.error);
        // Track consecutive failures for alerting
        if (result.healthy) {
            consecutiveFailures.set(serviceName, 0);
        }
        else {
            const failures = (consecutiveFailures.get(serviceName) || 0) + 1;
            consecutiveFailures.set(serviceName, failures);
            if (failures >= ALERT_THRESHOLD) {
                log.error({
                    serviceName,
                    consecutiveFailures: failures,
                    criticalFor: monitor.criticalFor,
                    error: result.error,
                }, `🚨 ALERT: ${monitor.displayName} has failed ${failures} consecutive health checks`);
            }
        }
        // Cache result
        monitor.lastResult = result;
        monitor.lastCheck = Date.now();
        return result;
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        // Circuit is open or check failed
        const result = {
            healthy: false,
            latencyMs,
            error: error instanceof Error ? error.message : 'Health check circuit open',
        };
        // Record failure to resilience metrics
        resilienceMetrics.recordHealthCheck(serviceName, false, latencyMs, undefined, false, result.error);
        // Track consecutive failures
        const failures = (consecutiveFailures.get(serviceName) || 0) + 1;
        consecutiveFailures.set(serviceName, failures);
        monitor.lastResult = result;
        monitor.lastCheck = Date.now();
        return result;
    }
}
/**
 * Run all health checks
 */
export async function runAllHealthChecks() {
    const results = await Promise.allSettled(monitors.map(async (monitor) => {
        const result = await checkServiceHealth(monitor.name);
        return {
            name: monitor.name,
            displayName: monitor.displayName,
            result: result || {
                healthy: false,
                latencyMs: 0,
                error: 'Check failed',
            },
        };
    }));
    const monitorResults = {};
    const unhealthyServices = [];
    const recommendations = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { name, displayName, result: checkResult } = result.value;
            monitorResults[name] = { ...checkResult, name, displayName };
            if (!checkResult.healthy) {
                unhealthyServices.push(displayName);
                // Add recommendations based on service
                const monitor = monitors.find((m) => m.name === name);
                if (monitor) {
                    const criticalText = monitor.criticalFor.join(', ');
                    recommendations.push(`${displayName} is unhealthy (affects ${criticalText}): ${checkResult.error || checkResult.details || 'Unknown issue'}`);
                }
            }
        }
    }
    // Determine overall status
    let overall = 'healthy';
    // Critical if any voice services are down
    const criticalServices = ['livekit', 'cartesia', 'gemini'];
    const criticalDown = criticalServices.some((s) => !monitorResults[s]?.healthy);
    if (criticalDown) {
        overall = 'critical';
    }
    else if (unhealthyServices.length > 0) {
        overall = 'degraded';
    }
    log.info({ overall, unhealthyCount: unhealthyServices.length }, 'Health check complete');
    return {
        overall,
        timestamp: new Date().toISOString(),
        monitors: monitorResults,
        unhealthyServices,
        recommendations,
    };
}
/**
 * Check if a specific capability is available
 */
export function isCapabilityHealthy(capability) {
    for (const monitor of monitors) {
        if (monitor.criticalFor.includes(capability)) {
            if (monitor.lastResult && !monitor.lastResult.healthy) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Get cached health status (doesn't run new checks)
 */
export function getCachedHealthStatus() {
    const monitorResults = {};
    const unhealthyServices = [];
    const recommendations = [];
    for (const monitor of monitors) {
        if (monitor.lastResult) {
            monitorResults[monitor.name] = {
                ...monitor.lastResult,
                name: monitor.name,
                displayName: monitor.displayName,
            };
            if (!monitor.lastResult.healthy) {
                unhealthyServices.push(monitor.displayName);
            }
        }
    }
    const criticalServices = ['livekit', 'cartesia', 'gemini'];
    const criticalDown = criticalServices.some((s) => !monitorResults[s]?.healthy);
    let overall = 'healthy';
    if (criticalDown) {
        overall = 'critical';
    }
    else if (unhealthyServices.length > 0) {
        overall = 'degraded';
    }
    return {
        overall,
        timestamp: new Date().toISOString(),
        monitors: monitorResults,
        unhealthyServices,
        recommendations,
    };
}
/**
 * Get list of all monitors
 */
export function getMonitors() {
    return monitors;
}
// ============================================================================
// BACKGROUND MONITORING
// ============================================================================
/** Interval names for cleanup */
const HEALTH_MONITOR_INTERVAL = 'health-monitor-all';
const CRITICAL_HEALTH_MONITOR_INTERVAL = 'health-monitor-critical';
/** Critical services that get more frequent health checks */
const CRITICAL_SERVICES = ['livekit', 'gemini', 'firestore'];
/**
 * Run health checks for critical services only
 */
async function runCriticalHealthChecks() {
    const results = await Promise.allSettled(CRITICAL_SERVICES.map((service) => checkServiceHealth(service)));
    // Log any failures immediately
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value && !result.value.healthy) {
            log.warn({
                service: CRITICAL_SERVICES[i],
                error: result.value.error,
            }, 'Critical service health check failed');
        }
    }
}
/**
 * Start background health monitoring
 * @param intervalMs - Interval for standard checks (default 30s)
 * @param criticalIntervalMs - Interval for critical service checks (default 15s)
 */
export function startHealthMonitoring(intervalMs = DEFAULT_INTERVAL_MS, criticalIntervalMs = CRITICAL_INTERVAL_MS) {
    if (hasInterval(HEALTH_MONITOR_INTERVAL)) {
        return; // Already running
    }
    log.info({ intervalMs, criticalIntervalMs }, 'Starting health monitoring');
    // Run initial check
    runAllHealthChecks().catch((error) => {
        log.error({ error: String(error) }, 'Initial health check failed');
    });
    // Schedule periodic checks for all services using managed intervals
    registerInterval(HEALTH_MONITOR_INTERVAL, () => {
        runAllHealthChecks().catch((error) => {
            log.error({ error: String(error) }, 'Periodic health check failed');
        });
    }, intervalMs);
    // Schedule more frequent checks for critical services
    registerInterval(CRITICAL_HEALTH_MONITOR_INTERVAL, () => {
        runCriticalHealthChecks().catch((error) => {
            log.error({ error: String(error) }, 'Critical health check failed');
        });
    }, criticalIntervalMs);
}
/**
 * Stop background health monitoring
 */
export function stopHealthMonitoring() {
    clearNamedInterval(HEALTH_MONITOR_INTERVAL);
    clearNamedInterval(CRITICAL_HEALTH_MONITOR_INTERVAL);
    log.info('Stopped health monitoring');
}
/**
 * Check if monitoring is running
 */
export function isMonitoringActive() {
    return hasInterval(HEALTH_MONITOR_INTERVAL);
}
/**
 * Get consecutive failure count for a service
 */
export function getConsecutiveFailures(serviceName) {
    return consecutiveFailures.get(serviceName) || 0;
}
//# sourceMappingURL=health-monitors.js.map