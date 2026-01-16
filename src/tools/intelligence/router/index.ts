/**
 * Router Module
 *
 * Ferni Router Model for fast tool selection.
 *
 * @module tools/intelligence/router
 */

// Inference runtime
export {
  RouterModel,
  getRouterModel,
  initializeRouterModel,
  resetRouterModel,
  predictTools,
  FeatureEncoder,
  ModelLoader,
  type RouterInput,
  type RouterOutput,
  type ToolPrediction,
  type RouterModelConfig,
  type RouterModelHealth,
  DEFAULT_ROUTER_CONFIG,
} from './inference/index.js';

// Training data pipeline
export {
  TrainingDataCollector,
  getTrainingDataCollector,
  TrainingDataAugmenter,
  getTrainingDataAugmenter,
  DatasetExporter,
  exportToJsonl,
  exportToHuggingFace,
  type TrainingExample,
  type DatasetMetadata,
} from './training/index.js';
