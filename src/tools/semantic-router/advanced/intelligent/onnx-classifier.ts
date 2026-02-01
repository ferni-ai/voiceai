/**
 * ONNX-based Tool Classifier
 *
 * Uses the trained Qwen model (via ONNX Runtime) for fast, accurate tool classification.
 * This is the ML backend for the IntentClassifier - runs in ~50-100ms with 98.0% top-1 accuracy.
 *
 * Architecture:
 * 1. Load ONNX model at startup (singleton)
 * 2. Warmup to avoid cold-start latency
 * 3. Classify user input → returns tool predictions with confidence
 *
 * @module semantic-router/advanced/intelligent/onnx-classifier
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import path from 'path';

const log = createLogger({ module: 'onnx-classifier' });

// ============================================================================
// TYPES
// ============================================================================

export interface OnnxClassifierConfig {
  /** Path to ONNX model file */
  modelPath: string;
  /** Path to tokenizer.json */
  tokenizerPath: string;
  /** Path to label_map.json */
  labelMapPath: string;
  /** Maximum sequence length */
  maxLength: number;
  /** Minimum confidence threshold */
  threshold: number;
  /** Top-K predictions to return */
  topK: number;
  /** Number of threads (0 = auto) */
  numThreads?: number;
}

export interface ToolPrediction {
  toolId: string;
  confidence: number;
}

export interface ClassificationOutput {
  predictions: ToolPrediction[];
  latencyMs: number;
  source: 'onnx';
}

// ============================================================================
// SINGLETON ROUTER INSTANCE
// ============================================================================

type OnnxRouterType = {
  predict(query: string): { predictions: ToolPrediction[]; latencyMs: number };
  getNumTools(): number;
  getLabels(): string[];
  warmup(): number;
};

let routerInstance: OnnxRouterType | null = null;
let initializationPromise: Promise<void> | null = null;
let initializationError: Error | null = null;

/**
 * Detect which model version is available.
 * Checks for V7 first (hierarchical), then V6, then V5 (flat).
 * Can be overridden with ROUTER_MODEL_VERSION env var.
 */
export function detectModelVersion(): 'v7' | 'v6' | 'v5' | 'none' {
  const override = process.env.ROUTER_MODEL_VERSION;
  if (override === 'v7' || override === 'v6' || override === 'v5') return override;

  const fs = require('fs') as typeof import('fs');
  const modelsRoot = path.resolve(process.cwd(), 'models');

  // Check V7 (both stages must exist)
  const v7Stage1 = path.join(modelsRoot, 'ferni-router-v7-stage1', 'model.onnx');
  const v7Stage2 = path.join(modelsRoot, 'ferni-router-v7-stage2', 'model.onnx');
  if (fs.existsSync(v7Stage1) && fs.existsSync(v7Stage2)) {
    return 'v7';
  }

  // Check V6
  const v6Model = path.join(modelsRoot, 'ferni-router-v6-860', 'model.onnx');
  if (fs.existsSync(v6Model)) {
    return 'v6';
  }

  // Check V5
  const v5Model = path.join(modelsRoot, 'ferni-router-v5-860', 'model.onnx');
  if (fs.existsSync(v5Model)) {
    return 'v5';
  }

  return 'none';
}

/**
 * Default model paths (relative to project root)
 */
function getDefaultConfig(): OnnxClassifierConfig {
  // V6-860: Qwen3-1.7B, 861 labels (860 tools + __no_tool__), hard negatives + open intent boost
  const modelDir = path.resolve(process.cwd(), 'models/ferni-router-v6-860');

  return {
    modelPath: path.join(modelDir, 'model.onnx'),
    tokenizerPath: path.join(modelDir, 'tokenizer.json'),
    labelMapPath: path.join(modelDir, 'label_map.json'),
    maxLength: 128,
    threshold: 0.1, // Low threshold, let caller filter
    topK: 5,
    numThreads: 0, // Auto-detect
  };
}

