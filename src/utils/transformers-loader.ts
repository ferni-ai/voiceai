/**
 * Unified Transformers.js Loader
 *
 * This module provides a single, consistent interface for loading transformers.js
 * and ONNX runtime across the codebase. It solves several critical issues:
 *
 * 1. **OrtEnv Conflict Prevention**: Using both @huggingface/transformers AND
 *    @xenova/transformers causes ONNX runtime to crash with "env_ptr == p_instance_.get()
 *    was false" because they manage the same global OrtEnv differently.
 *
 * 2. **Thread Management**: Configures ONNX session options to prevent CPU
 *    over-subscription in multi-process Node.js environments.
 *
 * 3. **Lazy Loading**: Defers ONNX initialization until first use to avoid
 *    crashes during module import.
 *
 * 4. **Graceful Degradation**: Falls back gracefully if native bindings fail.
 *
 * @module utils/transformers-loader
 * @see https://github.com/microsoft/onnxruntime/issues/24144 (SIGSEGV regression)
 * @see https://onnxruntime.ai/docs/performance/tune-performance/threading.html
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'transformers-loader' });

// ============================================================================
// TYPES
// ============================================================================

export interface TransformersModule {
  AutoTokenizer: any;
  pipeline: any;
  env?: any;
}

export interface OnnxRuntimeModule {
  InferenceSession: any;
  Tensor: any;
  env?: any;
}

export interface SessionOptions {
  /** Number of threads for intra-operator parallelism (default: 2) */
  intraOpNumThreads?: number;
  /** Number of threads for inter-operator parallelism (default: 1) */
  interOpNumThreads?: number;
  /** Execution mode: 'sequential' or 'parallel' (default: 'sequential') */
  executionMode?: 'sequential' | 'parallel';
  /** Graph optimization level: 'disabled' | 'basic' | 'extended' | 'all' (default: 'all') */
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
}

// ============================================================================
// STATE (singleton pattern)
// ============================================================================

let transformersModule: TransformersModule | null = null;
let onnxRuntimeModule: OnnxRuntimeModule | null = null;
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;
let initError: Error | null = null;

// Default session options optimized for server environments
const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  intraOpNumThreads: 2,      // Limit internal parallelism
  interOpNumThreads: 1,      // Sequential operator execution
  executionMode: 'sequential',
  graphOptimizationLevel: 'all',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize transformers.js and ONNX runtime.
 * This is automatically called on first use, but can be called explicitly
 * for eager initialization.
 *
 * @throws If initialization fails after all fallbacks are exhausted
 */
