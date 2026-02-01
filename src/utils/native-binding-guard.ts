/**
 * Native Binding Guard
 *
 * Protects the agent from crashes caused by native bindings (ONNX, WASM, NAPI).
 * Provides circuit breaker, timeout protection, and crash recovery.
 *
 * CRITICAL: All native binding calls should go through this guard to prevent
 * crashes from bringing down the entire voice agent.
 */

import { createLogger } from './safe-logger.js';
import { EventEmitter } from 'events';

const log = createLogger({ module: 'native-binding-guard' });

// ============================================================================
// Types
// ============================================================================

export interface NativeBindingConfig {
  /** Name of the binding (for logging) */
  name: string;
  /** Maximum execution time before timeout (ms) */
  timeoutMs: number;
  /** Number of failures before circuit opens */
  failureThreshold: number;
  /** Time to wait before trying again after circuit opens (ms) */
  resetTimeMs: number;
  /** Whether to capture stack traces on failure */
  captureStackTrace: boolean;
}

export interface NativeBindingStats {
  name: string;
  state: 'closed' | 'open' | 'half-open';
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  timeoutCalls: number;
  consecutiveFailures: number;
  lastFailure?: {
    timestamp: Date;
    error: string;
    stack?: string;
  };
  lastSuccess?: Date;
  averageLatencyMs: number;
  p99LatencyMs: number;
}

export interface CrashDiagnostics {
  timestamp: Date;
  bindingName: string;
  operation: string;
  errorType: 'timeout' | 'exception' | 'native_crash' | 'oom' | 'circuit_open';
  errorMessage: string;
  nativeStack?: string;
  jsStack?: string;
  memoryUsageMb: number;
  cpuUsagePercent?: number;
  inputSummary?: string;
  recoveryAction: 'retry' | 'fallback' | 'circuit_open' | 'fatal';
}

type FallbackFn<T> = () => Promise<T> | T;

// ============================================================================
// Circuit Breaker State Machine
// ============================================================================

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number,
    private readonly resetTimeMs: number
  ) {}

  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime >= this.resetTimeMs) {
        this.state = 'half-open';
        this.successCount = 0;
        log.info({ binding: this.name }, 'Circuit breaker entering half-open state');
        return true;
      }
      return false;
    }

    // half-open: allow limited requests
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      // Require 3 consecutive successes to close
      if (this.successCount >= 3) {
        this.state = 'closed';
        this.failures = 0;
        log.info({ binding: this.name }, 'Circuit breaker closed after recovery');
      }
    } else {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens
      this.state = 'open';
      log.warn({ binding: this.name }, 'Circuit breaker re-opened after failure in half-open');
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      log.error(
        { binding: this.name, failures: this.failures },
        'Circuit breaker opened after threshold failures'
      );
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
    log.info({ binding: this.name }, 'Circuit breaker manually reset');
  }
}

// ============================================================================
// Latency Tracker
// ============================================================================

class LatencyTracker {
  private latencies: number[] = [];
  private readonly maxSamples = 1000;

  record(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  getAverage(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  getP99(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.99);
    return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  }
}

// ============================================================================
// Native Binding Guard
// ============================================================================

export class NativeBindingGuard extends EventEmitter {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly latencyTracker: LatencyTracker;
  private readonly config: NativeBindingConfig;

  private totalCalls = 0;
  private successfulCalls = 0;
  private failedCalls = 0;
  private timeoutCalls = 0;
  private lastFailure?: CrashDiagnostics;
  private lastSuccess?: Date;

  constructor(config: Partial<NativeBindingConfig> & { name: string }) {
    super();
    this.config = {
      name: config.name,
      timeoutMs: config.timeoutMs ?? 30000,
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeMs: config.resetTimeMs ?? 60000,
      captureStackTrace: config.captureStackTrace ?? true,
    };

    this.circuitBreaker = new CircuitBreaker(
      this.config.name,
      this.config.failureThreshold,
      this.config.resetTimeMs
    );

    this.latencyTracker = new LatencyTracker();
  }

  /**
   * Execute a native binding operation with full protection.
   *
   * @param operation - Description of the operation (for diagnostics)
   * @param fn - The async function to execute
   * @param fallback - Optional fallback function if circuit is open or operation fails
   * @param inputSummary - Optional summary of input (for diagnostics, keep short)
   */
  async execute<T>(
    operation: string,
    fn: () => Promise<T>,
    fallback?: FallbackFn<T>,
    inputSummary?: string
  ): Promise<T> {
    this.totalCalls++;

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      log.warn({ binding: this.config.name, operation }, 'Circuit breaker open, using fallback');

      if (fallback) {
        return fallback();
      }

      throw new NativeBindingError(
        `Circuit breaker open for ${this.config.name}`,
        'circuit_open',
        this.config.name,
        operation
      );
    }

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, operation);

