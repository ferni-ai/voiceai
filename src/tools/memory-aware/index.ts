/**
 * Memory-Aware Tools Module
 *
 * Provides memory access to tools during execution.
 *
 * @module tools/memory-aware
 */

// Types
export type {
  MemoryQuery,
  MemoryResult,
  MemoryCaptureRequest,
  ToolMemoryContext,
  MemoryAwareToolContext,
  UserContextSummary,
  MemoryAwareToolConfig,
  MemoryAwareToolExecution,
} from './types.js';

export { DEFAULT_MEMORY_AWARE_CONFIG } from './types.js';

// Context
export {
  ToolMemoryContextImpl,
  buildMemoryAwareContext,
  MockMemoryStoreAdapter,
  type MemoryStoreAdapter,
} from './context.js';

// Unified Store Adapter (production - uses real Firestore)
export {
  UnifiedStoreAdapter,
  getUnifiedStoreAdapter,
  resetUnifiedStoreAdapter,
  createUnifiedStoreAdapter,
} from './unified-store-adapter.js';

// Executor
export {
  executeWithMemory,
  createMemoryAwareTool,
  createCommitmentTool,
  createPersonRecallTool,
  type MemoryAwareTool,
} from './executor.js';

// Router Integration
export {
  buildRoutingContext,
  calculateToolAdjustments,
  applyAdjustments,
  getMemoryEnhancedTopTools,
  type MemoryEnhancedRoutingContext,
  type ToolPriorityAdjustment,
} from './router-integration.js';
