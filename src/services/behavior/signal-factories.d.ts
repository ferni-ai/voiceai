/**
 * Behavior Signal Factories
 *
 * Pure factory functions for creating behavior signals.
 * These are shared between tools (L70) and agents (L100).
 *
 * @module services/behavior/signal-factories
 */
import type { BehaviorSignal, BehaviorState } from '../../types/behavior-types.js';
/**
 * Create behavior signal from mode shift
 */
export declare function createModeShiftSignal(mode: BehaviorState['currentMode'], reason?: string): BehaviorSignal;
/**
 * Create behavior signal from pacing change
 */
export declare function createPacingChangeSignal(pacing: BehaviorState['currentPacing']['speed'], reason?: string): BehaviorSignal;
/**
 * Create hold space signal
 */
export declare function createHoldSpaceSignal(duration: number, reason?: string): BehaviorSignal;
/**
 * Create processing signal
 */
export declare function createProcessingSignal(isStart: boolean, expression?: string): BehaviorSignal;
//# sourceMappingURL=signal-factories.d.ts.map