/**
 * Tool Response Cache - Re-export from services layer
 *
 * This file re-exports from src/services/performance/tool-response-cache.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * @module performance/tool-response-cache
 * @deprecated Import from '../../../services/performance/tool-response-cache.js' instead
 */

export {
  // Types
  type CachedToolResponse,
  type ToolCacheConfig,
  type ToolCacheMetrics,
  // Constants
  TTL_BY_TOOL,
  CACHE_INVALIDATION_MAP,
  // Functions
  getToolResponseCache,
  resetToolResponseCache,
  checkToolCache,
  cacheToolResult,
  invalidateToolCache,
  clearSessionToolCache,
  getToolCacheMetrics,
  // Default export
  default,
} from '../../../services/performance/tool-response-cache.js';
