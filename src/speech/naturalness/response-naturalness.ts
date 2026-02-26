/**
 * Response Naturalness Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Makes AI responses feel more human through:
 * - Acknowledgment prefixes ("Mm-hmm. So...")
 * - Thinking fillers during delays ("Let me think...")
 * - Catchphrase integration
 * - Response warmth markers
 *
 * The little things matter. A simple "mm-hmm" before answering,
 * a natural pause while "thinking" - these micro-moments are what
 * transform a response into a conversation.
 *
 * NOTE: Persona phrases are now consolidated in persona-phrases.ts.
 * This module re-exports them for backward compatibility.
 */

// ============================================================================
// RE-EXPORTS FROM PERSONA-PHRASES (Backward Compatibility)
// ============================================================================

// Re-export persona phrase data and helpers
export {
  ACKNOWLEDGMENT_PREFIXES,
  getAcknowledgmentPrefix,
  getCatchphraseWithSsml,
  // getThinkingFiller - DEPRECATED: Use getContextAwareThinkingFiller instead
  getContextAwareThinkingFiller, // Dynamic context-aware version (PREFERRED)
  normalizePersonaId,
  PERSONA_CATCHPHRASES,
  // THINKING_FILLERS - DEPRECATED: Use ProcessingIntelligence instead
} from '../persona-phrases.js';

// Import for internal use
import {
  getAcknowledgmentPrefix as _getAcknowledgmentPrefix,
  getCatchphraseWithSsml as _getCatchphraseWithSsml,
} from '../persona-phrases.js';

// HUMANIZATION FIX: Import feedback coordinator to prevent over-feedback
import { canAddFeedback, recordFeedback } from '../feedback-coordinator.js';

// ============================================================================
// ACKNOWLEDGMENT MOOD DETERMINATION
// ============================================================================

/**
 * Determine the appropriate acknowledgment mood based on context
 */
export function determineAcknowledgmentMood(
  userEmotion?: string,
  topicWeight?: 'light' | 'medium' | 'heavy',
  isQuestion?: boolean,
  isExciting?: boolean
): 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful' {
  // Empathetic for heavy topics or distressed user
  if (
    topicWeight === 'heavy' ||
    ['sad', 'anxious', 'stressed', 'worried'].includes(userEmotion || '')
  ) {
    return 'empathetic';
  }

  // Excited for positive emotions or exciting news
  if (isExciting || ['joy', 'excited', 'happy'].includes(userEmotion || '')) {
    return 'excited';
  }

  // Thoughtful for questions or analytical topics
  if (isQuestion) {
    return 'thoughtful';
  }

  // Engaged when user is sharing actively
  if (['curious', 'interested'].includes(userEmotion || '') || topicWeight === 'medium') {
    return 'engaged';
  }

  return 'neutral';
}

/**
 * Should we add a prefix? (Not every response needs one)
 *
 * HUMANIZATION FIX (Dec 2025): Reduced from 70% to 30% base rate.
 * Real humans don't say "mm-hmm" before most responses - it feels
 * performative and robotic when overdone. The absence of acknowledgment
 * is also a form of natural communication.
 */
export function shouldAddPrefix(
  turnCount: number,
  isFollowUp: boolean,
  isGreeting: boolean
): boolean {
  // Don't prefix greetings
  if (isGreeting || turnCount === 0) {
    return false;
  }

  // Follow-up responses get prefix 50% of the time (reduced from 100%)
  if (isFollowUp) {
    return Math.random() < 0.5;
  }

  // Add prefix ~30% of the time for natural variation (reduced from 70%)
  return Math.random() < 0.3;
}

// ============================================================================
// SESSION-SCOPED CATCHPHRASE TRACKING
// ============================================================================

interface CatchphraseConfig {
  maxPerSession: number;
  minTurnsBetween: number;
  positiveChance: number;
  defaultChance: number;
}

const CATCHPHRASE_CONFIG: CatchphraseConfig = {
  maxPerSession: 3,
  minTurnsBetween: 4,
  positiveChance: 0.4,
  defaultChance: 0.15,
};

/**
 * Session-scoped catchphrase usage tracker.
 */
export class CatchphraseTracker {
  private usage = new Map<string, { lastUsed: number; count: number }>();
  private config: CatchphraseConfig;

  constructor(config: Partial<CatchphraseConfig> = {}) {
    this.config = { ...CATCHPHRASE_CONFIG, ...config };
  }

  shouldInject(personaId: string, turnCount: number, isPositiveMoment: boolean): boolean {
    const usage = this.usage.get(personaId) || { lastUsed: -10, count: 0 };

    if (usage.count >= this.config.maxPerSession) return false;
    if (turnCount - usage.lastUsed < this.config.minTurnsBetween) return false;

    const chance = isPositiveMoment ? this.config.positiveChance : this.config.defaultChance;

    if (Math.random() < chance) {
      this.usage.set(personaId, {
        lastUsed: turnCount,
        count: usage.count + 1,
      });
      return true;
    }

    return false;
  }

  reset(): void {
    this.usage.clear();
  }
}

// ============================================================================
// SESSION-SCOPED CATCHPHRASE MANAGEMENT
// ============================================================================

const sessionTrackers = new Map<string, CatchphraseTracker>();

/**
 * Get or create a session-scoped catchphrase tracker.
 */
