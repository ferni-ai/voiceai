/**
 * Behavior Signal Factories
 *
 * Pure factory functions for creating behavior signals.
 * These are shared between tools (L70) and agents (L100).
 *
 * @module services/behavior/signal-factories
 */

import type { BehaviorSignal, BehaviorState } from '../../types/behavior-types.js';

// ============================================================================
// SIGNAL FACTORY FUNCTIONS
// ============================================================================

/**
 * Create behavior signal from mode shift
 */
export function createModeShiftSignal(
  mode: BehaviorState['currentMode'],
  reason?: string
): BehaviorSignal {
  return {
    type: 'mode_shift',
    mode,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Create behavior signal from pacing change
 */
export function createPacingChangeSignal(
  pacing: BehaviorState['currentPacing']['speed'],
  reason?: string
): BehaviorSignal {
  return {
    type: 'pacing_change',
    pacing,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Create hold space signal
 */
export function createHoldSpaceSignal(duration: number, reason?: string): BehaviorSignal {
  return {
    type: 'hold_space',
    duration,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Create processing signal
 */
export function createProcessingSignal(isStart: boolean, expression?: string): BehaviorSignal {
  return {
    type: isStart ? 'processing_start' : 'processing_end',
    expression,
    timestamp: Date.now(),
  };
}