export async function initializeTransformers(): Promise<void> {
  // Return immediately if already initialized
  if (isInitialized && transformersModule) {
    return;
  }

  // Return cached error if initialization previously failed
  if (initError) {
    throw initError;
  }

  // Deduplicate concurrent initialization attempts
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  try {
    log.debug('Initializing unified transformers loader...');

    // ========================================================================
    // CRITICAL: Use ONLY @huggingface/transformers
    // Do NOT import @xenova/transformers - it will conflict with OrtEnv!
    // ========================================================================

    const transformers = await import('@huggingface/transformers');

    // Configure transformers.js environment
    if (transformers.env) {
      // Disable remote model loading in production for security
      (transformers.env as any).allowRemoteModels = process.env.NODE_ENV !== 'production';

      // Use local cache directory
      (transformers.env as any).cacheDir = process.env.TRANSFORMERS_CACHE || './.cache/transformers';
    }

    transformersModule = transformers as TransformersModule;

    log.info('✅ Transformers.js initialized (using @huggingface/transformers ONLY)');
    isInitialized = true;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    log.error({ error: String(error) }, 'Failed to initialize transformers.js');
    throw initError;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Initialize ONNX runtime with proper session options.
 * Separate from transformers to allow direct ONNX model loading.
 */
export async function initializeOnnxRuntime(): Promise<OnnxRuntimeModule> {
  if (onnxRuntimeModule) {
    return onnxRuntimeModule;
  }

  try {
    // Try onnxruntime-node first (native bindings, faster)
    const ort = await import('onnxruntime-node');

    // Configure ONNX environment to prevent conflicts
    if (ort.env) {
      // Set number of threads for the thread pool (use any cast for readonly bypass)
      const env = ort.env as any;
      if (env.wasm) {
        env.wasm.numThreads = DEFAULT_SESSION_OPTIONS.intraOpNumThreads;
      }
    }

    onnxRuntimeModule = ort as OnnxRuntimeModule;
    log.debug('Using onnxruntime-node (native bindings)');
    return onnxRuntimeModule;
  } catch (nodeError) {
    log.debug({ error: String(nodeError) }, 'onnxruntime-node not available, trying web version');

    try {
      // Fall back to onnxruntime-web (WASM, slower but more compatible)
      const ort = await import('onnxruntime-web');
      onnxRuntimeModule = ort as unknown as OnnxRuntimeModule;
      log.debug('Using onnxruntime-web (WASM fallback)');
      return onnxRuntimeModule;
    } catch (webError) {
      const error = new Error(
        `ONNX Runtime not available. Node error: ${nodeError}, Web error: ${webError}`
      );
      log.error({ error: String(error) }, 'Failed to load ONNX runtime');
      throw error;
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the transformers.js module (lazy initialization).
 */
export async function getTransformers(): Promise<TransformersModule> {
  await initializeTransformers();
  if (!transformersModule) {
    throw new Error('Transformers.js failed to initialize');
  }
  return transformersModule;
}

/**
 * Get the ONNX runtime module (lazy initialization).
 */
export async function getOnnxRuntime(): Promise<OnnxRuntimeModule> {
  return initializeOnnxRuntime();
}

/**
 * Create an ONNX inference session with proper configuration.
 *
 * @param modelPath - Path to the ONNX model file
 * @param options - Optional session configuration
 * @returns Configured InferenceSession
 */
export async function createInferenceSession(
  modelPath: string,
  options: SessionOptions = {}
): Promise<any> {
  const ort = await getOnnxRuntime();

  // Merge with defaults
  const sessionOptions = { ...DEFAULT_SESSION_OPTIONS, ...options };

  // Create session options object
  // Note: graphOptimizationLevel must be a STRING in onnxruntime-node
  // Do NOT specify executionProviders - let ONNX auto-detect (v1.20.1 defaults to CPU)
  const ortSessionOptions: Record<string, unknown> = {
    intraOpNumThreads: sessionOptions.intraOpNumThreads || 1,
    interOpNumThreads: sessionOptions.interOpNumThreads || 1,
    graphOptimizationLevel: sessionOptions.graphOptimizationLevel || 'all',
  };

  log.debug(
    {
      model: modelPath.split('/').pop(),
      intraThreads: ortSessionOptions.intraOpNumThreads,
      interThreads: ortSessionOptions.interOpNumThreads,
      optimizationLevel: sessionOptions.graphOptimizationLevel,
    },
    'Creating ONNX session'
  );

  return ort.InferenceSession.create(modelPath, ortSessionOptions);
}

/**
 * Create an AutoTokenizer from a pretrained model.
 *
 * @param modelId - HuggingFace model ID or local path
 * @param options - Tokenizer options
 */
export async function createTokenizer(
  modelId: string,
  options: { localFilesOnly?: boolean } = {}
): Promise<any> {
  const transformers = await getTransformers();
  return transformers.AutoTokenizer.from_pretrained(modelId, {
    local_files_only: options.localFilesOnly ?? false,
  });
}

/**
 * Create a transformers.js pipeline.
 *
 * @param task - Pipeline task (e.g., 'feature-extraction', 'text-classification')
 * @param modelId - HuggingFace model ID
 * @param options - Pipeline options
 */
export async function createPipeline(
  task: string,
  modelId: string,
  options: { device?: string; quantized?: boolean } = {}
): Promise<any> {
  const transformers = await getTransformers();
  return transformers.pipeline(task, modelId, {
    device: options.device ?? 'cpu',
    quantized: options.quantized ?? true,
  });
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if transformers.js is ready.
 */
export function isTransformersReady(): boolean {
  return isInitialized && transformersModule !== null;
}

/**
 * Check if ONNX runtime is ready.
 */
export function isOnnxRuntimeReady(): boolean {
  return onnxRuntimeModule !== null;
}

/**
 * Get initialization status for health checks.
 */
export function getLoaderStatus(): {
  transformersReady: boolean;
  onnxRuntimeReady: boolean;
  initError: string | null;
} {
  return {
    transformersReady: isTransformersReady(),
    onnxRuntimeReady: isOnnxRuntimeReady(),
    initError: initError ? initError.message : null,
  };
}

// ============================================================================
// CLEANUP (for testing)
// ============================================================================

/**
 * Reset loader state (for testing only).
 */
export function resetLoaderState(): void {
  transformersModule = null;
  onnxRuntimeModule = null;
  initializationPromise = null;
  isInitialized = false;
  initError = null;
  log.debug('Transformers loader state reset');
}
