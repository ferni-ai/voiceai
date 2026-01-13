/**
 * Life Transition Support
 *
 * Coaching support for major life transitions that disrupt habits.
 *
 * @module habit-coaching/transitions
 */
import type { LifeTransitionSupport } from './types.js';
export declare const LIFE_TRANSITION_SUPPORT: Record<string, LifeTransitionSupport>;
/**
 * Get transition support by type
 */
export declare function getTransitionSupport(transition: string): LifeTransitionSupport | undefined;
/**
 * Get all available transition types
 */
export declare function getTransitionTypes(): string[];
//# sourceMappingURL=transitions.d.ts.map