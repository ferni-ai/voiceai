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
 * 5. **Crash Protection**: Uses circuit breaker and timeout protection to prevent
 *    native binding crashes from taking down the entire agent.
 *
 * @module utils/transformers-loader
 * @see https://github.com/microsoft/onnxruntime/issues/24144 (SIGSEGV regression)
 * @see https://onnxruntime.ai/docs/performance/tune-performance/threading.html
 */

import { createLogger } from './safe-logger.js';
import {
  getOnnxGuard,
  getTransformersGuard,
  type NativeBindingStats,
  type CrashDiagnostics,
} from './native-binding-guard.js';

const log = createLogger({ module: 'transformers-loader' });

// ============================================================================
// TYPES
// ============================================================================

export interface TransformersModule {
  AutoTokenizer: any;
  pipeline: any;
  env?: any;
}

/** Writable properties of transformers.env (for type-safe config) */
interface TransformersEnvWritable {
  allowRemoteModels?: boolean;
  cacheDir?: string;
}

export interface OnnxRuntimeModule {
  InferenceSession: any;
  Tensor: any;
  env?: any;
}

/** Writable properties of ort.env.wasm (for type-safe config) */
interface OnnxEnvWritable {
  wasm?: { numThreads?: number };
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
  intraOpNumThreads: 2, // Limit internal parallelism
  interOpNumThreads: 1, // Sequential operator execution
  executionMode: 'sequential',
  graphOptimizationLevel: 'all',
};

// ============================================================================
// SESSION READINESS TRACKER
// ============================================================================

/**
 * Tracks session initialization state and provides an initialization barrier.
 * Solves the race condition where concurrent requests can hit a session
 * before it's fully initialized.
 */
class SessionReadinessTracker {
  private sessionStates = new Map<
    string,
    {
      ready: boolean;
      readyPromise: Promise<void>;
      resolve: () => void;
      reject: (error: Error) => void;
      error: Error | null;
      warmupAttempts: number;
      lastWarmupTime: number;
    }
  >();

  /**
   * Register a new session and create its readiness promise.
   */
  registerSession(sessionId: string): void {
    if (this.sessionStates.has(sessionId)) {
      return; // Already registered
    }

    let resolve: () => void = () => {};
    let reject: (error: Error) => void = () => {};
    const readyPromise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Attach a no-op catch handler to prevent unhandled rejection warnings
    // The actual rejection is still propagated to waiters via waitForSession
    readyPromise.catch(() => {
      // Intentionally empty - error is stored in state.error and re-thrown in waitForSession
    });

    this.sessionStates.set(sessionId, {
      ready: false,
      readyPromise,
      resolve,
      reject,
      error: null,
      warmupAttempts: 0,
      lastWarmupTime: 0,
    });
  }

  /**
   * Mark a session as ready after successful warmup.
   */
  markReady(sessionId: string): void {
    const state = this.sessionStates.get(sessionId);
    if (state && !state.ready) {
      state.ready = true;
      state.resolve();
      log.debug({ sessionId }, 'Session marked ready');
    }
  }

  /**
   * Mark a session as failed.
   */
  markFailed(sessionId: string, error: Error): void {
    const state = this.sessionStates.get(sessionId);
    if (state && !state.ready) {
      state.error = error;
      state.reject(error);
      log.debug({ sessionId, error: error.message }, 'Session marked failed');
    }
  }

  /**
   * Wait for a session to be ready (initialization barrier).
   * Returns immediately if already ready, throws if failed.
   */
  async waitForSession(sessionId: string, timeoutMs = 10000): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      // Session not registered - might be a new session or race condition
      return;
    }

    if (state.ready) {
      return;
    }

    if (state.error) {
      throw state.error;
    }

    // Wait with timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Session ${sessionId} initialization timed out`)),
        timeoutMs
      );
    });

    await Promise.race([state.readyPromise, timeoutPromise]);
  }

  /**
   * Check if a session is ready without waiting.
   */
  isReady(sessionId: string): boolean {
    const state = this.sessionStates.get(sessionId);
    return state?.ready ?? false;
  }

  /**
   * Get session initialization status for health checks.
   */
  getStatus(): {
    sessions: Array<{ id: string; ready: boolean; error: string | null; warmupAttempts: number }>;
    allReady: boolean;
    anyFailed: boolean;
  } {
    const sessions: Array<{
      id: string;
      ready: boolean;
      error: string | null;
      warmupAttempts: number;
    }> = [];
    let allReady = true;
    let anyFailed = false;

    for (const [id, state] of this.sessionStates.entries()) {
      sessions.push({
        id,
        ready: state.ready,
        error: state.error?.message ?? null,
        warmupAttempts: state.warmupAttempts,
      });
      if (!state.ready) allReady = false;
      if (state.error) anyFailed = true;
    }

    return { sessions, allReady, anyFailed };
  }

  /**
   * Record a warmup attempt for tracking.
   */
  recordWarmupAttempt(sessionId: string): void {
    const state = this.sessionStates.get(sessionId);
    if (state) {
      state.warmupAttempts++;
      state.lastWarmupTime = Date.now();
    }
  }

  /**
   * Reset a specific session (for retry scenarios).
   */
  resetSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    this.registerSession(sessionId);
  }

  /**
   * Clear all session states (for testing).
   */
  clear(): void {
    this.sessionStates.clear();
  }
}

