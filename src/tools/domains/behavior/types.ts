/**
 * Behavior Domain Types
 *
 * Re-exports types from the central behavior-types module
 * for use in the tools domain.
 */

export type {
  BehaviorMode,
  PacingSpeed,
  PauseDuration,
  ProcessingType,
  ProcessingWeight,
  PresenceExpression,
  SilenceDuration,
  ShiftModeArgs,
  AdjustPacingArgs,
  ProcessingArgs,
  HoldSpaceArgs,
  ExpressPresenceArgs,
  BehaviorSignal,
  BehaviorSignalType,
  BehaviorState,
} from '../../../types/behavior-types.js';

export { SILENCE_DURATIONS, PACING_MULTIPLIERS, PAUSE_MULTIPLIERS } from '../../../types/behavior-types.js';

