/**
 * Feedback Coordinator - Global Budget for Verbal Feedback
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Prevents over-feedback by coordinating all verbal feedback systems:
 * - Backchannels (standard, enhanced, live)
 * - Acknowledgment prefixes
 * - Contextual laughter
 * - Spontaneous appreciation
 * - Thinking fillers
 *
 * HUMANIZATION FIX (Dec 2025): Each system was designed in isolation, leading
 * to situations where 5-7 different feedback mechanisms could fire in a single
 * turn. This coordinator ensures we don't overwhelm users with constant verbal
 * feedback, which feels robotic and performative.
 *
 * Key insight: Real humans often respond WITHOUT explicit verbal acknowledgment.
 * The absence of "mm-hmm" is also natural communication.
 *
 * @module speech/feedback-coordinator
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'FeedbackCoordinator' });

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackType =
  | 'backchannel' // "Mm-hmm", "Yeah" during user speech
  | 'prefix' // Acknowledgment before response
  | 'laugh' // Contextual laughter
  | 'appreciation' // Spontaneous appreciation
  | 'filler' // Thinking filler
  | 'comfort'; // Anticipatory comfort sound

interface TurnFeedbackBudget {
  /** Has a backchannel been emitted this turn? */
  hasBackchanneled: boolean;
  /** Has an acknowledgment prefix been added this turn? */
  hasAcknowledgmentPrefix: boolean;
  /** Has laughter been added this turn? */
  hasLaughed: boolean;
  /** Has appreciation been expressed this turn? */
  hasAppreciated: boolean;
  /** Has a thinking filler been used this turn? */
  hasFiller: boolean;
  /** Has comfort sound been used this turn? */
  hasComfort: boolean;
  /** Total feedback items this turn */
  feedbackCount: number;
  /** Turn number when this budget was created */
  turnNumber: number;
  /** Timestamp of last feedback */
  lastFeedbackTime: number;
}

interface SessionFeedbackState {
  /** Current turn's budget */
  currentTurn: TurnFeedbackBudget;
  /** Total backchannels this session */
  totalBackchannels: number;
  /** Total laughs this session */
  totalLaughs: number;
  /** Total appreciations this session */
  totalAppreciations: number;
  /** Session start time */
  sessionStart: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Maximum feedback items per turn.
 *
 * This prevents stacking like:
 * - Backchannel + prefix + laughter + catchphrase = 4 items!
 *
 * With this limit, we allow at most 2 feedback items per turn.
 */
const MAX_FEEDBACK_PER_TURN = 2;

/**
 * Minimum time between any feedback (ms).
 * Prevents rapid-fire feedback even across turns.
 */
const MIN_FEEDBACK_INTERVAL_MS = 3000;

/**
 * Mutual exclusions - if one fires, the other shouldn't.
 * This reflects natural conversation patterns.
 */
const MUTUAL_EXCLUSIONS: Record<FeedbackType, FeedbackType[]> = {
  backchannel: ['prefix'], // Don't "mm-hmm" during speech AND prefix response
  prefix: ['backchannel'], // If we already backchanneled, skip the prefix
  laugh: ['appreciation'], // Don't laugh AND appreciate in same turn
  appreciation: ['laugh'], // One emotional moment is enough
  filler: [], // Filler is for delay, can coexist
  comfort: ['laugh', 'appreciation'], // Comfort is for heavy moments, no levity
};

/**
 * Session limits to prevent over-feedback across the conversation.
 */
const SESSION_LIMITS = {
  maxBackchannels: 20, // Per session
  maxLaughs: 4, // Per session (already enforced in contextual-laughter)
  maxAppreciations: 2, // Per session
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, SessionFeedbackState>();

/**
 * Get or create session feedback state
 */
function getSessionState(sessionId: string): SessionFeedbackState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      currentTurn: createEmptyBudget(0),
      totalBackchannels: 0,
      totalLaughs: 0,
      totalAppreciations: 0,
      sessionStart: Date.now(),
    });
  }
  return sessionStates.get(sessionId)!;
}

/**
 * Create an empty turn budget
 */
