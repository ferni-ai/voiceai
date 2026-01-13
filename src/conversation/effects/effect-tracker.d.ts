/**
 * Effect Tracker
 *
 * Tracks effect usage within a session to enforce cooldowns and per-session limits.
 * This prevents over-humanization by ensuring effects respect their configured limits.
 *
 * @module @ferni/conversation/effects/effect-tracker
 */
import type { EffectTracker } from './types.js';
/**
 * Get or create an effect tracker for a session
 */
export declare function getEffectTracker(sessionId: string): EffectTracker;
/**
 * Reset tracker for a session
 */
export declare function resetEffectTracker(sessionId: string): void;
/**
 * Reset all trackers
 */
export declare function resetAllEffectTrackers(): void;
//# sourceMappingURL=effect-tracker.d.ts.map