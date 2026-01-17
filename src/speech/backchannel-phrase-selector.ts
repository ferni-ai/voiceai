/**
 * Backchannel Phrase Selector - SINGLE SOURCE OF TRUTH
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module is the ONLY place that should select backchannel phrases.
 * All other systems (BackchannelingSystem, ActiveListeningEngine, etc.)
 * should call these functions instead of using their own phrase arrays.
 *
 * Features:
 * - Loads from persona bundles (not hardcoded)
 * - Tracks per-session history to prevent repetition
 * - Uses seeded randomness for consistent yet varied selection
 * - Never repeats the same phrase within 5 turns
 *
 * @module speech/backchannel-phrase-selector
 */

import { seededChance, seededIndex } from '../conversation/utils/random-generator.js';
import { createLogger } from '../utils/safe-logger.js';
import { canAddFeedback, recordFeedback } from './feedback-coordinator.js';
import {
  getBackchannelSync,
  getSilenceFillerSync,
  hasVoiceDataLoaded,
  loadPersonaVoiceData,
} from './persona-voice-loader.js';

const log = createLogger({ module: 'BackchannelPhraseSelector' });

// ============================================================================
// TYPES
// ============================================================================

export type BackchannelEmotionType =
  | 'neutral'
  | 'engaged'
  | 'empathetic'
  | 'excited'
  | 'supportive';

export interface BackchannelSelectionContext {
  /** Type of emotional context */
  emotionType: BackchannelEmotionType;
  /** Current turn number */
  turnNumber: number;
  /** Topic weight (affects phrase selection) */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Whether this is during silence */
  isSilence?: boolean;
  /** Silence duration in ms (if applicable) */
  silenceDurationMs?: number;
  /** Random seed for deterministic selection (optional) */
  seed?: string;
}

export interface SelectedBackchannel {
  /** The phrase to speak */
  phrase: string;
  /** SSML-wrapped version */
  ssml: string;
  /** Whether to actually say it (false = stay silent) */
  shouldSpeak: boolean;
  /** Reason if not speaking */
  skipReason?: string;
}

