/**
 * Handoff Timing Constants - Frontend Version
 *
 * Mirrors the backend src/config/handoff-timing.ts values.
 * These should stay synchronized.
 *
 * IMPORTANT: If you update values here, also update:
 *   src/config/handoff-timing.ts (backend)
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
// TRANSITION STYLE TYPES
// ============================================================================

/**
 * Transition style for handoff animations
 */
export type TransitionStyle = 'standard' | 'dramatic' | 'subtle' | 'warm';

/**
 * Delay multipliers for different transition styles
 */
export const TRANSITION_MULTIPLIERS: Record<TransitionStyle, number> = {
  standard: 1.0,
  dramatic: 1.3,
  subtle: 0.8,
  warm: 1.0,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the transition delay for a handoff
 */
export function getTransitionDelay(
  style: TransitionStyle = 'standard',
  isUserInitiated: boolean = false,
  isFirstMeeting: boolean = false,
  isReturningToCoach: boolean = false
): number {
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

  const multiplier = TRANSITION_MULTIPLIERS[style] || 1.0;
  return Math.round(baseDelay * multiplier);
}

/**
 * Calculate the post-sound pause duration
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
 */
export function isHandoffAllowed(lastHandoffTime: number): boolean {
  return Date.now() - lastHandoffTime >= HANDOFF_TIMING.DEBOUNCE_MS;
}

/**
 * Get remaining cooldown time for rate limiting
 */
export function getRateLimitCooldown(lastHandoffTime: number): number {
  const elapsed = Date.now() - lastHandoffTime;
  if (elapsed >= HANDOFF_TIMING.DEBOUNCE_MS) {
    return 0;
  }
  return HANDOFF_TIMING.DEBOUNCE_MS - elapsed;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HANDOFF_TIMING;

