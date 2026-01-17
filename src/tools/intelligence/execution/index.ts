/**
 * Execution Module
 *
 * Intelligent tool execution with parallel dispatch and result aggregation.
 *
 * @module tools/intelligence/execution
 */

// Intelligent executor
export {
  IntelligentExecutor,
  getIntelligentExecutor,
  initializeIntelligentExecutor,
  resetIntelligentExecutor,
} from './intelligent-executor.js';

// Parallel dispatcher
export { ParallelDispatcher } from './parallel-dispatcher.js';

// Result aggregator
export {
  ResultAggregator,
  getResultAggregator,
  resetResultAggregator,
  type AggregatedResult,
} from './result-aggregator.js';

// Types
export type {
  ExecutionStep,
  StepResult,
  StepStatus,
  ExecutionPlan,
  ExecutionResult,
  ExecutorConfig,
  ToolExecutor,
} from './types.js';

export { DEFAULT_EXECUTOR_CONFIG } from './types.js';