      // Record success
      const latency = Date.now() - startTime;
      this.latencyTracker.record(latency);
      this.circuitBreaker.recordSuccess();
      this.successfulCalls++;
      this.lastSuccess = new Date();

      // Log slow operations
      if (latency > this.config.timeoutMs * 0.8) {
        log.warn(
          { binding: this.config.name, operation, latencyMs: latency },
          'Native binding operation approaching timeout'
        );
      }

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const isTimeout = error instanceof TimeoutError;

      // Record failure
      this.circuitBreaker.recordFailure();
      this.failedCalls++;
      if (isTimeout) {
        this.timeoutCalls++;
      }

      // Capture diagnostics
      const diagnostics = this.captureDiagnostics(
        operation,
        error,
        isTimeout ? 'timeout' : 'exception',
        inputSummary
      );
      this.lastFailure = diagnostics;

      // Emit crash event for monitoring
      this.emit('crash', diagnostics);

      log.error(
        {
          binding: this.config.name,
          operation,
          errorType: diagnostics.errorType,
          error: diagnostics.errorMessage,
          latencyMs: latency,
          consecutiveFailures: this.circuitBreaker.getFailures(),
          circuitState: this.circuitBreaker.getState(),
        },
        'Native binding operation failed'
      );

      // Try fallback
      if (fallback) {
        log.info({ binding: this.config.name, operation }, 'Using fallback after failure');
        try {
          return await fallback();
        } catch (fallbackError) {
          log.error(
            { binding: this.config.name, operation, error: String(fallbackError) },
            'Fallback also failed'
          );
          throw fallbackError;
        }
      }

