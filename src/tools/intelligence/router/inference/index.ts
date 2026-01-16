/**
 * Router Inference Module
 *
 * ONNX inference runtime for the Ferni Router Model.
 *
 * @module tools/intelligence/router/inference
 */

// Router model
export {
  RouterModel,
  getRouterModel,
  initializeRouterModel,
  resetRouterModel,
  predictTools,
} from './router-model.js';

// Feature encoder
export {
  FeatureEncoder,
  getFeatureEncoder,
  initializeFeatureEncoder,
  resetFeatureEncoder,
} from './feature-encoder.js';

// Model loader
export { ModelLoader, getModelLoader, resetModelLoader } from './model-loader.js';

// Types
export type {
  RouterInput,
  RouterOutput,
  ToolPrediction,
  RouterModelConfig,
  RouterModelHealth,
  EncodedFeatures,
} from './types.js';

export { DEFAULT_ROUTER_CONFIG } from './types.js';
