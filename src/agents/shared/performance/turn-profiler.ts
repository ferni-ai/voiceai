/**
 * Turn Performance Profiler - Re-export from services layer
 *
 * This file re-exports from src/services/performance/turn-profiler.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * @module performance/turn-profiler
 * @deprecated Import from '../../../services/performance/turn-profiler.js' instead
 */

export {
  // Types
  type TurnTimings,
  type TurnMetrics,
  type SessionMetricsSummary,
  // Constants
  PERFORMANCE_THRESHOLDS,
  // Functions
  getTurnProfiler,
  startTurnProfiling,
  markTurnCheckpoint,
  completeTurnProfiling,
  getSessionPerformanceSummary,
  getGlobalPerformanceSummary,
  clearSessionProfiling,
} from '../../../services/performance/turn-profiler.js';