      throw new NativeBindingError(
        diagnostics.errorMessage,
        diagnostics.errorType,
        this.config.name,
        operation,
        diagnostics
      );
    }
  }

  /**
   * Execute with timeout protection.
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new TimeoutError(`Operation ${operation} timed out after ${this.config.timeoutMs}ms`)
        );
      }, this.config.timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Capture comprehensive crash diagnostics.
   */
  private captureDiagnostics(
    operation: string,
    error: unknown,
    errorType: CrashDiagnostics['errorType'],
    inputSummary?: string
  ): CrashDiagnostics {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const memUsage = process.memoryUsage();

    // Try to detect native crash patterns
    const errorMessage = errorObj.message || String(error);
    const isNativeCrash =
      errorMessage.includes('SIGSEGV') ||
      errorMessage.includes('SIGABRT') ||
      errorMessage.includes('env_ptr') ||
      errorMessage.includes('Assertion failed') ||
      errorMessage.includes('FATAL ERROR');

    const isOom =
      errorMessage.includes('out of memory') ||
      errorMessage.includes('OOM') ||
      errorMessage.includes('allocation failed') ||
      memUsage.heapUsed > memUsage.heapTotal * 0.95;

    // Determine recovery action
    let recoveryAction: CrashDiagnostics['recoveryAction'] = 'retry';
    if (isNativeCrash) {
      recoveryAction = 'fatal';
    } else if (isOom) {
      recoveryAction = 'circuit_open';
    } else if (this.circuitBreaker.getState() === 'open') {
      recoveryAction = 'circuit_open';
    } else if (this.circuitBreaker.getFailures() >= this.config.failureThreshold - 1) {
      recoveryAction = 'fallback';
    }

    return {
      timestamp: new Date(),
      bindingName: this.config.name,
      operation,
      errorType: isNativeCrash ? 'native_crash' : isOom ? 'oom' : errorType,
      errorMessage,
      jsStack: this.config.captureStackTrace ? errorObj.stack : undefined,
      memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      inputSummary: inputSummary?.slice(0, 200), // Truncate for safety
      recoveryAction,
    };
  }

  /**
   * Get current stats for monitoring.
   */
  getStats(): NativeBindingStats {
    return {
      name: this.config.name,
      state: this.circuitBreaker.getState(),
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      timeoutCalls: this.timeoutCalls,
      consecutiveFailures: this.circuitBreaker.getFailures(),
      lastFailure: this.lastFailure
        ? {
            timestamp: this.lastFailure.timestamp,
            error: this.lastFailure.errorMessage,
            stack: this.lastFailure.jsStack,
          }
        : undefined,
      lastSuccess: this.lastSuccess,
      averageLatencyMs: Math.round(this.latencyTracker.getAverage()),
      p99LatencyMs: Math.round(this.latencyTracker.getP99()),
    };
  }

  /**
   * Manually reset the circuit breaker (use with caution).
   */
  reset(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Check if the binding is healthy (circuit closed and recent success).
   */
  isHealthy(): boolean {
    return (
      this.circuitBreaker.getState() === 'closed' &&
      (!this.lastSuccess || Date.now() - this.lastSuccess.getTime() < this.config.resetTimeMs)
    );
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

export class NativeBindingError extends Error {
  constructor(
    message: string,
    public readonly errorType: CrashDiagnostics['errorType'],
    public readonly bindingName: string,
    public readonly operation: string,
    public readonly diagnostics?: CrashDiagnostics
  ) {
    super(message);
    this.name = 'NativeBindingError';
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Global Registry
// ============================================================================

const guards = new Map<string, NativeBindingGuard>();

/**
 * Get or create a guard for a native binding.
 */
export function getNativeBindingGuard(
  config: Partial<NativeBindingConfig> & { name: string }
): NativeBindingGuard {
  const existing = guards.get(config.name);
  if (existing) {
    return existing;
  }

  const guard = new NativeBindingGuard(config);
  guards.set(config.name, guard);

  // Log creation
  log.info({ binding: config.name }, 'Created native binding guard');

  return guard;
}

/**
 * Get all registered guards for monitoring.
 */
export function getAllNativeBindingStats(): NativeBindingStats[] {
  return Array.from(guards.values()).map((g) => g.getStats());
}

/**
 * Reset all circuit breakers (use with extreme caution).
 */
export function resetAllCircuitBreakers(): void {
  for (const guard of guards.values()) {
    guard.reset();
  }
  log.warn('All circuit breakers reset');
}

// ============================================================================
// Pre-configured Guards for Common Bindings
// ============================================================================

/**
 * Get the ONNX Runtime guard with appropriate configuration.
 */
export function getOnnxGuard(): NativeBindingGuard {
  return getNativeBindingGuard({
    name: 'onnx-runtime',
    timeoutMs: 30000, // 30 seconds for inference
    failureThreshold: 3, // Open circuit after 3 failures
    resetTimeMs: 120000, // Wait 2 minutes before retrying
    captureStackTrace: true,
  });
}

/**
 * Get the Transformers.js guard with appropriate configuration.
 */
export function getTransformersGuard(): NativeBindingGuard {
  return getNativeBindingGuard({
    name: 'transformers-js',
    timeoutMs: 60000, // 60 seconds for model loading
    failureThreshold: 3,
    resetTimeMs: 180000, // Wait 3 minutes before retrying
    captureStackTrace: true,
  });
}

/**
 * Get the VAD (Voice Activity Detection) guard.
 */
export function getVadGuard(): NativeBindingGuard {
  return getNativeBindingGuard({
    name: 'silero-vad',
    timeoutMs: 5000, // 5 seconds for VAD
    failureThreshold: 5, // More lenient
    resetTimeMs: 30000, // Quick retry
    captureStackTrace: true,
  });
}

// ============================================================================
// Crash Handler Integration
// ============================================================================

/**
 * Set up process-level crash handlers for native binding crashes.
 * Call this early in startup.
 */
export function setupNativeCrashHandlers(): void {
  // Handle uncaught exceptions that might be native crashes
  process.on('uncaughtException', (error) => {
    const isNativeCrash =
      error.message?.includes('SIGSEGV') ||
      error.message?.includes('SIGABRT') ||
      error.message?.includes('env_ptr') ||
      error.message?.includes('Assertion failed');

    if (isNativeCrash) {
      log.error(
        {
          error: error.message,
          stack: error.stack,
          type: 'native_crash',
        },
        'FATAL: Native binding crash detected'
      );

      // Give time for logs to flush
      setTimeout(() => {
        process.exit(139); // SIGSEGV exit code
      }, 1000);
    }
  });

  // Handle V8 fatal errors
  process.on('exit', (code) => {
    if (code === 139 || code === 134) {
      // SIGSEGV or SIGABRT
      log.error({ exitCode: code }, 'Process exiting due to native crash');
    }
  });

  log.info('Native crash handlers installed');
}
