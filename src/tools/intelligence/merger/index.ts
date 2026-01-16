/**
 * Tool Merger Module
 *
 * Identifies and merges semantically equivalent tools to reduce redundancy.
 *
 * @module tools/intelligence/merger
 */

// Core merger
export { ToolMerger, getToolMerger, resetToolMerger } from './tool-merger.js';

// Equivalence classifier
export {
  EquivalenceClassifier,
  getEquivalenceClassifier,
  resetEquivalenceClassifier,
} from './equivalence-classifier.js';

// Merge registry
export {
  MergeRegistry,
  getMergeRegistry,
  initializeMergeRegistry,
  resetMergeRegistry,
} from './merge-registry.js';

// Types
export type {
  ToolDefinition,
  ToolCluster,
  EquivalenceResult,
  MergeCandidate,
  MergeStats,
  ToolMergerConfig,
  MergeRegistryEntry,
  FirestoreToolCluster,
  FirestoreMergeRegistry,
} from './types.js';

export { DEFAULT_MERGER_CONFIG } from './types.js';
