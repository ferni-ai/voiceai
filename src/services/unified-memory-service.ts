/**
 * Unified Memory Service (Re-export Shim)
 *
 * This module has been consolidated into services/memory/.
 * This shim preserves backward compatibility for existing importers.
 *
 * @module services/unified-memory-service
 * @deprecated Import from './memory/index.js' instead
 */

// Main service, types, and convenience functions
export {
  UnifiedMemoryService,
  getUnifiedMemoryService,
  resetUnifiedMemoryService,
  getPendingSurfacingEventIds,
  getMostRecentPendingSurfacingEvent,
  recordMemoryReaction,
  getMemory,
  saveMemoryDirect,
} from './memory/memory-service.js';

export type {
  TimingDecision,
  PhrasingSuggestion,
  MemoryFeedback,
  AssociatedMemory,
  EnhancedRecallResult,
  ToolSearchOptions,
  SimpleRecallContext,
  MemoryWriteInput,
} from './memory/memory-service-types.js';

// Internal engines (TimingEngine, PhrasingEngine, FeedbackCollector)
export {
  TimingEngine,
  PhrasingEngine,
  FeedbackCollector,
} from './memory/memory-service-engines.js';
