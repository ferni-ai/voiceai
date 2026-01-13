/**
 * Superhuman Orchestrator Module
 *
 * Clean architecture refactoring of the Better Than Human orchestrator.
 *
 * @module @ferni/superhuman/orchestrator
 */
// Engine
export { BetterThanHumanOrchestrator, default } from './engine.js';
// Helpers (for testing/extension)
export * as helpers from './helpers.js';
// Signal emitter
export { emitSignals } from './signal-emitter.js';
// Registry
export { getBetterThanHuman, clearBetterThanHuman, getExistingBetterThanHumanForUser, getOrchestratorCount, clearAllBetterThanHumanForUser, } from './registry.js';
//# sourceMappingURL=index.js.map