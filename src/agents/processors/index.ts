/**
 * Agents Processors
 *
 * Extracted processors for handling specific agent concerns.
 * Each processor is focused, testable, and composable.
 */

export * from './turn-processor/index.js';
export type * from './types.js';

// Trigger effectiveness learning (Phase 4)
export {
  processTriggerOutcomes,
  recordFiredTriggerForOutcome,
  trackTriggerFired,
  clearFiredTriggers,
} from './trigger-outcome-handler.js';
