/**
 * Four Tendencies Framework
 *
 * Gretchen Rubin's personality framework for understanding
 * how people respond to expectations.
 *
 * NOTE: The FOUR_TENDENCIES_STRATEGIES constant is defined in constants.ts.
 * This module re-exports it and provides helper functions.
 *
 * @module habit-coaching/tendencies
 */

// Import from canonical location (constants.ts is the single source of truth)
import { FOUR_TENDENCIES_STRATEGIES } from './constants.js';

// Re-export for convenience
export { FOUR_TENDENCIES_STRATEGIES };

export type FourTendency = keyof typeof FOUR_TENDENCIES_STRATEGIES;

// ============================================================================
// TENDENCY DETECTION HELPERS
// ============================================================================

/**
 * Get strategy recommendations based on tendency
 */
export function getTendencyStrategies(tendency: FourTendency): readonly string[] {
  return FOUR_TENDENCIES_STRATEGIES[tendency].habitStrategies;
}

/**
 * Get things to avoid based on tendency
 */
export function getTendencyAvoid(tendency: FourTendency): readonly string[] {
  return FOUR_TENDENCIES_STRATEGIES[tendency].avoid;
}

/**
 * Get motivation tip for tendency
 */
export function getTendencyMotivation(tendency: FourTendency): string {
  return FOUR_TENDENCIES_STRATEGIES[tendency].motivationTip;
}
