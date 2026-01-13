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
export { type ProgressiveExecutionConfig, type ProgressiveResult, type FeedbackCallback, type FeedbackType, type CachedToolResult, type CacheConfig, DEFAULT_CACHE_CONFIGS, type CircuitState, type CircuitBreakerConfig, type ServiceCircuit, DEFAULT_CIRCUIT_CONFIG, type SourceConfig, type SourceResult, type ToolTimeoutConfig, TOOL_TIMEOUT_CONFIGS, getToolTimeoutConfig, } from './types.js';
export { executeWithProgressiveFeedback, makeProgressive, DEFAULT_PROGRESSIVE_CONFIG, ACKNOWLEDGMENTS, UPDATES, APOLOGIES, } from './progressive-executor.js';
export { toolCache, ToolResultCache } from './tool-cache.js';
export { circuitBreaker, ServiceCircuitBreaker } from './circuit-breaker.js';
export { fetchWithPriority, getSourceMetrics, resetMetrics, createSource, type FetchWithPriorityOptions, } from './source-prioritizer.js';
export { type ToolStatus, type EmotionalContext, type RelationshipStage, type ToolExecutionContext, type PresenceFeedback, type ToolTimingContext, type ToolPresenceEvent, selectPresenceFeedback, generateToolTimingContext, generateToolContextInjection, toolPresenceEvents, emitToolPresence, startToolPresence, stopToolPresence, cleanupSessionToolPresence, PRESENCE_PATTERNS, TIME_MODIFIERS, TOOL_SEMANTICS, } from './semantic-tool-presence.js';
//# sourceMappingURL=index.d.ts.map