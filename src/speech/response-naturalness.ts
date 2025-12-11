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
  PERSONA_CATCHPHRASES,
  THINKING_FILLERS,
  getAcknowledgmentPrefix,
  getCatchphraseWithSsml,
  getThinkingFiller,
  normalizePersonaId,
} from './persona-phrases.js';

// Import for internal use
import {
  getAcknowledgmentPrefix as _getAcknowledgmentPrefix,
  getCatchphraseWithSsml as _getCatchphraseWithSsml,
} from './persona-phrases.js';

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

  // Always prefix follow-up responses
  if (isFollowUp) {
    return true;
  }

  // Add prefix ~70% of the time for natural variation
  return Math.random() < 0.7;
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
// eslint-disable-next-line no-redeclare
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
}

export interface ResponseEnhancement {
  prefix: string | null;
  suffix: string | null;
  shouldAddThinkingFiller: boolean;
}

/**
 * Get all response enhancements for a response
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
  } = options;

  let prefix: string | null = null;
  let suffix: string | null = null;

  // Add acknowledgment prefix
  if (shouldAddPrefix(turnCount, isFollowUp, isGreeting)) {
    const mood = determineAcknowledgmentMood(
      userEmotion,
      topicWeight,
      isQuestion,
      isPositiveMoment
    );
    prefix = _getAcknowledgmentPrefix(personaId, mood);
  }

  // Maybe add catchphrase at end
  if (shouldInjectCatchphrase(personaId, turnCount, isPositiveMoment)) {
    suffix = _getCatchphraseWithSsml(personaId);
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
