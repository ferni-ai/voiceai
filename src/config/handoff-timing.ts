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

// ============================================================================
// BASE DURATIONS (aligned with design system)
// ============================================================================

/**
 * Design system duration values (in ms)
 * These match the values in animation-constants.ts
 */
const DURATION = {
  MICRO: 50,
  FAST: 100,
  NORMAL: 200,
  SLOW: 300,
  MODERATE: 400,
  DELIBERATE: 500,
  DRAMATIC: 600,
  CELEBRATION: 800,
} as const;

// ============================================================================
// HANDOFF TIMING CONFIGURATION
// ============================================================================

/**
 * Handoff timing constants
 * All values derive from design system durations
 */
export const HANDOFF_TIMING = {
  // -------------------------------------------------------------------------
  // Transition Delays (time before voice switch)
  // -------------------------------------------------------------------------

  /** User tapped to switch - be snappy and responsive */
  USER_INITIATED: DURATION.NORMAL, // 200ms

  /** First time meeting this agent - brief theatrical pause */
  FIRST_MEETING: DURATION.MODERATE, // 400ms

  /** Coming back to the coach - warm, familiar transition */
  RETURNING_TO_COACH: DURATION.SLOW, // 300ms

  /** Standard agent-suggested handoff */
  STANDARD: DURATION.SLOW + 50, // 350ms

  // -------------------------------------------------------------------------
  // Post-Sound Timing (pause after sound, before voice)
  // -------------------------------------------------------------------------

  /** Base pause after handoff sound */
  POST_SOUND_PAUSE_BASE: DURATION.NORMAL + 50, // 250ms

  /** Additional pause for first meeting anticipation */
  POST_SOUND_PAUSE_FIRST_MEETING_BONUS: DURATION.FAST + 50, // 150ms

  /** Additional pause for dramatic entrances */
  POST_SOUND_PAUSE_DRAMATIC_BONUS: DURATION.FAST, // 100ms

  // -------------------------------------------------------------------------
  // Rate Limiting
  // -------------------------------------------------------------------------

  /** Minimum time between handoffs (prevent rapid switching) */
  DEBOUNCE_MS: DURATION.CELEBRATION, // 800ms

  /** Rate limit window */
  RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute

  /** Max handoffs per window */
  MAX_HANDOFFS_PER_WINDOW: 15,

  // -------------------------------------------------------------------------
  // Timeouts
  // -------------------------------------------------------------------------

  /** Max time to wait for handoff completion */
  HANDOFF_TIMEOUT_MS: 15_000, // 15 seconds

  /** Max time to wait for visual feedback cleanup */
  MAX_FEEDBACK_DELAY: DURATION.DELIBERATE, // 500ms
} as const;

// ============================================================================
// TRANSITION STYLE MULTIPLIERS
// ============================================================================

/**
 * Delay multipliers for different transition styles
 */
export const TRANSITION_MULTIPLIERS = {
  standard: 1.0,
  dramatic: 1.3,
  subtle: 0.8,
  warm: 1.0,
} as const;

export type TransitionStyle = keyof typeof TRANSITION_MULTIPLIERS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the transition delay for a handoff
 *
 * @param style - Transition style of the target agent
 * @param isUserInitiated - Whether the user requested this handoff
 * @param isFirstMeeting - Whether this is the first time meeting the agent
 * @param isReturningToCoach - Whether returning to the coordinator
 * @returns Transition delay in milliseconds
 */
export function getTransitionDelay(
  style: TransitionStyle = 'standard',
  isUserInitiated: boolean = false,
  isFirstMeeting: boolean = false,
  isReturningToCoach: boolean = false
): number {
  // Get base delay based on context
  let baseDelay: number;

  if (isUserInitiated) {
    baseDelay = HANDOFF_TIMING.USER_INITIATED;
  } else if (isFirstMeeting) {
    baseDelay = HANDOFF_TIMING.FIRST_MEETING;
  } else if (isReturningToCoach) {
    baseDelay = HANDOFF_TIMING.RETURNING_TO_COACH;
  } else {
    baseDelay = HANDOFF_TIMING.STANDARD;
  }

  // Apply style multiplier
  const multiplier = TRANSITION_MULTIPLIERS[style] || 1.0;

  return Math.round(baseDelay * multiplier);
}

/**
 * Calculate the post-sound pause duration
 *
 * @param style - Transition style of the target agent
 * @param isFirstMeeting - Whether this is the first time meeting the agent
 * @returns Pause duration in milliseconds
 */
export function getPostSoundPause(
  style: TransitionStyle = 'standard',
  isFirstMeeting: boolean = false
): number {
  let pause = HANDOFF_TIMING.POST_SOUND_PAUSE_BASE;

  if (isFirstMeeting) {
    pause += HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS;
  }

  if (style === 'dramatic') {
    pause += HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS;
  }

  return pause;
}

/**
 * Check if a handoff is allowed based on rate limiting
 *
 * @param lastHandoffTime - Timestamp of the last handoff
 * @returns Whether the handoff is allowed
 */
export function isHandoffAllowed(lastHandoffTime: number): boolean {
  const now = Date.now();
  return now - lastHandoffTime >= HANDOFF_TIMING.DEBOUNCE_MS;
}

/**
 * Get the remaining cooldown time for rate limiting
 *
 * @param lastHandoffTime - Timestamp of the last handoff
 * @returns Remaining cooldown in milliseconds (0 if allowed)
 */
export function getRateLimitCooldown(lastHandoffTime: number): number {
  const now = Date.now();
  const elapsed = now - lastHandoffTime;

  if (elapsed >= HANDOFF_TIMING.DEBOUNCE_MS) {
    return 0;
  }

  return HANDOFF_TIMING.DEBOUNCE_MS - elapsed;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HANDOFF_TIMING;

