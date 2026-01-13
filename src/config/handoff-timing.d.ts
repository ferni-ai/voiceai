/**
 * Handoff Timing Constants - Aligned with Design System
 *
 * Centralized handoff timing that:
 * 1. Aligns with design system DURATION values
 * 2. Is shared between frontend and backend
 * 3. Supports transition style customization
 *
 * USAGE:
 *   import { HANDOFF_TIMING, getTransitionDelay } from './handoff-timing.js';
 *
 *   const delay = getTransitionDelay('dramatic', true); // 520ms for first meeting dramatic
 */
/**
 * Handoff timing constants
 * All values derive from design system durations
 */
export declare const HANDOFF_TIMING: {
    /** User tapped to switch - be snappy and responsive */
    readonly USER_INITIATED: 200;
    /** First time meeting this agent - brief theatrical pause */
    readonly FIRST_MEETING: 400;
    /** Coming back to the coach - warm, familiar transition */
    readonly RETURNING_TO_COACH: 300;
    /** Standard agent-suggested handoff */
    readonly STANDARD: number;
    /** Base pause after handoff sound */
    readonly POST_SOUND_PAUSE_BASE: number;
    /** Additional pause for first meeting anticipation */
    readonly POST_SOUND_PAUSE_FIRST_MEETING_BONUS: number;
    /** Additional pause for dramatic entrances */
    readonly POST_SOUND_PAUSE_DRAMATIC_BONUS: 100;
    /** Minimum time between handoffs (prevent rapid switching) */
    readonly DEBOUNCE_MS: 800;
    /** Rate limit window */
    readonly RATE_LIMIT_WINDOW_MS: 60000;
    /** Max handoffs per window */
    readonly MAX_HANDOFFS_PER_WINDOW: 15;
    /** Max time to wait for handoff completion */
    readonly HANDOFF_TIMEOUT_MS: 15000;
    /** Max time to wait for visual feedback cleanup */
    readonly MAX_FEEDBACK_DELAY: 500;
};
/**
 * Delay multipliers for different transition styles
 */
export declare const TRANSITION_MULTIPLIERS: {
    readonly standard: 1;
    readonly dramatic: 1.3;
    readonly subtle: 0.8;
    readonly warm: 1;
};
export type TransitionStyle = keyof typeof TRANSITION_MULTIPLIERS;
/**
 * Calculate the transition delay for a handoff
 *
 * @param style - Transition style of the target agent
 * @param isUserInitiated - Whether the user requested this handoff
 * @param isFirstMeeting - Whether this is the first time meeting the agent
 * @param isReturningToCoach - Whether returning to the coordinator
 * @returns Transition delay in milliseconds
 */
export declare function getTransitionDelay(style?: TransitionStyle, isUserInitiated?: boolean, isFirstMeeting?: boolean, isReturningToCoach?: boolean): number;
/**
 * Calculate the post-sound pause duration
 *
 * @param style - Transition style of the target agent
 * @param isFirstMeeting - Whether this is the first time meeting the agent
 * @returns Pause duration in milliseconds
 */
export declare function getPostSoundPause(style?: TransitionStyle, isFirstMeeting?: boolean): number;
/**
 * Check if a handoff is allowed based on rate limiting
 *
 * @param lastHandoffTime - Timestamp of the last handoff
 * @returns Whether the handoff is allowed
 */
export declare function isHandoffAllowed(lastHandoffTime: number): boolean;
/**
 * Get the remaining cooldown time for rate limiting
 *
 * @param lastHandoffTime - Timestamp of the last handoff
 * @returns Remaining cooldown in milliseconds (0 if allowed)
 */
export declare function getRateLimitCooldown(lastHandoffTime: number): number;
export default HANDOFF_TIMING;
//# sourceMappingURL=handoff-timing.d.ts.map