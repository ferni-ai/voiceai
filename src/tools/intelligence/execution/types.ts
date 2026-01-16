/**
 * Execution Module Types
 *
 * Type definitions for intelligent tool execution.
 *
 * @module tools/intelligence/execution/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * A step to execute
 */
export interface ExecutionStep {
  /** Tool ID to execute */
  toolId: string;
  /** Arguments for the tool */
  args?: Record<string, unknown>;
  /** Dependencies (step indices that must complete first) */
  dependencies: number[];
  /** Is this step optional */
  optional: boolean;
  /** Priority (higher = sooner) */
  priority: number;
  /** Timeout for this step in ms */
  timeoutMs: number;
  /** Retry configuration */
  retry: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Result of executing a step
 */
export interface StepResult {
  /** Step index */
  stepIndex: number;
  /** Tool ID */
  toolId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Result data (if success) */
  data?: unknown;
  /** Error message (if failure) */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Number of attempts */
  attempts: number;
  /** When execution started */
  startTime: Date;
  /** When execution ended */
  endTime: Date;
}

/**
 * Status of a step
 */
export type StepStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Execution plan with dependency graph
 */
export interface ExecutionPlan {
  /** All steps to execute */
  steps: ExecutionStep[];
  /** Parallel groups (steps in same group can run together) */
  parallelGroups: number[][];
  /** Total estimated duration in ms */
  estimatedDurationMs: number;
  /** Overall priority */
  priority: number;
}

/**
 * Result of executing a plan
 */
export interface ExecutionResult {
  /** All step results */
  results: StepResult[];
  /** Overall success */
  success: boolean;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Steps that succeeded */
  successCount: number;
  /** Steps that failed */
  failureCount: number;
  /** Steps that were skipped */
  skippedCount: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Configuration for the executor
 */
export interface ExecutorConfig {
  /** Maximum parallel executions */
  maxParallelism: number;
  /** Default timeout per step */
  defaultTimeoutMs: number;
  /** Default retry attempts */
  defaultRetryAttempts: number;
  /** Continue on failure (vs abort) */
  continueOnFailure: boolean;
  /** Skip optional steps on failure */
  skipOptionalOnFailure: boolean;
  /** Callback for step completion */
  onStepComplete?: (result: StepResult) => void;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Tool executor function signature
 */
export type ToolExecutor = (
  toolId: string,
  args: Record<string, unknown>
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxParallelism: 5,
  defaultTimeoutMs: 10000,
  defaultRetryAttempts: 2,
  continueOnFailure: true,
  skipOptionalOnFailure: true,
};
