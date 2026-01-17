/**
 * Better Than Human - Main Orchestrator
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the orchestrator/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see orchestrator/index.ts for the new module structure
 * @module @ferni/superhuman/orchestrator
 */

// Re-export everything from the new module
export {
  // Engine
  BetterThanHumanOrchestrator,
  default,
  // Helpers
  helpers,
  // Signal emitter
  emitSignals,
  // Registry
  getBetterThanHuman,
  clearBetterThanHuman,
  getExistingBetterThanHumanForUser,
  getOrchestratorCount,
  clearAllBetterThanHumanForUser,
} from './orchestrator/index.js';
