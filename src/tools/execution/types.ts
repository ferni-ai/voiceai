/**
 * Tool Execution Types
 *
 * Type definitions for the progressive tool execution system.
 * Enables "better than human" UX by providing feedback during slow operations.
 */

// ============================================================================
// PROGRESSIVE EXECUTION
// ============================================================================

/**
 * Configuration for progressive feedback during tool execution
 */
export interface ProgressiveExecutionConfig {
  /** Duration to wait silently before any feedback (ms) - fast responses need none */
  silentWindow: number;

  /** When to send first acknowledgment "Checking..." (ms) */
  acknowledgmentAt: number;

  /** When to send update "Still looking..." (ms) */
  updateAt: number;

  /** Hard timeout - return fallback/cached data (ms) */
  hardTimeout: number;

  /** Strategy when hard timeout is reached */
  fallbackStrategy: 'cache' | 'partial' | 'apologize';

  /** Maximum age of cached data to accept as fallback (ms) */
  cacheMaxAge: number;
}

/**
 * Result of a progressive execution
 */
export interface ProgressiveResult<T> {
  /** Whether the execution completed successfully */
  success: boolean;

  /** The result data (if successful) */
  data?: T;

  /** Error message (if failed) */
  error?: string;

  /** How long the execution took (ms) */
  latency: number;

  /** Whether cached/fallback data was used */
  usedFallback: boolean;

  /** Source of the data */
  source: 'live' | 'cache' | 'partial' | 'fallback';

  /** Freshness indicator for cached data */
  freshness?: 'fresh' | 'stale' | 'expired';
}

/**
 * Feedback types during execution
 */
export type FeedbackType = 'acknowledgment' | 'update' | 'apology';

/**
 * Callback to send feedback to the user
 */
export type FeedbackCallback = (message: string, type: FeedbackType) => void;

// ============================================================================
// CACHING
// ============================================================================

/**
 * Cached tool result with metadata
 */
export interface CachedToolResult<T> {
  /** The cached data */
  data: T;

  /** When this was cached */
  timestamp: number;

  /** Source that provided this data */
  source: string;

  /** Cache key */
  key: string;

  /** Freshness based on TTL */
  freshness: 'fresh' | 'stale' | 'expired';

  /** Time-to-live for this entry (ms) */
  ttl: number;
}

/**
 * Cache configuration per tool/data type
 */
export interface CacheConfig {
  /** Time-to-live for fresh data (ms) */
  ttl: number;

  /** Maximum age to serve as stale fallback (ms) */
  maxStaleAge: number;

  /** Whether to refresh in background after serving stale */
  staleWhileRevalidate: boolean;
}

/**
 * Default cache configurations by data category
 */
export const DEFAULT_CACHE_CONFIGS: Record<string, CacheConfig> = {
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

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * State of a circuit breaker
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;

  /** Time window to count failures (ms) */
  failureWindow: number;

  /** Time to wait before trying again (ms) */
  resetTimeout: number;

  /** Latency threshold to count as "slow" (ms) */
  slowThreshold: number;

  /** Number of slow responses before opening */
  slowThreshold_count: number;
}

/**
 * Circuit state for a service
 */
export interface ServiceCircuit {
  /** Service identifier */
  service: string;

  /** Current circuit state */
  state: CircuitState;

  /** Recent failures */
  failures: number;

  /** Timestamp of last failure */
  lastFailure: number;

  /** Rolling average latency (ms) */
  avgLatency: number;

  /** Number of requests tracked */
  requestCount: number;

  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  failureWindow: 60 * 1000, // 1 minute
  resetTimeout: 30 * 1000, // 30 seconds
  slowThreshold: 5000, // 5 seconds
  slowThreshold_count: 3,
};

// ============================================================================
// SOURCE PRIORITIZATION
// ============================================================================

/**
 * Configuration for a data source
 */
export interface SourceConfig {
  /** Source identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Fetch function */
  fetch: (query: string) => Promise<unknown>;

  /** Expected latency (updated dynamically) */
  avgLatency: number;

  /** Success rate (0-1, updated dynamically) */
  reliability: number;

  /** Base priority (lower = higher priority) */
  basePriority: number;

  /** Whether this is a fallback-only source */
  fallbackOnly: boolean;
}

/**
 * Result from a source fetch
 */
export interface SourceResult<T> {
  /** Source that provided this result */
  source: string;

  /** The data */
  data: T;

  /** How long it took (ms) */
  latency: number;

  /** Whether this succeeded */
  success: boolean;

  /** Error if failed */
  error?: string;
}

// ============================================================================
// TOOL TIMEOUT CONFIGURATIONS
// ============================================================================

/**
 * Per-tool timeout overrides
 */
export interface ToolTimeoutConfig {
  /** Hard timeout for this tool (ms) */
  hardTimeout: number;

  /** When to acknowledge (ms) */
  acknowledgmentAt: number;

  /** When to update (ms) */
  updateAt: number;

  /** Cache category for this tool */
  cacheCategory?: string;
}

/**
 * Default tool timeout configurations
 */
export const TOOL_TIMEOUT_CONFIGS: Record<string, ToolTimeoutConfig> = {
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
export function getToolTimeoutConfig(toolName: string): ToolTimeoutConfig {
  return (
    TOOL_TIMEOUT_CONFIGS[toolName] || {
      hardTimeout: 6000,
      acknowledgmentAt: 1500,
      updateAt: 3500,
    }
  );
}