// Global session readiness tracker
const sessionTracker = new SessionReadinessTracker();

/**
 * Get the session readiness tracker for external access.
 */
export function getSessionReadinessTracker(): SessionReadinessTracker {
  return sessionTracker;
}

// ============================================================================
// EXPONENTIAL BACKOFF WITH JITTER
// ============================================================================

/**
 * Sleep with exponential backoff and jitter.
 * Jitter prevents thundering herd when multiple processes retry simultaneously.
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 50ms)
 * @param maxDelayMs - Maximum delay cap (default: 5000ms)
 */
async function sleepWithBackoff(
  attempt: number,
  baseDelayMs = 50,
  maxDelayMs = 5000
): Promise<void> {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  // Add jitter: random 0-50% of the delay
  const jitter = Math.random() * exponentialDelay * 0.5;
  // Cap at maxDelay
  const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay);
  });
}

/**
 * Retry an async operation with exponential backoff and jitter.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The function result
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelayMs = 50,
    maxDelayMs = 5000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      onRetry?.(attempt, error);
      await sleepWithBackoff(attempt, baseDelayMs, maxDelayMs);
    }
  }

  throw lastError;
}

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
      const envWritable = transformers.env as unknown as TransformersEnvWritable;
      // Disable remote model loading in production for security
      envWritable.allowRemoteModels = process.env.NODE_ENV !== 'production';
      // Use local cache directory
      envWritable.cacheDir = process.env.TRANSFORMERS_CACHE || './.cache/transformers';
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
      // Set number of threads for the thread pool
      const envWritable = ort.env as unknown as OnnxEnvWritable;
      if (envWritable.wasm) {
        envWritable.wasm.numThreads = DEFAULT_SESSION_OPTIONS.intraOpNumThreads;
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
 * Protected by circuit breaker and timeout.
 *
 * @param modelPath - Path to the ONNX model file
 * @param options - Optional session configuration
 * @returns Configured InferenceSession
 */
export async function createInferenceSession(
  modelPath: string,
  options: SessionOptions = {}
): Promise<any> {
  const guard = getOnnxGuard();
  const modelName = modelPath.split('/').pop() || 'unknown';

  return guard.execute(
    `createSession:${modelName}`,
    async () => {
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
          model: modelName,
          intraThreads: ortSessionOptions.intraOpNumThreads,
          interThreads: ortSessionOptions.interOpNumThreads,
          optimizationLevel: sessionOptions.graphOptimizationLevel,
        },
        'Creating ONNX session'
      );

      return ort.InferenceSession.create(modelPath, ortSessionOptions);
    },
    undefined, // No fallback for session creation
    `model:${modelName}`
  );
}

/**
 * Run ONNX inference with protection against crashes.
 * This wraps session.run() with circuit breaker, timeout, and diagnostics.
 *
 * @param session - ONNX InferenceSession
 * @param feeds - Input feeds for the model
 * @param outputNames - Optional output names to fetch
 * @returns Inference results
 */
export async function runInferenceProtected<T = any>(
  session: any,
  feeds: Record<string, any>,
  outputNames?: string[]
): Promise<T> {
  const guard = getOnnxGuard();

  return guard.execute(
    'inference',
    async () => {
      if (outputNames) {
        return session.run(feeds, outputNames);
      }
      return session.run(feeds);
    },
    undefined,
    `inputs:${Object.keys(feeds).join(',')}`
  );
}

