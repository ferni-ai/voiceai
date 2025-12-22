/**
 * Tool Execution Reliability
 *
 * Provides retry logic, circuit breaker, and error tracking for tool execution.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern to prevent cascading failures
 * - Per-tool error tracking and metrics
 * - Graceful degradation with fallback responses
 *
 * @module agents/shared/tool-execution-reliability
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ToolReliability' });

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Initial delay in ms */
  initialDelayMs?: number;
  /** Maximum delay in ms */
  maxDelayMs?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Errors that should not trigger retry */
  nonRetryableErrors?: string[];
}

export interface CircuitBreakerConfig {
  /** Number of failures to open circuit */
  failureThreshold?: number;
  /** Time in ms to keep circuit open */
  resetTimeoutMs?: number;
  /** Number of successes to close half-open circuit */
  successThreshold?: number;
}

export interface ToolExecutionMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  circuitOpenCount: number;
  avgDurationMs: number;
  lastFailure?: {
    timestamp: number;
    error: string;
  };
}

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  openedAt?: number;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 2,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
  nonRetryableErrors: ['INVALID_ARGUMENT', 'NOT_FOUND', 'PERMISSION_DENIED', 'UNAUTHENTICATED'],
};

const DEFAULT_CIRCUIT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 2,
};

// Tools that should never be retried (side effects)
const NON_RETRYABLE_TOOLS = new Set([
  'rememberaboutuser',
  'updatememory',
  'forgetmemory',
  'sendmessage',
  'sendtext',
  'sendemail',
  'createcalendarevent',
  'scheduleevent',
  'addtask',
  'completetask',
  'addbill',
  'paybill',
  'playmusic', // Already playing would be confusing
]);

