/**
 * LLMCompiler Module
 *
 * Parallel function calling with dependency tracking.
 * Based on ICML 2024 paper: "LLMCompiler: Parallel Function Calling"
 *
 * @module agents/shared/llm-compiler
 *
 * @example
 * ```ts
 * import {
 *   containsLLMCompilerPlan,
 *   parseLLMCompilerPlan,
 *   executeLLMCompilerPlan,
 * } from './llm-compiler/index.js';
 *
 * if (containsLLMCompilerPlan(llmOutput)) {
 *   const plan = parseLLMCompilerPlan(llmOutput);
 *   if (plan) {
 *     const result = await executeLLMCompilerPlan(plan, { sessionId });
 *     // result.stats.parallelBatches shows efficiency
 *   }
 * }
 * ```
 */

// Types
export type {
  LLMCompilerTask,
  LLMCompilerPlan,
  LLMCompilerTaskResult,
  LLMCompilerResult,
  LLMCompilerStats,
  LLMCompilerContext,
  DAGValidationResult,
} from './types.js';

// Planner
export {
  containsLLMCompilerPlan,
  parseLLMCompilerPlan,
  validateDAG,
  resolveVariableReferences,
  stripLLMCompilerPlan,
} from './planner.js';

// Executor
export { executeLLMCompilerPlan } from './executor.js';

// Joiner
export { aggregateResults, generateReplanPrompt } from './joiner.js';

// Pre-Act Planning
export type { PreActPlan, PreActDetectionResult } from './pre-act.js';
export {
  containsPreActPlan,
  detectPreActFormat,
  parsePreActPlan,
  stripPreActFormat,
  validateReasoning,
  analyzePreActPlan,
  getPreActPromptInstructions,
} from './pre-act.js';
