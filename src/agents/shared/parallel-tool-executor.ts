/**
 * Parallel Tool Executor
 *
 * Executes high-stakes tools with parallel attempt strategy.
 * For critical tools (handoffs, crisis, phone calls), runs multiple
 * attempts in parallel and uses the first valid result.
 *
 * This significantly improves reliability for tools where failure
 * has high impact on user experience.
 *
 * Research (Jan 2026) shows that Gemini's function calling can be
 * intermittently flaky. Parallel execution catches these transient
 * failures by racing multiple attempts.
 *
 * @module agents/shared/parallel-tool-executor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'parallel-tool-executor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Result data if successful */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Which attempt produced this result (1-indexed) */
  attempt?: number;
  /** Execution time in milliseconds */
  durationMs?: number;
}

export interface ParallelExecutionOptions {
  /** Maximum number of parallel attempts (default: 2) */
  maxParallel?: number;
  /** Timeout for each attempt in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Minimum delay between starting attempts (default: 50ms) */
  staggerMs?: number;
  /** Whether to log detailed execution info (default: true) */
  verbose?: boolean;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult>;

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: Required<ParallelExecutionOptions> = {
  maxParallel: 2,
  timeoutMs: 5000,
  staggerMs: 50,
  verbose: true,
};

/**
 * Tools that should use parallel execution strategy.
 * These are high-stakes tools where failure has significant impact.
 */
const CRITICAL_TOOLS = new Set([
  // Handoff tools - user experience is severely impacted if these fail
  'handoffToMaya',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToAlex',
  'handoffToNayan',
  'handoffToFerni',
  'transferToSpecialist',

  // Crisis tools - potentially safety-critical
  'detectCrisis',
  'escalateToCrisis',
  'emergencyProtocol',

  // Phone call tools - high user expectation
  'callOnBehalf',
  'initiateCall',
  'placeCall',
]);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a tool should use parallel execution strategy.
 *
 * @param toolId - Tool identifier
 * @returns Whether the tool is considered critical
 */
export function isCriticalTool(toolId: string): boolean {
  return CRITICAL_TOOLS.has(toolId);
}

/**
 * Add a tool to the critical tools set.
 *
 * @param toolId - Tool identifier to add
 */
export function addCriticalTool(toolId: string): void {
  CRITICAL_TOOLS.add(toolId);
  log.info({ toolId }, '➕ Added tool to critical tools set');
}

/**
 * Remove a tool from the critical tools set.
 *
 * @param toolId - Tool identifier to remove
 */
export function removeCriticalTool(toolId: string): void {
  CRITICAL_TOOLS.delete(toolId);
  log.info({ toolId }, '➖ Removed tool from critical tools set');
}

/**
 * Get all critical tools.
 *
 * @returns Set of critical tool identifiers
 */
export function getCriticalTools(): ReadonlySet<string> {
  return CRITICAL_TOOLS;
}

/**
 * Execute a tool with parallel fallback strategy.
 *
 * Runs multiple attempts in parallel (with slight stagger) and returns
 * the first successful result. This significantly improves reliability
 * for critical tools.
 *
 * @param toolId - Tool identifier for logging
 * @param args - Arguments to pass to the tool
 * @param executor - Function that executes the tool
 * @param options - Parallel execution options
 * @returns First successful result, or last failure if all attempts fail
 *
 * @example
 * ```typescript
 * const result = await executeWithParallelFallback(
 *   'handoffToMaya',
 *   { reason: 'User needs habit coaching' },
 *   async (args) => {
 *     // Actual tool execution
 *     return { success: true, data: { transferred: true } };
 *   },
 *   { maxParallel: 2, timeoutMs: 5000 }
 * );
 * ```
 */
export async function executeWithParallelFallback(
  toolId: string,
  args: Record<string, unknown>,
  executor: ToolExecutor,
  options: ParallelExecutionOptions = {}
): Promise<ToolResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  // For non-critical tools, just execute once
  if (!isCriticalTool(toolId)) {
    return executeWithTimeout(executor, args, opts.timeoutMs, 1);
  }

  if (opts.verbose) {
    log.info(
      { toolId, maxParallel: opts.maxParallel, timeoutMs: opts.timeoutMs },
      '🚀 Starting parallel tool execution for critical tool'
    );
  }

  // Create staggered parallel attempts
  const attempts: Promise<ToolResult>[] = [];

