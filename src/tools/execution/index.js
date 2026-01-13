/**
 * Tool Execution Module
 *
 * Provides "better than human" tool execution with:
 * - Progressive feedback during slow operations
 * - Smart caching with stale-while-revalidate
 * - Circuit breaker for failing/slow services
 * - Source prioritization for multi-source tools
 *
 * Philosophy: Never leave the user wondering what's happening.
 * Fast responses need no feedback. Slow responses get acknowledgment.
 * Timeouts get cached data with apology. Failures get graceful fallbacks.
 *
 * @example
 * ```typescript
 * import {
 *   executeWithProgressiveFeedback,
 *   toolCache,
 *   circuitBreaker,
 *   fetchWithPriority,
 * } from './execution/index.js';
 *
 * // Execute with progressive feedback
 * const result = await executeWithProgressiveFeedback(
 *   'getNews',
 *   () => fetchNews(topic),
 *   (msg) => sendToUser(msg)
 * );
 *
 * // Use caching
 * toolCache.set('getNews', topic, result.data, 'news');
 * const cached = toolCache.getWithStaleness('getNews', topic);
 *
 * // Check circuit breaker
 * if (circuitBreaker.shouldSkip('newsAPI')) {
 *   // Use fallback
 * }
 *
 * // Fetch from multiple sources with prioritization
 * const { results } = await fetchWithPriority({
 *   sources: [newsDataSource, gnewsSource, rssSource],
 *   query: topic,
 *   minResults: 3,
 * });
 * ```
 */
// ============================================================================
// TYPES
// ============================================================================
export { DEFAULT_CACHE_CONFIGS, DEFAULT_CIRCUIT_CONFIG, TOOL_TIMEOUT_CONFIGS, getToolTimeoutConfig, } from './types.js';
// ============================================================================
// PROGRESSIVE EXECUTOR
// ============================================================================
export { executeWithProgressiveFeedback, makeProgressive, DEFAULT_PROGRESSIVE_CONFIG, ACKNOWLEDGMENTS, UPDATES, APOLOGIES, } from './progressive-executor.js';
// ============================================================================
// CACHING
// ============================================================================
export { toolCache, ToolResultCache } from './tool-cache.js';
// ============================================================================
// CIRCUIT BREAKER
// ============================================================================
export { circuitBreaker, ServiceCircuitBreaker } from './circuit-breaker.js';
// ============================================================================
// SOURCE PRIORITIZATION
// ============================================================================
export { fetchWithPriority, getSourceMetrics, resetMetrics, createSource, } from './source-prioritizer.js';
// ============================================================================
// SEMANTIC TOOL PRESENCE ("Better than Human")
// ============================================================================
export { 
// Core functions
selectPresenceFeedback, generateToolTimingContext, generateToolContextInjection, 
// Event system
toolPresenceEvents, emitToolPresence, 
// Session management
startToolPresence, stopToolPresence, cleanupSessionToolPresence, 
// Constants for customization
PRESENCE_PATTERNS, TIME_MODIFIERS, TOOL_SEMANTICS, } from './semantic-tool-presence.js';
//# sourceMappingURL=index.js.map