// Tools that are critical and should use circuit breaker
const CIRCUIT_BREAKER_TOOLS = new Set([
  'getweather',
  'getnews',
  'getmarketsummary',
  'getquote',
  'getcalendartoday',
  'getschedule',
]);

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class ToolCircuitBreaker {
  private circuits = new Map<string, CircuitBreakerState>();
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Check if circuit allows execution
   */
  canExecute(toolName: string): boolean {
    const circuit = this.getOrCreateCircuit(toolName);

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if enough time has passed to try again
        const elapsed = Date.now() - (circuit.openedAt || 0);
        if (elapsed >= this.config.resetTimeoutMs) {
          circuit.state = 'half-open';
          circuit.successes = 0;
          log.info({ toolName }, '⚡ Circuit breaker transitioning to half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record successful execution
   */
  recordSuccess(toolName: string): void {
    const circuit = this.getOrCreateCircuit(toolName);

    if (circuit.state === 'half-open') {
      circuit.successes++;
      if (circuit.successes >= this.config.successThreshold) {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.successes = 0;
        log.info({ toolName }, '✅ Circuit breaker closed (recovered)');
      }
    } else {
      // Reset failure count on success in closed state
      circuit.failures = 0;
    }
  }

  /**
   * Record failed execution
   */
  recordFailure(toolName: string, error: string): void {
    const circuit = this.getOrCreateCircuit(toolName);
    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === 'half-open') {
      // Any failure in half-open state opens the circuit again
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      log.warn({ toolName, error }, '🔴 Circuit breaker re-opened (half-open failure)');
    } else if (circuit.failures >= this.config.failureThreshold) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      log.warn(
        { toolName, failures: circuit.failures, threshold: this.config.failureThreshold },
        '🔴 Circuit breaker opened (failure threshold)'
      );
    }
  }

  /**
   * Get circuit state for a tool
   */
  getState(toolName: string): CircuitState {
    return this.getOrCreateCircuit(toolName).state;
  }

  /**
   * Get all circuit states (for monitoring)
   */
  getAllStates(): Record<string, { state: CircuitState; failures: number }> {
    const states: Record<string, { state: CircuitState; failures: number }> = {};
    for (const [tool, circuit] of this.circuits) {
      states[tool] = { state: circuit.state, failures: circuit.failures };
    }
    return states;
  }

  private getOrCreateCircuit(toolName: string): CircuitBreakerState {
    const normalized = toolName.toLowerCase();
    if (!this.circuits.has(normalized)) {
      this.circuits.set(normalized, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
      });
    }
    return this.circuits.get(normalized)!;
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Calculate delay for retry with exponential backoff
 */
function calculateRetryDelay(attempt: number, config: Required<RetryConfig>): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown, config: Required<RetryConfig>): boolean {
  const errorStr = String(error);

  // Check for non-retryable error codes
  for (const code of config.nonRetryableErrors) {
    if (errorStr.includes(code)) {
      return false;
    }
  }

  // Timeout and network errors are retryable
  if (
    errorStr.includes('timeout') ||
    errorStr.includes('ETIMEDOUT') ||
    errorStr.includes('ECONNRESET') ||
    errorStr.includes('ECONNREFUSED') ||
    errorStr.includes('network')
  ) {
    return true;
  }

  // Rate limit errors are retryable
  if (errorStr.includes('429') || errorStr.includes('rate limit')) {
    return true;
  }

  // Server errors (5xx) are generally retryable
  if (errorStr.includes('500') || errorStr.includes('502') || errorStr.includes('503')) {
    return true;
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN EXECUTION WRAPPER
// ============================================================================

// Singleton circuit breaker
let circuitBreaker: ToolCircuitBreaker | null = null;

function getCircuitBreaker(): ToolCircuitBreaker {
  if (!circuitBreaker) {
    circuitBreaker = new ToolCircuitBreaker();
  }
  return circuitBreaker;
}

// Per-tool metrics
const toolMetrics = new Map<string, ToolExecutionMetrics>();

function getOrCreateMetrics(toolName: string): ToolExecutionMetrics {
  const normalized = toolName.toLowerCase();
  if (!toolMetrics.has(normalized)) {
    toolMetrics.set(normalized, {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      circuitOpenCount: 0,
      avgDurationMs: 0,
    });
  }
  return toolMetrics.get(normalized)!;
}

/**
 * Execute a tool with retry and circuit breaker
 */
export async function executeWithReliability<T>(
  toolName: string,
  executor: () => Promise<T>,
  options: {
    retryConfig?: RetryConfig;
    useCircuitBreaker?: boolean;
    fallbackValue?: T;
  } = {}
): Promise<{ result: T; retries: number; fromFallback: boolean }> {
  const normalizedTool = toolName.toLowerCase();
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
  const useCircuitBreaker = options.useCircuitBreaker ?? CIRCUIT_BREAKER_TOOLS.has(normalizedTool);
  const metrics = getOrCreateMetrics(normalizedTool);
  const cb = getCircuitBreaker();

  metrics.totalCalls++;

  // Check if tool should be retried at all
  const shouldRetry = !NON_RETRYABLE_TOOLS.has(normalizedTool);
  const maxAttempts = shouldRetry ? retryConfig.maxRetries + 1 : 1;

  // Circuit breaker check
  if (useCircuitBreaker && !cb.canExecute(normalizedTool)) {
    metrics.circuitOpenCount++;
    log.warn({ toolName }, '⚡ Circuit breaker is open, using fallback');

    if (options.fallbackValue !== undefined) {
      return { result: options.fallbackValue, retries: 0, fromFallback: true };
    }
    throw new Error(`Circuit breaker open for tool: ${toolName}`);
  }

  let lastError: unknown;
  let retries = 0;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await executor();

      // Success
      const duration = Date.now() - startTime;
      metrics.successCount++;
      metrics.avgDurationMs =
        (metrics.avgDurationMs * (metrics.successCount - 1) + duration) / metrics.successCount;

      if (useCircuitBreaker) {
        cb.recordSuccess(normalizedTool);
      }

      return { result, retries, fromFallback: false };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const isLastAttempt = attempt === maxAttempts - 1;
      const canRetry = !isLastAttempt && isRetryableError(error, retryConfig);

      if (canRetry) {
        retries++;
        metrics.retryCount++;
        const delay = calculateRetryDelay(attempt, retryConfig);
        log.debug(
          { toolName, attempt: attempt + 1, maxAttempts, delayMs: delay, error: String(error) },
          '🔄 Retrying tool execution'
        );
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  // All attempts failed
  metrics.failureCount++;
  metrics.lastFailure = {
    timestamp: Date.now(),
    error: String(lastError),
  };

  if (useCircuitBreaker) {
    cb.recordFailure(normalizedTool, String(lastError));
  }

  log.warn(
    { toolName, retries, error: String(lastError) },
    '❌ Tool execution failed after retries'
  );

  // Return fallback if provided
  if (options.fallbackValue !== undefined) {
    return { result: options.fallbackValue, retries, fromFallback: true };
  }

  throw lastError;
}

// ============================================================================
// MONITORING & METRICS
// ============================================================================

/**
 * Get metrics for a specific tool
 */
export function getToolMetrics(toolName: string): ToolExecutionMetrics | null {
  return toolMetrics.get(toolName.toLowerCase()) || null;
}

/**
 * Get metrics for all tools
 */
export function getAllToolMetrics(): Record<string, ToolExecutionMetrics> {
  const all: Record<string, ToolExecutionMetrics> = {};
  for (const [tool, metrics] of toolMetrics) {
    all[tool] = { ...metrics };
  }
  return all;
}

/**
 * Get circuit breaker states
 */
export function getCircuitBreakerStates(): Record<
  string,
  { state: CircuitState; failures: number }
> {
  return getCircuitBreaker().getAllStates();
}

/**
 * Get combined reliability dashboard
 */
export function getReliabilityDashboard(): {
  toolMetrics: Record<string, ToolExecutionMetrics>;
  circuitBreakers: Record<string, { state: CircuitState; failures: number }>;
  summary: {
    totalCalls: number;
    totalRetries: number;
    totalFailures: number;
    overallSuccessRate: string;
    openCircuits: number;
  };
} {
  const metrics = getAllToolMetrics();
  const circuits = getCircuitBreakerStates();

  let totalCalls = 0;
  let totalRetries = 0;
  let totalFailures = 0;
  let totalSuccesses = 0;

  for (const m of Object.values(metrics)) {
    totalCalls += m.totalCalls;
    totalRetries += m.retryCount;
    totalFailures += m.failureCount;
    totalSuccesses += m.successCount;
  }

  const openCircuits = Object.values(circuits).filter((c) => c.state === 'open').length;

  return {
    toolMetrics: metrics,
    circuitBreakers: circuits,
    summary: {
      totalCalls,
      totalRetries,
      totalFailures,
      overallSuccessRate:
        totalCalls > 0 ? ((totalSuccesses / totalCalls) * 100).toFixed(1) + '%' : 'N/A',
      openCircuits,
    },
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetReliabilityMetrics(): void {
  toolMetrics.clear();
  circuitBreaker = null;
}

export default {
  executeWithReliability,
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
};
