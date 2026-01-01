/**
 * Behavior Service
 *
 * Shared behavior signal factories and utilities.
 * Used by both tools (L70) and agents (L100).
 *
 * @module services/behavior
 */

export {
  createModeShiftSignal,
  createPacingChangeSignal,
  createHoldSpaceSignal,
  createProcessingSignal,
} from './signal-factories.js';