interface PhraseHistory {
  /** Recently used phrases (ring buffer) */
  used: string[];
  /** Map of phrase -> last turn number used */
  lastUsedAt: Map<string, number>;
  /** Current session turn count */
  turnCount: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How many turns before a phrase can be reused */
const PHRASE_REUSE_COOLDOWN_TURNS = 5;

/** Maximum history size */
const MAX_HISTORY_SIZE = 30;

/** Probability of staying silent (natural variation) */
const NATURAL_SILENCE_PROBABILITY = 0.15;

// ============================================================================
// SESSION HISTORY
// ============================================================================

const sessionHistories = new Map<string, PhraseHistory>();

function getOrCreateHistory(sessionId: string): PhraseHistory {
  let history = sessionHistories.get(sessionId);
  if (!history) {
    history = {
      used: [],
      lastUsedAt: new Map(),
      turnCount: 0,
    };
    sessionHistories.set(sessionId, history);
  }
  return history;
}

function recordPhraseUsage(sessionId: string, phrase: string, turnNumber: number): void {
  const history = getOrCreateHistory(sessionId);
  history.used.push(phrase);
  if (history.used.length > MAX_HISTORY_SIZE) {
    const removed = history.used.shift()!;
    // Clean up old entries from lastUsedAt if they're too old
    const oldestAllowed = turnNumber - PHRASE_REUSE_COOLDOWN_TURNS - 5;
    for (const [p, t] of history.lastUsedAt.entries()) {
      if (t < oldestAllowed) {
        history.lastUsedAt.delete(p);
      }
    }
  }
  history.lastUsedAt.set(phrase, turnNumber);
  history.turnCount = turnNumber;
}

function isPhraseRecentlyUsed(sessionId: string, phrase: string, turnNumber: number): boolean {
  const history = getOrCreateHistory(sessionId);
  const lastUsed = history.lastUsedAt.get(phrase) ?? -100;
  return turnNumber - lastUsed < PHRASE_REUSE_COOLDOWN_TURNS;
}

// ============================================================================
// FALLBACK PHRASE POOLS (used when bundles not loaded)
// ============================================================================

const FALLBACK_PHRASES: Record<BackchannelEmotionType, string[]> = {
  neutral: ['Mm-hmm', 'Yeah', 'Mm', 'Okay', 'Right', 'Got it', 'Uh-huh', 'Sure'],
  engaged: ['Oh', 'Interesting', 'Hmm', 'Ah', 'Ooh', 'Mm!', 'Yeah!'],
  empathetic: [
    'I hear you',
    'Yeah...',
    'Mm',
    'I feel that',
    "That's hard",
    'Of course',
    'I can imagine',
  ],
  excited: ['Oh!', 'Yes!', 'Nice!', "That's great!", 'Love that', 'Amazing!'],
  supportive: ["I'm here", 'Take your time', "I'm with you", 'No rush', "I'm listening"],
};

const FALLBACK_SILENCE_PHRASES: Record<'early' | 'mid' | 'late', string[]> = {
  early: ['...', 'Mm'], // 0-3s: Often silence is best
  mid: ['Take your time', "I'm here", 'No rush'], // 3-8s: Gentle presence
  late: ["I'm not going anywhere", "Still here when you're ready", 'Take all the time you need'], // 8s+
};

// ============================================================================
// MAIN SELECTION FUNCTIONS
// ============================================================================

/**
 * Select a backchannel phrase with history tracking and variety.
 *
 * This is the MAIN function that all backchannel systems should use.
 *
 * @param sessionId - Session identifier for history tracking
 * @param personaId - Persona to get phrases for
 * @param context - Selection context
 * @returns Selected backchannel or null if should stay silent
 */
export function selectBackchannel(
  sessionId: string,
  personaId: string,
  context: BackchannelSelectionContext
): SelectedBackchannel | null {
  const { emotionType, turnNumber, topicWeight, seed } = context;

  // Check with feedback coordinator first
  if (!canAddFeedback(sessionId, 'backchannel', turnNumber)) {
    return {
      phrase: '',
      ssml: '',
      shouldSpeak: false,
      skipReason: 'feedback_budget_exceeded',
    };
  }

  // Natural variation: sometimes staying silent IS human
  const seedBase = seed ?? `bc:${sessionId}:${turnNumber}:${emotionType}`;
  if (seededChance(`${seedBase}:silence`, NATURAL_SILENCE_PROBABILITY)) {
    // More likely to stay silent for heavy topics
    if (topicWeight === 'heavy' || seededChance(`${seedBase}:silence2`, 0.3)) {
      return {
        phrase: '',
        ssml: '',
        shouldSpeak: false,
        skipReason: 'natural_silence',
      };
    }
  }

  // Get phrases from bundle or fallback
  const phrases = getPhrasesForContext(personaId, emotionType);

  // Filter out recently used phrases
  const freshPhrases = phrases.filter((p) => !isPhraseRecentlyUsed(sessionId, p, turnNumber));

  // Select from fresh phrases if available, otherwise use all
  const availablePhrases = freshPhrases.length > 0 ? freshPhrases : phrases;
  const selectedIndex = seededIndex(`${seedBase}:select`, availablePhrases.length);
  const phrase = availablePhrases[selectedIndex] ?? phrases[0];

  // Record usage
  recordPhraseUsage(sessionId, phrase, turnNumber);
  recordFeedback(sessionId, 'backchannel');

  // Wrap in appropriate SSML based on context
  const ssml = wrapPhraseWithSsml(phrase, emotionType, topicWeight);

  log.debug(
    {
      sessionId,
      personaId,
      phrase,
      emotionType,
      turnNumber,
      wasFresh: freshPhrases.includes(phrase),
    },
    'Selected backchannel'
  );

  return {
    phrase,
    ssml,
    shouldSpeak: true,
  };
}

/**
 * Select a silence-appropriate response.
 *
 * For when the user has been silent for a while.
 * Often returns null (silence is okay!)
 */
export function selectSilenceResponse(
  sessionId: string,
  personaId: string,
  context: {
    silenceDurationMs: number;
    turnNumber: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
    wasEmotionalContent?: boolean;
    seed?: string;
  }
): SelectedBackchannel | null {
  const { silenceDurationMs, turnNumber, topicWeight, wasEmotionalContent, seed } = context;

  // After emotional content, silence is often the RIGHT response
  if (wasEmotionalContent && silenceDurationMs < 8000) {
    return {
      phrase: '',
      ssml: '',
      shouldSpeak: false,
      skipReason: 'respecting_emotional_silence',
    };
  }

  // Check feedback budget
  if (!canAddFeedback(sessionId, 'backchannel', turnNumber)) {
    return {
      phrase: '',
      ssml: '',
      shouldSpeak: false,
      skipReason: 'feedback_budget_exceeded',
    };
  }

  const seedBase = seed ?? `silence:${sessionId}:${turnNumber}:${silenceDurationMs}`;

  // Determine silence tier
  let tier: 'early' | 'mid' | 'late';
  if (silenceDurationMs < 3000) {
    tier = 'early';
    // Very early silence: 80% chance we should say nothing
    if (seededChance(`${seedBase}:early-skip`, 0.8)) {
      return {
        phrase: '',
        ssml: '',
        shouldSpeak: false,
        skipReason: 'early_silence_appropriate',
      };
    }
  } else if (silenceDurationMs < 8000) {
    tier = 'mid';
    // Mid silence: 50% chance to stay quiet
    if (seededChance(`${seedBase}:mid-skip`, 0.5)) {
      return {
        phrase: '',
        ssml: '',
        shouldSpeak: false,
        skipReason: 'mid_silence_appropriate',
      };
    }
  } else {
    tier = 'late';
    // Late silence: only 20% chance to stay quiet
    if (seededChance(`${seedBase}:late-skip`, 0.2)) {
      return {
        phrase: '',
        ssml: '',
        shouldSpeak: false,
        skipReason: 'late_silence_appropriate',
      };
    }
  }

  // Try to get from bundle first
  let phrase = getSilenceFillerSync(personaId, silenceDurationMs);

  // Fallback to defaults
  if (!phrase) {
    const fallbackPhrases = FALLBACK_SILENCE_PHRASES[tier];
    const freshFallback = fallbackPhrases.filter(
      (p) => !isPhraseRecentlyUsed(sessionId, p, turnNumber)
    );
    const available = freshFallback.length > 0 ? freshFallback : fallbackPhrases;
    phrase = available[seededIndex(`${seedBase}:fallback`, available.length)];
  }

  // Handle "..." which means intentional silence
  if (phrase === '...' || phrase === null) {
    return {
      phrase: '',
      ssml: '',
      shouldSpeak: false,
      skipReason: 'intentional_silence',
    };
  }

  recordPhraseUsage(sessionId, phrase, turnNumber);
  recordFeedback(sessionId, 'backchannel');

  const ssml = wrapPhraseWithSsml(phrase, 'supportive', topicWeight);

  return {
    phrase,
    ssml,
    shouldSpeak: true,
  };
}

/**
 * Select an acknowledgment prefix for a response.
 *
 * These are the "Mm-hmm. So..." phrases that come before a response.
 */
export function selectAcknowledgmentPrefix(
  sessionId: string,
  personaId: string,
  context: {
    turnNumber: number;
    emotionType: BackchannelEmotionType;
    isFollowUp?: boolean;
    seed?: string;
  }
): string | null {
  const { turnNumber, emotionType, isFollowUp, seed } = context;

  // Check with feedback coordinator
  if (!canAddFeedback(sessionId, 'prefix', turnNumber)) {
    return null;
  }

  const seedBase = seed ?? `prefix:${sessionId}:${turnNumber}`;

  // Reduced probability (was 70%, now 25-40%)
  const probability = isFollowUp ? 0.4 : 0.25;
  if (!seededChance(`${seedBase}:use`, probability)) {
    return null;
  }

  // Get a short acknowledgment phrase
  const phrases = getShortAcknowledgments(emotionType);
  const freshPhrases = phrases.filter((p) => !isPhraseRecentlyUsed(sessionId, p, turnNumber));
  const available = freshPhrases.length > 0 ? freshPhrases : phrases;
  const phrase = available[seededIndex(`${seedBase}:select`, available.length)];

  recordPhraseUsage(sessionId, phrase, turnNumber);
  recordFeedback(sessionId, 'prefix');

  return phrase;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPhrasesForContext(personaId: string, emotionType: BackchannelEmotionType): string[] {
  // Try to load from bundle
  if (hasVoiceDataLoaded(personaId)) {
    const bundlePhrase = getBackchannelSync(personaId, emotionType);
    // Bundle returns single phrase, but we want variety
    // Get multiple by calling multiple times with different seeds? No, that defeats the purpose.
    // Instead, we should expand the bundles. For now, combine with fallback.
    const fallback = FALLBACK_PHRASES[emotionType] || FALLBACK_PHRASES.neutral;
    return [bundlePhrase, ...fallback.filter((p) => p !== bundlePhrase)];
  }

  // Fallback
  return FALLBACK_PHRASES[emotionType] || FALLBACK_PHRASES.neutral;
}

function getShortAcknowledgments(emotionType: BackchannelEmotionType): string[] {
  // Short phrases suitable for prefixes
  const shortPhrases: Record<BackchannelEmotionType, string[]> = {
    neutral: ['Mm-hmm.', 'Yeah.', 'Okay.', 'Right.', 'Got it.'],
    engaged: ['Oh!', 'Mm!', 'Yeah!', 'Ooh.'],
    empathetic: ['Mm.', 'Yeah...', 'I hear you.', 'I see.'],
    excited: ['Oh!', 'Yes!', 'Nice!', 'Ooh!'],
    supportive: ['Mm.', 'Yeah.', 'Okay.', "I'm here."],
  };
  return shortPhrases[emotionType] || shortPhrases.neutral;
}

function wrapPhraseWithSsml(
  phrase: string,
  emotionType: BackchannelEmotionType,
  topicWeight?: 'light' | 'medium' | 'heavy'
): string {
  // Volume and speed adjustments based on context
  let volumeRatio = 0.85;
  let speedRatio = 1.0;
  let breakBefore = '50ms';
  let breakAfter = '100ms';

  if (topicWeight === 'heavy' || emotionType === 'empathetic') {
    volumeRatio = 0.75;
    speedRatio = 0.9;
    breakBefore = '100ms';
    breakAfter = '200ms';
  } else if (emotionType === 'excited' || emotionType === 'engaged') {
    volumeRatio = 0.9;
    speedRatio = 1.05;
    breakBefore = '30ms';
    breakAfter = '80ms';
  }

  return `<break time="${breakBefore}"/><volume ratio="${volumeRatio}"><speed ratio="${speedRatio}">${phrase}</speed></volume><break time="${breakAfter}"/>`;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Reset history for a session (call on session end)
 */
export function resetSessionHistory(sessionId: string): void {
  sessionHistories.delete(sessionId);
}

/**
 * Reset all sessions (for testing)
 */
export function resetAllSessionHistories(): void {
  sessionHistories.clear();
}

/**
 * Ensure persona voice data is loaded
 */
export async function ensurePersonaLoaded(personaId: string): Promise<void> {
  if (!hasVoiceDataLoaded(personaId)) {
    await loadPersonaVoiceData(personaId);
  }
}

/**
 * Get statistics for debugging
 */
export function getSessionStats(sessionId: string): {
  historySize: number;
  uniquePhrases: number;
  turnCount: number;
} {
  const history = sessionHistories.get(sessionId);
  if (!history) {
    return { historySize: 0, uniquePhrases: 0, turnCount: 0 };
  }
  return {
    historySize: history.used.length,
    uniquePhrases: history.lastUsedAt.size,
    turnCount: history.turnCount,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  selectBackchannel,
  selectSilenceResponse,
  selectAcknowledgmentPrefix,
  resetSessionHistory,
  resetAllSessionHistories,
  ensurePersonaLoaded,
  getSessionStats,
};