  for (let i = 0; i < opts.maxParallel; i++) {
    const attemptNumber = i + 1;

    // Stagger starts to avoid thundering herd
    const delay = i * opts.staggerMs;

    const attempt = (async () => {
      if (delay > 0) {
        await sleep(delay);
      }
      return executeWithTimeout(executor, args, opts.timeoutMs, attemptNumber);
    })();

    attempts.push(attempt);
  }

  // Race all attempts, but handle properly to get first SUCCESS
  // (not just first to complete, which might be a failure)
  try {
    const result = await raceToSuccess(attempts, opts);
    const durationMs = Date.now() - startTime;

    if (opts.verbose) {
      if (result.success) {
        log.info(
          { toolId, attempt: result.attempt, durationMs },
          '✅ Parallel execution succeeded'
        );
      } else {
        log.warn({ toolId, error: result.error, durationMs }, '❌ All parallel attempts failed');
      }
    }

    return { ...result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error(
      { toolId, error: String(error), durationMs },
      '❌ Parallel execution threw unexpected error'
    );
    return {
      success: false,
      error: `Parallel execution error: ${String(error)}`,
      durationMs,
    };
  }
}

/**
 * Execute a tool with automatic parallel fallback if it's critical.
 *
 * Convenience wrapper that checks if the tool is critical and applies
 * parallel execution strategy automatically.
 *
 * @param toolId - Tool identifier
 * @param args - Tool arguments
 * @param executor - Tool executor function
 * @param options - Optional execution options
 * @returns Tool result
 */
export async function executeToolSmart(
  toolId: string,
  args: Record<string, unknown>,
  executor: ToolExecutor,
  options?: ParallelExecutionOptions
): Promise<ToolResult> {
  if (isCriticalTool(toolId)) {
    return executeWithParallelFallback(toolId, args, executor, options);
  }

  // Non-critical: single execution with timeout
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return executeWithTimeout(executor, args, opts.timeoutMs, 1);
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Execute a tool with timeout.
 */
async function executeWithTimeout(
  executor: ToolExecutor,
  args: Record<string, unknown>,
  timeoutMs: number,
  attemptNumber: number
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const result = await Promise.race([executor(args), timeoutPromise(timeoutMs)]);

    return {
      ...result,
      attempt: attemptNumber,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      attempt: attemptNumber,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Race multiple promises and return the first SUCCESS.
 * If all fail, return the last failure.
 */
async function raceToSuccess(
  attempts: Promise<ToolResult>[],
  opts: Required<ParallelExecutionOptions>
): Promise<ToolResult> {
  return new Promise((resolve) => {
    let completedCount = 0;
    let lastFailure: ToolResult | null = null;

    attempts.forEach((attempt, index) => {
      attempt
        .then((result) => {
          completedCount++;

          if (result.success) {
            // First success wins
            resolve(result);
          } else {
            lastFailure = result;

            // If all attempts completed and none succeeded
            if (completedCount === opts.maxParallel && lastFailure) {
              resolve(lastFailure);
            }
          }
        })
        .catch((error) => {
          completedCount++;
          lastFailure = {
            success: false,
            error: String(error),
            attempt: index + 1,
          };

          // If all attempts completed and none succeeded
          if (completedCount === opts.maxParallel && lastFailure) {
            resolve(lastFailure);
          }
        });
    });
  });
}

/**
 * Create a timeout promise that rejects after specified duration.
 */
function timeoutPromise(ms: number): Promise<ToolResult> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Tool execution timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Sleep for specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// METRICS
// ============================================================================

/** Metrics for parallel execution performance */
interface ParallelExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageAttemptToSuccess: number;
  averageDurationMs: number;
}

const metrics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  totalAttempts: 0,
  totalDurationMs: 0,
};

/**
 * Get parallel execution metrics.
 */
export function getParallelExecutionMetrics(): ParallelExecutionMetrics {
  return {
    totalExecutions: metrics.totalExecutions,
    successfulExecutions: metrics.successfulExecutions,
    failedExecutions: metrics.failedExecutions,
    averageAttemptToSuccess:
      metrics.totalExecutions > 0 ? metrics.totalAttempts / metrics.successfulExecutions : 0,
    averageDurationMs:
      metrics.totalExecutions > 0 ? metrics.totalDurationMs / metrics.totalExecutions : 0,
  };
}

/**
 * Reset metrics (for testing).
 */
export function resetParallelExecutionMetrics(): void {
  metrics.totalExecutions = 0;
  metrics.successfulExecutions = 0;
  metrics.failedExecutions = 0;
  metrics.totalAttempts = 0;
  metrics.totalDurationMs = 0;
}
