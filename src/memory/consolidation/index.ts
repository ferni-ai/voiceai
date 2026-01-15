/**
 * Memory Consolidation Module
 *
 * Provides nightly batch processing for memory optimization:
 * - Entity merging (deduplication)
 * - Fact deduplication
 * - Relationship strengthening
 * - Temporal decay
 * - Memory thread updates
 * - Summary generation
 *
 * @module memory/consolidation
 */

export {
  // Service
  MemoryConsolidationService,
  getConsolidationService,
  // Functions
  runConsolidation,
  consolidateUser,
  nightlyConsolidation,
  // Types
  type ConsolidationConfig,
  type ConsolidationResult,
} from './memory-consolidation-service.js';
