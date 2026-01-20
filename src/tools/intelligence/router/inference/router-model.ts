/**
 * Router Model
 *
 * ONNX inference wrapper for the Ferni Router Model.
 * Provides fast (~50ms) tool prediction from user queries.
 *
 * @module tools/intelligence/router/inference/router-model
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getOnnxRuntime, runInferenceProtected } from '../../../../utils/transformers-loader.js';
import type { FeatureEncoder } from './feature-encoder.js';
import { initializeFeatureEncoder } from './feature-encoder.js';
import { ModelLoader, getModelLoader } from './model-loader.js';
import type {
  RouterInput,
  RouterOutput,
  ToolPrediction,
  RouterModelConfig,
  RouterModelHealth,
  DEFAULT_ROUTER_CONFIG,
} from './types.js';

const log = createLogger({ module: 'ftis:router-model' });

// ============================================================================
// ROUTER MODEL
// ============================================================================

export class RouterModel {
  private config: RouterModelConfig;
  private loader: ModelLoader;
  private encoder: FeatureEncoder | null = null;
  private initialized = false;

  // Metrics
  private totalInferences = 0;
  private totalLatencyMs = 0;
  private lastError: string | null = null;

  constructor(config: Partial<RouterModelConfig> = {}) {
    this.config = {
      modelPath: 'models/ferni-router.onnx',
      tokenizerPath: 'models/ferni-router-tokenizer',
      labelMapPath: 'models/label_map.json',
      maxLength: 512,
      confidenceThreshold: 0.7,
      topK: 10,
      useGPU: false,
      cacheSize: 1000,
      ...config,
    };
    this.loader = new ModelLoader(this.config);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the router model
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();
    log.info('Initializing Ferni Router Model');

    try {
      // Load the ONNX model
      await this.loader.load();

      // Initialize the feature encoder
      this.encoder = await initializeFeatureEncoder(this.config);

      this.initialized = true;
      log.info({ durationMs: Date.now() - startTime }, 'Router model initialized');
    } catch (error) {
      this.lastError = String(error);
      log.error({ error: String(error) }, 'Failed to initialize router model');
      throw error;
    }
  }

  /**
   * Check if model is ready for inference
   */
  isReady(): boolean {
    return this.initialized && this.loader.isLoaded();
  }

  // ==========================================================================
  // INFERENCE
  // ==========================================================================

  /**
   * Predict tools for a query
   */
  async predict(input: RouterInput): Promise<RouterOutput> {
    if (!this.isReady()) {
      throw new Error('Router model not initialized');
    }

    const startTime = Date.now();

    try {
      // Encode input features
      const features = await this.encoder!.encode(input);

      // Run ONNX inference (using protected execution with circuit breaker)
      const model = this.loader.getModel()!;
      const session = model.session;

      // Prepare tensors using protected ONNX runtime getter
      const ort = await getOnnxRuntime();

      const inputIdsTensor = new ort.Tensor(
        'int64',
        BigInt64Array.from(features.inputIds.map(BigInt)),
        [1, features.inputIds.length]
      );
      const attentionMaskTensor = new ort.Tensor(
        'int64',
        BigInt64Array.from(features.attentionMask.map(BigInt)),
        [1, features.attentionMask.length]
      );

      // Run inference with circuit breaker protection
      const outputs = await runInferenceProtected<Record<string, { data: Float32Array | number[] }>>(
        session,
        {
          input_ids: inputIdsTensor,
          attention_mask: attentionMaskTensor,
        }
      );

      // Get logits
      const logits = outputs.logits?.data || outputs[Object.keys(outputs)[0]]?.data;
      if (!logits) {
        throw new Error('No output from model');
      }

      // Convert to probabilities (sigmoid for multi-label)
      const probs = Array.from(logits).map((x) => 1 / (1 + Math.exp(-Number(x))));

      // Get top-K predictions
      const predictions = this.extractPredictions(probs, model.inverseLabeMap);

      // Calculate metrics
      const latencyMs = Date.now() - startTime;
      this.totalInferences++;
      this.totalLatencyMs += latencyMs;

      const topConfidence = predictions[0]?.confidence || 0;

      return {
        predictions,
        topConfidence,
        skipLLM: topConfidence >= this.config.confidenceThreshold,
        latencyMs,
        modelVersion: model.version,
      };
    } catch (error) {
      this.lastError = String(error);
      log.error({ error: String(error), query: input.query }, 'Router inference failed');
      throw error;
    }
  }

  /**
   * Predict tools for multiple queries in batch
   */
  async predictBatch(inputs: RouterInput[]): Promise<RouterOutput[]> {
    // For now, run sequentially
    // TODO: Implement true batched inference for better throughput
    return Promise.all(inputs.map(async (input) => this.predict(input)));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Extract top-K predictions from probabilities
   */
  private extractPredictions(
    probs: number[],
    inverseLabeMap: Record<number, string>
  ): ToolPrediction[] {
    // Create index-probability pairs
    const indexed = probs.map((prob, idx) => ({ idx, prob }));

    // Sort by probability descending
    indexed.sort((a, b) => b.prob - a.prob);

    // Take top-K
    const topK = indexed.slice(0, this.config.topK);

    // Convert to predictions
    return topK.map(({ idx, prob }, rank) => ({
      toolId: inverseLabeMap[idx] || `unknown_${idx}`,
      confidence: prob,
      rank: rank + 1,
    }));
  }

  // Note: ONNX runtime is now imported from transformers-loader.ts
  // which provides crash protection via circuit breaker and timeouts.

  // ==========================================================================
  // HEALTH & METRICS
  // ==========================================================================

  /**
   * Get model health status
   */
  getHealth(): RouterModelHealth {
    const model = this.loader.getModel();
    const numTools = model ? Object.keys(model.labelMap).length : 0;

    return {
      loaded: this.isReady(),
      version: model?.version || 'unknown',
      numTools,
      avgLatencyMs: this.totalInferences > 0 ? this.totalLatencyMs / this.totalInferences : 0,
      totalInferences: this.totalInferences,
      lastError: this.lastError || undefined,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalInferences = 0;
    this.totalLatencyMs = 0;
    this.lastError = null;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Shutdown the router model
   */
  async shutdown(): Promise<void> {
    await this.loader.unload();
    if (this.encoder) {
      this.encoder.clearCache();
    }
    this.initialized = false;
    log.info('Router model shutdown');
  }

  /**
   * Reload the model (e.g., after update)
   */
  async reload(): Promise<void> {
    await this.loader.reload();
    if (this.encoder) {
      this.encoder.clearCache();
    }
    log.info('Router model reloaded');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let routerInstance: RouterModel | null = null;

export function getRouterModel(): RouterModel {
  if (!routerInstance) {
    routerInstance = new RouterModel();
  }
  return routerInstance;
}

export async function initializeRouterModel(
  config?: Partial<RouterModelConfig>
): Promise<RouterModel> {
  routerInstance = new RouterModel(config);
  await routerInstance.initialize();
  return routerInstance;
}

export function resetRouterModel(): void {
  if (routerInstance) {
    routerInstance.shutdown().catch((err) => {
      log.warn({ error: String(err) }, 'Failed to shutdown router model during reset');
    });
  }
  routerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

/**
 * Quick prediction helper
 */
export async function predictTools(
  query: string,
  context?: Partial<Omit<RouterInput, 'query'>>
): Promise<RouterOutput> {
  const router = getRouterModel();

  if (!router.isReady()) {
    await router.initialize();
  }

  return router.predict({
    query,
    personaId: context?.personaId || 'ferni',
    emotion: context?.emotion || 'neutral',
    timeOfDay: context?.timeOfDay || 'afternoon',
    recentTools: context?.recentTools || [],
    userAffinities: context?.userAffinities || {},
  });
}
