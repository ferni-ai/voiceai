/**
 * Tool Execution Reliability - Re-export from services layer
 *
 * This file re-exports from src/services/performance/tool-execution-reliability.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * @module agents/shared/tool-execution-reliability
 * @deprecated Import from '../../services/performance/tool-execution-reliability.js' instead
 */

export {
  // Types
  type RetryConfig,
  type CircuitBreakerConfig,
  type ToolExecutionMetrics,
  // Functions
  executeWithReliability,
  getToolMetrics,
  getAllToolMetrics,
  getCircuitBreakerStates,
  getReliabilityDashboard,
  resetReliabilityMetrics,
  // Default export
  default,
} from '../../services/performance/tool-execution-reliability.js';