export function getSessionCatchphraseTracker(sessionId: string): CatchphraseTracker {
  let tracker = sessionTrackers.get(sessionId);
  if (!tracker) {
    tracker = new CatchphraseTracker();
    sessionTrackers.set(sessionId, tracker);
  }
  return tracker;
}

/**
 * Reset catchphrase tracker for a session
 */
export function resetSessionCatchphraseTracker(sessionId: string): void {
  const tracker = sessionTrackers.get(sessionId);
  if (tracker) {
    tracker.reset();
    sessionTrackers.delete(sessionId);
  }
}

/**
 * Reset all session catchphrase trackers
 */
export function resetAllCatchphraseTrackers(): void {
  sessionTrackers.clear();
}

// Overload: Session-scoped version (4 args)

export function shouldInjectCatchphrase(
  sessionId: string,
  personaId: string,
  turnCount: number,
  isPositiveMoment: boolean
): boolean;
// Overload: Legacy version (3 args) - deprecated
// eslint-disable-next-line no-redeclare
export function shouldInjectCatchphrase(
  personaId: string,
  turnCount: number,
  isPositiveMoment: boolean
): boolean;
/**
 * Should we inject a catchphrase?
 * Supports both legacy 3-arg signature and new 4-arg signature with sessionId.
 * @deprecated The 3-argument version (without sessionId) is deprecated
 */
// eslint-disable-next-line no-redeclare
export function shouldInjectCatchphrase(
  sessionIdOrPersonaId: string,
  personaIdOrTurnCount: string | number,
  turnCountOrIsPositive: number | boolean,
  isPositiveMoment?: boolean
): boolean {
  if (typeof personaIdOrTurnCount === 'number') {
    // Legacy 3-arg signature
    const personaId = sessionIdOrPersonaId;
    const turnCount = personaIdOrTurnCount;
    const isPositive = turnCountOrIsPositive as boolean;
    const tracker = getSessionCatchphraseTracker('__default__');
    return tracker.shouldInject(personaId, turnCount, isPositive);
  } else {
    // New 4-arg signature
    const sessionId = sessionIdOrPersonaId;
    const personaId = personaIdOrTurnCount;
    const turnCount = turnCountOrIsPositive as number;
    const isPositive = isPositiveMoment ?? false;
    const tracker = getSessionCatchphraseTracker(sessionId);
    return tracker.shouldInject(personaId, turnCount, isPositive);
  }
}

/**
 * Reset catchphrase tracking (for new session)
 */
export function resetCatchphraseTracking(): void {
  resetAllCatchphraseTrackers();
}

// ============================================================================
// COMBINED RESPONSE ENHANCEMENT
// ============================================================================

export interface ResponseEnhancementOptions {
  personaId: string;
  turnCount: number;
  userEmotion?: string;
  topicWeight?: 'light' | 'medium' | 'heavy';
  isQuestion?: boolean;
  isFollowUp?: boolean;
  isGreeting?: boolean;
  isPositiveMoment?: boolean;
  /** Session ID for feedback coordination (optional for backward compatibility) */
  sessionId?: string;
}

export interface ResponseEnhancement {
  prefix: string | null;
  suffix: string | null;
  shouldAddThinkingFiller: boolean;
}

/**
 * Get all response enhancements for a response
 *
 * HUMANIZATION FIX (Dec 2025): Now coordinates with global feedback budget
 * to prevent stacking (backchannel + prefix + catchphrase in same turn).
 */
export function getResponseEnhancements(options: ResponseEnhancementOptions): ResponseEnhancement {
  const {
    personaId,
    turnCount,
    userEmotion,
    topicWeight,
    isQuestion,
    isFollowUp = false,
    isGreeting = false,
    isPositiveMoment = false,
    sessionId,
  } = options;

  let prefix: string | null = null;
  let suffix: string | null = null;

  // Add acknowledgment prefix (if allowed by feedback coordinator)
  const shouldPrefix = shouldAddPrefix(turnCount, isFollowUp, isGreeting);
  const canPrefix = sessionId ? canAddFeedback(sessionId, 'prefix', turnCount) : true;

  if (shouldPrefix && canPrefix) {
    const mood = determineAcknowledgmentMood(
      userEmotion,
      topicWeight,
      isQuestion,
      isPositiveMoment
    );
    prefix = _getAcknowledgmentPrefix(personaId, mood);

    // Record in coordinator
    if (sessionId) {
      recordFeedback(sessionId, 'prefix');
    }
  }

  // Maybe add catchphrase at end (if allowed by feedback coordinator)
  const shouldCatchphrase = shouldInjectCatchphrase(personaId, turnCount, isPositiveMoment);
  const canAppreciate = sessionId ? canAddFeedback(sessionId, 'appreciation', turnCount) : true;

  if (shouldCatchphrase && canAppreciate) {
    suffix = _getCatchphraseWithSsml(personaId);

    // Record in coordinator (catchphrases are a form of appreciation)
    if (sessionId) {
      recordFeedback(sessionId, 'appreciation');
    }
  }

  return {
    prefix,
    suffix,
    shouldAddThinkingFiller: isQuestion === true,
  };
}

export default {
  determineAcknowledgmentMood,
  shouldAddPrefix,
  getResponseEnhancements,
  resetCatchphraseTracking,
  shouldInjectCatchphrase,
};
