/**
 * LLMCompiler Types
 *
 * Type definitions for parallel function calling with dependency tracking.
 * Based on ICML 2024 paper: "LLMCompiler: Parallel Function Calling"
 *
 * @module agents/shared/llm-compiler/types
 */

// ============================================================================
// TASK TYPES
// ============================================================================

/**
 * Single task in an execution DAG.
 * LLM outputs an array of these tasks with dependency relationships.
 */
export interface LLMCompilerTask {
  /** Unique task ID (e.g., "t1", "t2") */
  id: string;
  /** Tool function name */
  fn: string;
  /** Arguments - may contain variable references like "$t1" */
  args: Record<string, unknown>;
  /** Task IDs this depends on (empty = runs immediately) */
  dependsOn: string[];
  /** Original raw JSON if from LLM */
  raw?: string;
}

/**
 * Execution plan output by LLM Planner.
 * Contains all tasks and their dependency relationships.
 */
export interface LLMCompilerPlan {
  /** All tasks in the DAG */
  tasks: LLMCompilerTask[];
  /** Whether replanning should be allowed on partial failure */
  allowReplan: boolean;
  /** Plan confidence score (0-1) if available */
  confidence?: number;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result of a single task execution.
 */
export interface LLMCompilerTaskResult {
  /** Task ID that was executed */
  taskId: string;
  /** Tool function name */
  fn: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Tool result (if successful) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Final aggregated result from the Joiner.
 */
export interface LLMCompilerResult {
  /** Results from all task executions */
  taskResults: LLMCompilerTaskResult[];
  /** Combined result string for LLM context */
  aggregatedResult: string;
  /** Whether replanning is recommended */
  needsReplan: boolean;
  /** Total execution duration in milliseconds */
  totalDurationMs: number;
  /** Execution statistics */
  stats: LLMCompilerStats;
}

/**
 * Execution statistics for observability.
 */
export interface LLMCompilerStats {
  /** Total number of tasks */
  totalTasks: number;
  /** Number of parallel batches executed */
  parallelBatches: number;
  /** Number of successful tasks */
  successCount: number;
  /** Number of failed tasks */
  failureCount: number;
  /** Parallelism ratio (tasks / batches) */
  parallelismRatio: number;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context for LLMCompiler execution.
 */
export interface LLMCompilerContext {
  /** User ID for the session */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Active persona ID */
  personaId?: string;
  /** Publisher ID (developer platform) */
  publisherId?: string;
  /** Original user input text */
  inputText?: string;
  /** Maximum parallel tasks per batch */
  maxParallel?: number;
  /** Timeout per task in milliseconds */
  taskTimeoutMs?: number;
  /** Total execution timeout in milliseconds */
  totalTimeoutMs?: number;
  /** Callback when a task starts */
  onTaskStart?: (task: LLMCompilerTask) => void;
  /** Callback when a task completes */
  onTaskComplete?: (result: LLMCompilerTaskResult) => void;
  /** Whether to allow replanning on failure */
  enableReplan?: boolean;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Result of DAG validation.
 */
export interface DAGValidationResult {
  /** Whether the DAG is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** IDs involved in cycle (if cyclic) */
  cycleIds?: string[];
  /** Missing dependency IDs (if any) */
  missingDeps?: string[];
}
