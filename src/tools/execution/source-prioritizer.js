/**
 * Source Prioritizer
 *
 * Intelligently prioritizes and orchestrates multiple data sources:
 * - Tracks latency and reliability per source
 * - Runs fast sources first, slow sources as backup
 * - Returns as soon as we have "enough" data
 * - Doesn't wait for slow sources if fast ones succeed
 *
 * Philosophy: Get data to the user ASAP. Don't wait for the slowest source
 * when faster ones have already delivered good results.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { circuitBreaker } from './circuit-breaker.js';
const log = getLogger();
const sourceMetrics = new Map();
/**
 * Update metrics for a source after a request
 */
function updateMetrics(sourceId, latencyMs, success) {
    let metrics = sourceMetrics.get(sourceId);
    if (!metrics) {
        metrics = {
            avgLatency: latencyMs,
            successRate: success ? 1 : 0,
            lastUsed: Date.now(),
            totalRequests: 1,
        };
    }
    else {
        // Exponential moving average for latency
        metrics.avgLatency = metrics.avgLatency * 0.7 + latencyMs * 0.3;
        // EMA for success rate
        metrics.successRate = metrics.successRate * 0.8 + (success ? 0.2 : 0);
        metrics.lastUsed = Date.now();
        metrics.totalRequests++;
    }
    sourceMetrics.set(sourceId, metrics);
}
/**
 * Get effective priority for a source (lower = higher priority)
 * Combines base priority with learned latency and reliability
 */
function getEffectivePriority(source) {
    const metrics = sourceMetrics.get(source.id);
    if (!metrics || metrics.totalRequests < 3) {
        // Not enough data, use base priority
        return source.basePriority;
    }
    // Combine factors:
    // - Base priority (configured preference)
    // - Latency (faster is better)
    // - Reliability (higher success rate is better)
    const latencyFactor = metrics.avgLatency / 1000; // Seconds
    const reliabilityPenalty = (1 - metrics.successRate) * 5; // 0-5 penalty
    return source.basePriority + latencyFactor + reliabilityPenalty;
}
/**
 * Fetch from multiple sources with intelligent prioritization
 *
 * Strategy:
 * 1. Sort sources by effective priority (fast + reliable first)
 * 2. Start fast sources immediately
 * 3. Start slow sources after a delay (if fast sources haven't delivered)
 * 4. Return as soon as we have enough results
 * 5. Don't wait for slow sources if we already have data
 */
export async function fetchWithPriority(options) {
    const { sources, query, minResults = 3, maxWait = 8000, slowSourceDelay = 1500, slowThreshold = 2000, transformResult = (data) => (Array.isArray(data) ? data : [data]), } = options;
    const startTime = Date.now();
    const results = [];
    const usedSources = [];
    // Sort sources by effective priority
    const sortedSources = [...sources]
        .filter((s) => !s.fallbackOnly) // Exclude fallback-only sources initially
        .sort((a, b) => getEffectivePriority(a) - getEffectivePriority(b));
    // Classify into fast and slow sources
    const fastSources = sortedSources.filter((s) => {
        const metrics = sourceMetrics.get(s.id);
        return !metrics || metrics.avgLatency < slowThreshold;
    });
    const slowSources = sortedSources.filter((s) => {
        const metrics = sourceMetrics.get(s.id);
        return metrics && metrics.avgLatency >= slowThreshold;
    });
    // Add fallback sources to slow list
    const fallbackSources = sources.filter((s) => s.fallbackOnly);
    slowSources.push(...fallbackSources);
    log.debug({
        fastCount: fastSources.length,
        slowCount: slowSources.length,
        query,
    }, 'Starting prioritized fetch');
    // Track completion
    let resolved = false;
    // Create a promise that resolves when we have enough results or timeout
    return new Promise((resolve) => {
        // Timeout handler
        const timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                log.debug({ elapsed: Date.now() - startTime, resultsCount: results.length }, 'Fetch timeout reached');
                resolve({
                    results,
                    sources: usedSources,
                    latency: Date.now() - startTime,
                    complete: results.length >= minResults,
                });
            }
        }, maxWait);
        // Check if we should resolve
        const checkAndResolve = () => {
            if (resolved)
                return;
            if (results.length >= minResults) {
                resolved = true;
                clearTimeout(timeoutId);
                log.debug({
                    elapsed: Date.now() - startTime,
                    resultsCount: results.length,
                    sources: usedSources,
                }, 'Fetch completed with enough results');
                resolve({
                    results,
                    sources: usedSources,
                    latency: Date.now() - startTime,
                    complete: true,
                });
            }
        };
        // Fetch from a single source
        const fetchFromSource = async (source) => {
            // Check circuit breaker
            if (circuitBreaker.shouldSkip(source.id)) {
                log.debug({ sourceId: source.id }, 'Skipping source (circuit open)');
                return;
            }
            const sourceStart = Date.now();
            try {
                const data = await source.fetch(query);
                const sourceLatency = Date.now() - sourceStart;
                // Update metrics
                updateMetrics(source.id, sourceLatency, true);
                circuitBreaker.recordLatency(source.id, sourceLatency);
                circuitBreaker.recordSuccess(source.id);
                // Transform and add results
                const transformed = transformResult(data, source.id);
                if (transformed.length > 0) {
                    results.push(...transformed);
                    usedSources.push(source.name);
                    log.debug({
                        sourceId: source.id,
                        latency: sourceLatency,
                        count: transformed.length,
                    }, 'Source returned results');
                    checkAndResolve();
                }
            }
            catch (error) {
                const sourceLatency = Date.now() - sourceStart;
                updateMetrics(source.id, sourceLatency, false);
                circuitBreaker.recordFailure(source.id);
                log.debug({ sourceId: source.id, error: String(error), latency: sourceLatency }, 'Source fetch failed');
            }
        };
        // Start fast sources immediately
        const fastPromises = fastSources.map((s) => fetchFromSource(s));
        // Start slow sources after delay (if we don't have results yet)
        setTimeout(() => {
            if (!resolved && results.length < minResults) {
                log.debug({ slowCount: slowSources.length }, 'Starting slow sources');
                slowSources.forEach((s) => fetchFromSource(s));
            }
        }, slowSourceDelay);
        // Wait for all fast sources to complete (or timeout)
        Promise.allSettled(fastPromises).then(() => {
            // If we still don't have enough and haven't resolved, wait a bit more
            if (!resolved && results.length > 0 && results.length < minResults) {
                // Give slow sources a bit more time
                setTimeout(checkAndResolve, slowSourceDelay);
            }
        });
    });
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Get current metrics for all sources
 */
export function getSourceMetrics() {
    return new Map(sourceMetrics);
}
/**
 * Reset metrics for testing
 */
export function resetMetrics() {
    sourceMetrics.clear();
}
/**
 * Create a source config with defaults
 */
export function createSource(id, name, fetch, options) {
    return {
        id,
        name,
        fetch,
        avgLatency: options?.avgLatency ?? 2000,
        reliability: options?.reliability ?? 0.9,
        basePriority: options?.basePriority ?? 5,
        fallbackOnly: options?.fallbackOnly ?? false,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { updateMetrics };
//# sourceMappingURL=source-prioritizer.js.map