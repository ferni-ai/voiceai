/**
 * Key Moment Detection Module
 *
 * Detects significant moments in conversations that should be remembered:
 * - Shared vulnerability
 * - Breakthroughs
 * - Decisions
 * - Celebrations
 * - Concerns
 *
 * @module user-learning-engine/key-moments
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { KeyMoment } from '../../types/user-profile.js';
import type { EmotionResult } from '../detectors/emotion.js';
import type { IntentResult } from '../detectors/intent.js';
import type { ConversationState } from '../state/conversation.js';

const log = getLogger();

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Shared vulnerability patterns */
const VULNERABILITY_PATTERNS = [
  /i('m| am) (scared|afraid|terrified|worried sick)/i,
  /i('ve| have) never told anyone/i,
  /this is hard (to|for me to) (admit|say|talk about)/i,
  /i feel so (alone|lost|overwhelmed|helpless)/i,
  /my (father|mother|dad|mom|parent) (died|passed|left)/i,
  /i lost (my job|everything|my savings)/i,
];

/** Breakthrough patterns */
const BREAKTHROUGH_PATTERNS = [
  /i (finally |just )?(understand|get it|realized|see)/i,
  /that makes (so much |a lot of )?sense/i,
  /i('ve| have) been (doing|thinking about) (this|it) (all )?wrong/i,
  /why didn'?t (i|anyone) (see|tell me) this before/i,
  /this (changes|changed) everything/i,
];

/** Decision patterns */
const DECISION_PATTERNS = [
  /i('ve| have) decided to/i,
  /i('m| am) going to/i,
  /from now on,? i('ll| will)/i,
  /i('m| am) (finally |ready to )?(ready|committed) to/i,
  /that'?s it,? i('m| am)/i,
];

/** Celebration patterns */
const CELEBRATION_PATTERNS = [
  /i (finally |just )?(paid off|hit|reached|achieved)/i,
  /we (finally |just )?(did it|made it|got there)/i,
  /i can'?t believe (i|we) (actually|finally)/i,
  /this is (amazing|incredible|the best)/i,
];

/** Concern patterns */
const CONCERN_PATTERNS = [
  /i('m| am) (really |very )?(worried|concerned|anxious) (about|that)/i,
  /what (if|happens if) (the market|i lose|we can'?t)/i,
  /i don'?t (know|think) (if|whether) (i|we) can/i,
  /this (keeps|is keeping) me (up|awake) at night/i,
];

// ============================================================================
// DETECTION LOGIC
// ============================================================================

/**
 * Detect if current turn contains a key moment worth remembering
 */
export function detectKeyMoment(
  message: string,
  analysis: {
    emotion: EmotionResult;
    intent: IntentResult;
    state: ConversationState;
  },
  topicsDiscussed: string[]
): KeyMoment | null {
  const messageLower = message.toLowerCase();

  // Check patterns and create key moment
  let type: KeyMoment['type'] | null = null;
  let emotionalWeight: KeyMoment['emotionalWeight'] = 'medium';

  for (const pattern of VULNERABILITY_PATTERNS) {
    if (pattern.test(messageLower)) {
      type = 'shared_vulnerability';
      emotionalWeight = 'heavy';
      break;
    }
  }

  if (!type) {
    for (const pattern of BREAKTHROUGH_PATTERNS) {
      if (pattern.test(messageLower)) {
        type = 'breakthrough';
        emotionalWeight = 'medium';
        break;
      }
    }
  }

  if (!type) {
    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(messageLower)) {
        type = 'decision';
        emotionalWeight = 'medium';
        break;
      }
    }
  }

  if (!type) {
    for (const pattern of CELEBRATION_PATTERNS) {
      if (pattern.test(messageLower)) {
        type = 'celebration';
        emotionalWeight = 'light';
        break;
      }
    }
  }

  if (!type) {
    for (const pattern of CONCERN_PATTERNS) {
      if (pattern.test(messageLower)) {
        type = 'concern';
        emotionalWeight = analysis.emotion.distressLevel > 0.6 ? 'heavy' : 'medium';
        break;
      }
    }
  }

  // High distress without pattern match = concern
  if (!type && analysis.emotion.distressLevel > 0.7) {
    type = 'concern';
    emotionalWeight = 'heavy';
  }

  if (!type) return null;

  // Generate summary
  const summary = generateMomentSummary(message, type);

  return {
    id: `km_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    type,
    summary,
    emotionalWeight,
    topics: [...topicsDiscussed],
    followUpNeeded: type === 'concern' || type === 'shared_vulnerability',
    followUpDate: type === 'concern' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined, // 1 week
  };
}

/**
 * Generate a natural summary of a key moment
 */
export function generateMomentSummary(message: string, type: KeyMoment['type']): string {
  // Extract the core of the message (first 2 sentences, max 150 chars)
  const sentences = message.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  let core = sentences.slice(0, 2).join('. ').trim();
  if (core.length > 150) {
    core = `${core.slice(0, 147)}...`;
  }

  // Add context based on type
  const prefixes: Record<KeyMoment['type'], string> = {
    shared_vulnerability: 'Opened up about',
    breakthrough: 'Had a breakthrough:',
    milestone: 'Reached a milestone:',
    concern: 'Expressed concern about',
    celebration: 'Celebrated',
    decision: 'Made a decision to',
  };

  return `${prefixes[type]} "${core}"`;
}

/**
 * Capture a key moment and add to session
 */
export function captureKeyMoment(
  moments: KeyMoment[],
  message: string,
  analysis: {
    emotion: EmotionResult;
    intent: IntentResult;
    state: ConversationState;
  },
  topicsDiscussed: string[]
): KeyMoment | null {
  const keyMoment = detectKeyMoment(message, analysis, topicsDiscussed);

  if (keyMoment) {
    moments.push(keyMoment);
    log.info({ type: keyMoment.type, summary: keyMoment.summary }, 'Captured key moment');
  }

  return keyMoment;
}
