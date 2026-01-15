/**
 * Session Time Limit Service
 *
 * "Ferni Free Forever" Model - Like Fortnite matches:
 * - Free users get unlimited conversations with Ferni
 * - Each conversation has a 7-minute time limit
 * - Premium users get unlimited conversation time
 *
 * Philosophy: The time limit creates natural conversation "matches"
 * that feel complete, not cut off. Users can start a new conversation
 * immediately - they're never locked out.
 */

import {
  FREE_SESSION_DURATION_MS,
  SESSION_GRACE_MS,
  SESSION_WARNING_MS,
  TIER_CONFIGS,
  type SubscriptionTier,
} from '../types/subscription.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SessionTimeLimit' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionTimeState {
  /** Session start timestamp */
  sessionStartedAt: number;
  /** User's subscription tier */
  tier: SubscriptionTier;
  /** Session time limit in ms (null = unlimited) */
  timeLimitMs: number | null;
  /** Has the user been warned about time running out */
  warningShown: boolean;
  /** Has the session ended due to time limit */
  sessionEnded: boolean;
}

export interface SessionTimeCheck {
  /** Time elapsed in this session (ms) */
  elapsedMs: number;
  /** Time remaining (null = unlimited) */
  remainingMs: number | null;
  /** Is session time unlimited */
  isUnlimited: boolean;
  /** Is user approaching the time limit (within warning threshold) */
  approachingLimit: boolean;
  /** Has the time limit been reached */
  limitReached: boolean;
  /** Is user in grace period (can finish current thought) */
  inGracePeriod: boolean;
  /** Should show warning prompt */
  showWarning: boolean;
  /** Should show session end prompt */
  showSessionEnd: boolean;
  /** Human-readable time remaining */
  timeRemainingText: string | null;
}

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

const activeSessions = new Map<string, SessionTimeState>();

/**
 * Start a new session timer for a user
 */
export function startSessionTimer(userId: string, tier: SubscriptionTier): SessionTimeState {
  const config = TIER_CONFIGS[tier];
  const timeLimitMs = config.sessionMinutes ? config.sessionMinutes * 60 * 1000 : null;

  const state: SessionTimeState = {
    sessionStartedAt: Date.now(),
    tier,
    timeLimitMs,
    warningShown: false,
    sessionEnded: false,
  };

  activeSessions.set(userId, state);

  log.info(
    {
      userId,
      tier,
      timeLimitMinutes: config.sessionMinutes,
      unlimited: timeLimitMs === null,
    },
    'Session timer started'
  );

  return state;
}

/**
 * Get current session state for a user
 */
export function getSessionState(userId: string): SessionTimeState | null {
  return activeSessions.get(userId) ?? null;
}

/**
 * Check session time status
 */
export function checkSessionTime(userId: string): SessionTimeCheck {
  const state = activeSessions.get(userId);

  // No active session or unlimited time
  if (!state || state.timeLimitMs === null) {
    return {
      elapsedMs: state ? Date.now() - state.sessionStartedAt : 0,
      remainingMs: null,
      isUnlimited: true,
      approachingLimit: false,
      limitReached: false,
      inGracePeriod: false,
      showWarning: false,
      showSessionEnd: false,
      timeRemainingText: null,
    };
  }

  const elapsedMs = Date.now() - state.sessionStartedAt;
  const remainingMs = Math.max(0, state.timeLimitMs - elapsedMs);
  const limitReached = remainingMs <= 0;
  const inGracePeriod = limitReached && elapsedMs < state.timeLimitMs + SESSION_GRACE_MS;
  const approachingLimit = !limitReached && remainingMs <= SESSION_WARNING_MS;

  // Determine what to show
  const showWarning = approachingLimit && !state.warningShown;
  const showSessionEnd = limitReached && !state.sessionEnded && !inGracePeriod;

  // Update state if showing warning
  if (showWarning) {
    state.warningShown = true;
  }
  if (showSessionEnd) {
    state.sessionEnded = true;
  }

  return {
    elapsedMs,
    remainingMs,
    isUnlimited: false,
    approachingLimit,
    limitReached,
    inGracePeriod,
    showWarning,
    showSessionEnd,
    timeRemainingText: formatTimeRemaining(remainingMs),
  };
}

/**
 * End a session timer
 */
export function endSessionTimer(userId: string): void {
  const state = activeSessions.get(userId);
  if (state) {
    const elapsedMs = Date.now() - state.sessionStartedAt;
    log.info(
      {
        userId,
        elapsedMinutes: Math.round(elapsedMs / 60000),
        limitReached: state.sessionEnded,
      },
      'Session timer ended'
    );
    activeSessions.delete(userId);
  }
}

/**
 * Check if user can continue current session
 * Returns true even if in grace period
 */
export function canContinueSession(userId: string): boolean {
  const check = checkSessionTime(userId);
  return check.isUnlimited || !check.limitReached || check.inGracePeriod;
}

/**
 * Check if user should be prompted to upgrade
 */
export function shouldPromptUpgrade(userId: string): boolean {
  const state = activeSessions.get(userId);
  if (!state || state.tier !== 'free') return false;

  const check = checkSessionTime(userId);
  return check.approachingLimit || check.limitReached;
}

// ============================================================================
// SESSION END PROMPTS
// ============================================================================

/**
 * Warm prompts when session is approaching end
 */
const APPROACHING_END_PROMPTS = [
  "I've really enjoyed this. We have about a minute left - what's most important right now?",
  "Time's flying by! We're getting close to the end of our session. Anything else on your mind?",
  'This has been wonderful. We have a little more time - is there one more thing you wanted to talk about?',
];

/**
 * Prompts when session ends - warm, inviting return
 */
const SESSION_END_PROMPTS = [
  "That was a great conversation. I'll remember everything. Come back anytime - I'm always here.",
  'Seven minutes well spent. Everything you shared is safe with me. See you next time?',
  "I loved talking to you. This isn't goodbye - just see you soon. Come back whenever.",
  "What a conversation. I'll hold onto all of this. You can start a new chat anytime, or if you want longer sessions, I'd love that too.",
];

/**
 * Get an approaching-end prompt
 */
export function getApproachingEndPrompt(): string {
  return APPROACHING_END_PROMPTS[Math.floor(Math.random() * APPROACHING_END_PROMPTS.length)];
}

/**
 * Get a session-end prompt
 */
export function getSessionEndPrompt(): string {
  return SESSION_END_PROMPTS[Math.floor(Math.random() * SESSION_END_PROMPTS.length)];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds} seconds`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sessionTimeLimit = {
  start: startSessionTimer,
  check: checkSessionTime,
  end: endSessionTimer,
  canContinue: canContinueSession,
  shouldPromptUpgrade,
  getApproachingPrompt: getApproachingEndPrompt,
  getEndPrompt: getSessionEndPrompt,
  DURATION_MS: FREE_SESSION_DURATION_MS,
  GRACE_MS: SESSION_GRACE_MS,
  WARNING_MS: SESSION_WARNING_MS,
};

export default sessionTimeLimit;