function createEmptyBudget(turnNumber: number): TurnFeedbackBudget {
  return {
    hasBackchanneled: false,
    hasAcknowledgmentPrefix: false,
    hasLaughed: false,
    hasAppreciated: false,
    hasFiller: false,
    hasComfort: false,
    feedbackCount: 0,
    turnNumber,
    lastFeedbackTime: 0,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if we can add a specific type of feedback.
 *
 * Call this BEFORE deciding to emit feedback. If it returns false,
 * skip the feedback to maintain natural conversation flow.
 *
 * @param sessionId - Session ID
 * @param type - Type of feedback being considered
 * @param turnNumber - Current turn number (optional, for turn tracking)
 * @returns Whether this feedback type is allowed right now
 */
export function canAddFeedback(
  sessionId: string,
  type: FeedbackType,
  turnNumber?: number
): boolean {
  const state = getSessionState(sessionId);

  // If turn number changed, reset turn budget
  if (turnNumber !== undefined && turnNumber !== state.currentTurn.turnNumber) {
    state.currentTurn = createEmptyBudget(turnNumber);
  }

  const budget = state.currentTurn;

  // Check turn limit
  if (budget.feedbackCount >= MAX_FEEDBACK_PER_TURN) {
    log.debug(
      { type, feedbackCount: budget.feedbackCount, max: MAX_FEEDBACK_PER_TURN },
      'Feedback blocked: turn limit reached'
    );
    return false;
  }

  // Check time since last feedback
  const timeSinceLast = Date.now() - budget.lastFeedbackTime;
  if (budget.lastFeedbackTime > 0 && timeSinceLast < MIN_FEEDBACK_INTERVAL_MS) {
    log.debug(
      { type, timeSinceLast, minInterval: MIN_FEEDBACK_INTERVAL_MS },
      'Feedback blocked: too soon'
    );
    return false;
  }

  // Check mutual exclusions
  const exclusions = MUTUAL_EXCLUSIONS[type] || [];
  for (const excluded of exclusions) {
    if (hasFeedbackThisTurn(budget, excluded)) {
      log.debug({ type, excluded }, 'Feedback blocked: mutual exclusion');
      return false;
    }
  }

  // Check session limits
  if (type === 'backchannel' && state.totalBackchannels >= SESSION_LIMITS.maxBackchannels) {
    log.debug({ type, total: state.totalBackchannels }, 'Feedback blocked: session limit');
    return false;
  }
  if (type === 'laugh' && state.totalLaughs >= SESSION_LIMITS.maxLaughs) {
    return false;
  }
  if (type === 'appreciation' && state.totalAppreciations >= SESSION_LIMITS.maxAppreciations) {
    return false;
  }

  // Check if already done this turn
  if (hasFeedbackThisTurn(budget, type)) {
    log.debug({ type }, 'Feedback blocked: already done this turn');
    return false;
  }

  return true;
}

/**
 * Record that feedback was given.
 *
 * Call this AFTER emitting feedback to update the budget.
 *
 * @param sessionId - Session ID
 * @param type - Type of feedback that was emitted
 */
export function recordFeedback(sessionId: string, type: FeedbackType): void {
  const state = getSessionState(sessionId);
  const budget = state.currentTurn;

  budget.feedbackCount++;
  budget.lastFeedbackTime = Date.now();

  switch (type) {
    case 'backchannel':
      budget.hasBackchanneled = true;
      state.totalBackchannels++;
      break;
    case 'prefix':
      budget.hasAcknowledgmentPrefix = true;
      break;
    case 'laugh':
      budget.hasLaughed = true;
      state.totalLaughs++;
      break;
    case 'appreciation':
      budget.hasAppreciated = true;
      state.totalAppreciations++;
      break;
    case 'filler':
      budget.hasFiller = true;
      break;
    case 'comfort':
      budget.hasComfort = true;
      break;
  }

  log.debug(
    { type, feedbackCount: budget.feedbackCount, totalBackchannels: state.totalBackchannels },
    'Feedback recorded'
  );
}

/**
 * Advance to next turn (resets turn budget).
 *
 * Call this when a new user turn begins.
 *
 * @param sessionId - Session ID
 * @param turnNumber - New turn number
 */
export function advanceTurn(sessionId: string, turnNumber: number): void {
  const state = getSessionState(sessionId);
  state.currentTurn = createEmptyBudget(turnNumber);
  log.debug({ turnNumber }, 'Advanced to new turn');
}

/**
 * Reset all feedback state for a session.
 *
 * Call this on session end for cleanup.
 *
 * @param sessionId - Session ID
 */
export function resetFeedbackCoordinator(sessionId: string): void {
  sessionStates.delete(sessionId);
  log.debug({ sessionId }, 'Feedback coordinator reset');
}

/**
 * Reset all sessions (for testing/emergency cleanup).
 */
export function resetAllFeedbackCoordinators(): void {
  sessionStates.clear();
  log.debug('All feedback coordinators reset');
}

/**
 * Get feedback statistics for a session.
 *
 * Useful for debugging and monitoring.
 */
export function getFeedbackStats(sessionId: string): {
  turnFeedbackCount: number;
  totalBackchannels: number;
  totalLaughs: number;
  totalAppreciations: number;
  sessionDurationMs: number;
} {
  const state = getSessionState(sessionId);
  return {
    turnFeedbackCount: state.currentTurn.feedbackCount,
    totalBackchannels: state.totalBackchannels,
    totalLaughs: state.totalLaughs,
    totalAppreciations: state.totalAppreciations,
    sessionDurationMs: Date.now() - state.sessionStart,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function hasFeedbackThisTurn(budget: TurnFeedbackBudget, type: FeedbackType): boolean {
  switch (type) {
    case 'backchannel':
      return budget.hasBackchanneled;
    case 'prefix':
      return budget.hasAcknowledgmentPrefix;
    case 'laugh':
      return budget.hasLaughed;
    case 'appreciation':
      return budget.hasAppreciated;
    case 'filler':
      return budget.hasFiller;
    case 'comfort':
      return budget.hasComfort;
    default:
      return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  canAddFeedback,
  recordFeedback,
  advanceTurn,
  resetFeedbackCoordinator,
  resetAllFeedbackCoordinators,
  getFeedbackStats,
};
