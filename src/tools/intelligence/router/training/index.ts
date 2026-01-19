/**
 * Router Training Module
 *
 * Training data collection, augmentation, and export for the Ferni Router Model.
 *
 * @module tools/intelligence/router/training
 */

// Data collector
export {
  TrainingDataCollector,
  getTrainingDataCollector,
  resetTrainingDataCollector,
} from './data-collector.js';

// Data augmenter
export {
  TrainingDataAugmenter,
  getTrainingDataAugmenter,
  resetTrainingDataAugmenter,
} from './data-augmenter.js';

// Synthetic generator (comprehensive generation for all 880+ tools)
export {
  SyntheticTrainingGenerator,
  getSyntheticGenerator,
  resetSyntheticGenerator,
  type SemanticToolMapping,
  type GenerationResult,
  type GenerationStats,
} from './synthetic-generator.js';

// Dataset export
export { DatasetExporter, exportToJsonl, exportToHuggingFace } from './export-dataset.js';

// Types
export type {
  TrainingExample,
  DatasetMetadata,
  HardNegative,
  SyntheticGenerationConfig,
  ExportOptions,
} from './types.js';

export { DEFAULT_SYNTHETIC_CONFIG, DEFAULT_EXPORT_OPTIONS } from './types.js';