/**
 * Create an AutoTokenizer from a pretrained model.
 * Protected by circuit breaker and timeout.
 *
 * @param modelId - HuggingFace model ID or local path
 * @param options - Tokenizer options
 */
export async function createTokenizer(
  modelId: string,
  options: { localFilesOnly?: boolean } = {}
): Promise<any> {
  const guard = getTransformersGuard();

  return guard.execute(
    `createTokenizer:${modelId}`,
    async () => {
      const transformers = await getTransformers();
      return transformers.AutoTokenizer.from_pretrained(modelId, {
        local_files_only: options.localFilesOnly ?? false,
      });
    },
    undefined,
    `model:${modelId}`
  );
}

/**
 * Create a transformers.js pipeline.
 * Protected by circuit breaker and timeout.
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
  const guard = getTransformersGuard();

  return guard.execute(
    `createPipeline:${task}:${modelId}`,
    async () => {
      const transformers = await getTransformers();
      return transformers.pipeline(task, modelId, {
        device: options.device ?? 'cpu',
        quantized: options.quantized ?? true,
      });
    },
    undefined,
    `task:${task},model:${modelId}`
  );
}

/**
 * Run a pipeline with crash protection.
 * Use this for inference instead of calling the pipeline directly.
 *
 * @param pipeline - The transformers.js pipeline
 * @param input - Input to the pipeline
 * @param options - Pipeline options
 */
export async function runPipelineProtected<T = any>(
  pipeline: any,
  input: string | string[],
  options: Record<string, unknown> = {}
): Promise<T> {
  const guard = getTransformersGuard();
  const inputSummary = Array.isArray(input) ? `${input.length} items` : input.slice(0, 50);

  return guard.execute(
    'pipelineInference',
    async () => pipeline(input, options),
    undefined,
    inputSummary
  );
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

/**
 * Get comprehensive health status including circuit breaker states.
 * Use this for detailed diagnostics and observability.
 */
export function getNativeBindingHealth(): {
  transformers: {
    ready: boolean;
    guard: NativeBindingStats;
  };
  onnx: {
    ready: boolean;
    guard: NativeBindingStats;
  };
  sessions: {
    allReady: boolean;
    anyFailed: boolean;
    details: Array<{ id: string; ready: boolean; error: string | null; warmupAttempts: number }>;
  };
  overall: 'healthy' | 'degraded' | 'unhealthy';
  initError: string | null;
} {
  const transformersGuard = getTransformersGuard();
  const onnxGuard = getOnnxGuard();

  const transformersStats = transformersGuard.getStats();
  const onnxStats = onnxGuard.getStats();
  const sessionStatus = sessionTracker.getStatus();

  // Determine overall health
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (transformersStats.state === 'open' || onnxStats.state === 'open') {
    overall = 'unhealthy';
  } else if (sessionStatus.anyFailed) {
    overall = 'degraded'; // Session failures are degraded, not unhealthy (graceful degradation)
  } else if (
    transformersStats.state === 'half-open' ||
    onnxStats.state === 'half-open' ||
    transformersStats.consecutiveFailures > 0 ||
    onnxStats.consecutiveFailures > 0 ||
    initError !== null ||
    !sessionStatus.allReady
  ) {
    overall = 'degraded';
  }

  return {
    transformers: {
      ready: isTransformersReady(),
      guard: transformersStats,
    },
    onnx: {
      ready: isOnnxRuntimeReady(),
      guard: onnxStats,
    },
    sessions: {
      allReady: sessionStatus.allReady,
      anyFailed: sessionStatus.anyFailed,
      details: sessionStatus.sessions,
    },
    overall,
    initError: initError ? initError.message : null,
  };
}

/**
 * Check if native bindings are healthy enough for inference.
 * Returns false if circuit breakers are open.
 */
export function canRunInference(): boolean {
  const transformersGuard = getTransformersGuard();
  const onnxGuard = getOnnxGuard();

  return transformersGuard.isHealthy() && onnxGuard.isHealthy() && !initError;
}

/**
 * Reset circuit breakers after fixing underlying issues.
 * Use with caution - only after addressing the root cause.
 */
export function resetCircuitBreakers(): void {
  getTransformersGuard().reset();
  getOnnxGuard().reset();
  log.warn('Native binding circuit breakers reset');
}

/**
 * Register a crash event listener for monitoring.
 */
export function onNativeBindingCrash(callback: (diagnostics: CrashDiagnostics) => void): void {
  getTransformersGuard().on('crash', callback);
  getOnnxGuard().on('crash', callback);
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
