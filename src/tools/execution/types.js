/**
 * Tool Execution Types
 *
 * Type definitions for the progressive tool execution system.
 * Enables "better than human" UX by providing feedback during slow operations.
 */
/**
 * Default cache configurations by data category
 */
export const DEFAULT_CACHE_CONFIGS = {
    news: {
        ttl: 5 * 60 * 1000, // 5 min - news changes slowly
        maxStaleAge: 30 * 60 * 1000, // 30 min stale OK
        staleWhileRevalidate: true,
    },
    weather: {
        ttl: 15 * 60 * 1000, // 15 min
        maxStaleAge: 60 * 60 * 1000, // 1 hour stale OK
        staleWhileRevalidate: true,
    },
    stocks: {
        ttl: 60 * 1000, // 1 min - prices change fast
        maxStaleAge: 5 * 60 * 1000, // 5 min stale OK
        staleWhileRevalidate: false, // Stale stock data is dangerous
    },
    calendar: {
        ttl: 30 * 1000, // 30s - events might be added
        maxStaleAge: 2 * 60 * 1000, // 2 min stale OK
        staleWhileRevalidate: true,
    },
    search: {
        ttl: 10 * 60 * 1000, // 10 min
        maxStaleAge: 60 * 60 * 1000, // 1 hour stale OK
        staleWhileRevalidate: true,
    },
};
/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG = {
    failureThreshold: 3,
    failureWindow: 60 * 1000, // 1 minute
    resetTimeout: 30 * 1000, // 30 seconds
    slowThreshold: 5000, // 5 seconds
    slowThreshold_count: 3,
};
/**
 * Default tool timeout configurations
 */
export const TOOL_TIMEOUT_CONFIGS = {
    // News tools - expect slower, more tolerant
    getFinancialNews: {
        hardTimeout: 8000,
        acknowledgmentAt: 1500,
        updateAt: 4000,
        cacheCategory: 'news',
    },
    getStockNews: {
        hardTimeout: 8000,
        acknowledgmentAt: 1500,
        updateAt: 4000,
        cacheCategory: 'news',
    },
    getGeneralNews: {
        hardTimeout: 8000,
        acknowledgmentAt: 1500,
        updateAt: 4000,
        cacheCategory: 'news',
    },
    getTechNews: { hardTimeout: 8000, acknowledgmentAt: 1500, updateAt: 4000, cacheCategory: 'news' },
    searchNewsByTopic: {
        hardTimeout: 10000,
        acknowledgmentAt: 1500,
        updateAt: 5000,
        cacheCategory: 'news',
    },
    // Weather - usually fast
    getWeather: {
        hardTimeout: 5000,
        acknowledgmentAt: 1500,
        updateAt: 3000,
        cacheCategory: 'weather',
    },
    // Stocks - need fresh data
    getStockQuote: {
        hardTimeout: 6000,
        acknowledgmentAt: 1000,
        updateAt: 3000,
        cacheCategory: 'stocks',
    },
    // Search - can be slow
    webSearch: {
        hardTimeout: 12000,
        acknowledgmentAt: 2000,
        updateAt: 6000,
        cacheCategory: 'search',
    },
    // Calendar - usually fast, local
    getCalendarEvents: {
        hardTimeout: 4000,
        acknowledgmentAt: 1000,
        updateAt: 2500,
        cacheCategory: 'calendar',
    },
};
/**
 * Get timeout config for a tool, with defaults
 */
export function getToolTimeoutConfig(toolName) {
    return (TOOL_TIMEOUT_CONFIGS[toolName] || {
        hardTimeout: 6000,
        acknowledgmentAt: 1500,
        updateAt: 3500,
    });
}
//# sourceMappingURL=types.js.map