/**
 * Initialize the ONNX router singleton.
 * Call this at startup to avoid cold-start latency on first classification.
 */
export async function initializeOnnxClassifier(
  config: Partial<OnnxClassifierConfig> = {}
): Promise<void> {
  // Already initialized
  if (routerInstance) {
    return;
  }

  // Already initializing
  if (initializationPromise) {
    return initializationPromise;
  }

  // Previous initialization failed
  if (initializationError) {
    throw initializationError;
  }

  initializationPromise = doInitialize(config);
  return initializationPromise;
}

async function doInitialize(config: Partial<OnnxClassifierConfig>): Promise<void> {
  const startTime = Date.now();

  try {
    // Check if ONNX classifier is disabled
    if (process.env.DISABLE_ONNX_CLASSIFIER === 'true') {
      log.info('ONNX classifier disabled via DISABLE_ONNX_CLASSIFIER');
      throw new Error('ONNX classifier disabled');
    }

    // Merge with defaults
    const fullConfig = { ...getDefaultConfig(), ...config };

    // Check if model file exists
    const fs = await import('fs');
    if (!fs.existsSync(fullConfig.modelPath)) {
      log.warn({ modelPath: fullConfig.modelPath }, 'ONNX model not found, classifier disabled');
      throw new Error(`ONNX model not found: ${fullConfig.modelPath}`);
    }

    // Import the Rust bindings
    const { OnnxRouter } = await import('@ferni/perf');

    // Create the router
    routerInstance = new OnnxRouter({
      modelPath: fullConfig.modelPath,
      tokenizerPath: fullConfig.tokenizerPath,
      labelMapPath: fullConfig.labelMapPath,
      maxLength: fullConfig.maxLength,
      threshold: fullConfig.threshold,
      topK: fullConfig.topK,
      numThreads: fullConfig.numThreads,
    }) as OnnxRouterType;

    // Warmup the model
    const warmupMs = routerInstance.warmup();

    const totalMs = Date.now() - startTime;
    log.info(
      {
        numTools: routerInstance.getNumTools(),
        warmupMs: warmupMs.toFixed(1),
        totalMs,
      },
      '🧠 ONNX classifier initialized'
    );
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: String(error) }, 'ONNX classifier initialization failed - falling back to patterns');
    throw initializationError;
  }
}

/**
 * Check if ONNX classifier is available.
 */
export function isOnnxClassifierAvailable(): boolean {
  return routerInstance !== null;
}

/**
 * Classify user input using the ONNX model.
 *
 * @param userText - The user's input text
 * @returns Classification output with predictions and latency
 * @throws If classifier is not initialized
 */
export function classifyWithOnnx(userText: string): ClassificationOutput {
  if (!routerInstance) {
    throw new Error('ONNX classifier not initialized - call initializeOnnxClassifier() first');
  }

  const result = routerInstance.predict(userText);

  return {
    predictions: result.predictions,
    latencyMs: result.latencyMs,
    source: 'onnx',
  };
}

/**
 * Classify user input, returning null if classifier is unavailable.
 * This is the safe version for optional ML enhancement.
 */
export function classifyWithOnnxSafe(userText: string): ClassificationOutput | null {
  if (!routerInstance) {
    return null;
  }

  try {
    return classifyWithOnnx(userText);
  } catch (error) {
    log.debug({ error: String(error) }, 'ONNX classification failed');
    return null;
  }
}

/**
 * Get the tools covered by the ONNX model.
 */
export function getOnnxToolLabels(): string[] {
  if (!routerInstance) {
    return [];
  }
  return routerInstance.getLabels();
}

/**
 * Get the number of tools covered by the ONNX model.
 */
export function getOnnxToolCount(): number {
  if (!routerInstance) {
    return 0;
  }
  return routerInstance.getNumTools();
}

/**
 * Shutdown the ONNX classifier and release resources.
 */
export function shutdownOnnxClassifier(): void {
  routerInstance = null;
  initializationPromise = null;
  initializationError = null;
  log.info('ONNX classifier shut down');
}
