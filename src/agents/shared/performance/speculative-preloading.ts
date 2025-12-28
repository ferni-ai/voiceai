/**
 * Speculative Persona Preloading
 *
 * Predicts handoff before user requests it based on conversation patterns.
 * When high-confidence prediction is detected, preloads the target persona's
 * context in the background, saving ~1-2s on handoff.
 *
 * Part of "Better than Human" - appearing to read the user's mind.
 *
 * @module agents/shared/performance/speculative-preloading
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  preloadPersonaInsights,
  type PersonaInsights,
} from '../../../intelligence/context-builders/persona-insights-cache.js';
import { preloadAllBundles } from '../../../personas/bundles/preloader.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId =
  | 'ferni'
  | 'peter-john'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'nayan-patel';

export interface HandoffPrediction {
  /** Predicted target persona */
  targetPersona: PersonaId;
  /** Confidence score 0-1 */
  confidence: number;
  /** Reason for prediction */
  reason: string;
  /** Topics that triggered this prediction */
  matchedTopics: string[];
}

export interface SpeculativePreloadContext {
  sessionId: string;
  userId: string;
  currentPersona: string;
  /** Function to build persona insights */
  buildInsightsFn: (personaId: string) => Promise<PersonaInsights>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const PRELOAD_CONFIG = {
  /** Minimum confidence to trigger preload (0-1) */
  CONFIDENCE_THRESHOLD: 0.6,

  /** How often to run prediction (debounce) */
  DEBOUNCE_MS: 1000,

  /** Topic matches needed for high confidence */
  HIGH_CONFIDENCE_MATCHES: 2,

  /** Topic matches needed for medium confidence */
  MEDIUM_CONFIDENCE_MATCHES: 1,
} as const;

// ============================================================================
// PERSONA TOPIC MAPPINGS
// ============================================================================

/**
 * Maps topics/keywords to personas.
 * These are derived from persona specialties and common user intents.
 */
const PERSONA_TOPICS: Record<PersonaId, { keywords: string[]; domains: string[] }> = {
  'peter-john': {
    keywords: [
      'stock',
      'stocks',
      'invest',
      'investing',
      'investment',
      'portfolio',
      'market',
      'trading',
      'dividend',
      'earnings',
      'pe ratio',
      'valuation',
      'buy',
      'sell',
      'shares',
      'ticker',
      'nasdaq',
      'dow',
      'sp500',
      's&p',
      'growth stock',
      'value investing',
      'fundamental analysis',
    ],
    domains: ['finance', 'investing', 'research'],
  },
  'alex-chen': {
    keywords: [
      'email',
      'emails',
      'schedule',
      'calendar',
      'meeting',
      'appointment',
      'send',
      'reply',
      'message',
      'inbox',
      'communication',
      'call',
      'reschedule',
      'cancel',
      'reminder',
      'contacts',
      'agenda',
      'time management',
      'productivity',
      'organize',
    ],
    domains: ['communication', 'calendar', 'productivity'],
  },
  'maya-santos': {
    keywords: [
      'budget',
      'spending',
      'saving',
      'savings',
      'money',
      'expense',
      'habit',
      'habits',
      'routine',
      'track',
      'tracking',
      'goal',
      'streak',
      'daily',
      'weekly',
      'progress',
      'accountability',
      'financial health',
      'debt',
      'credit',
    ],
    domains: ['habits', 'finance', 'wellness'],
  },
  'jordan-taylor': {
    keywords: [
      'vacation',
      'trip',
      'travel',
      'purchase',
      'buy',
      'car',
      'house',
      'wedding',
      'baby',
      'milestone',
      'plan',
      'planning',
      'event',
      'birthday',
      'anniversary',
      'celebration',
      'big decision',
      'life event',
      'retirement',
    ],
    domains: ['life-planning', 'events', 'milestones'],
  },
  'nayan-patel': {
    keywords: [
      'wisdom',
      'philosophy',
      'meaning',
      'purpose',
      'meditation',
      'mindfulness',
      'spiritual',
      'reflect',
      'reflection',
      'existential',
      'values',
      'principles',
      'legacy',
      'life',
      'death',
      'mortality',
      'gratitude',
      'perspective',
      'inner peace',
    ],
    domains: ['wisdom', 'philosophy', 'meaning'],
  },
  ferni: {
    keywords: [
      'coach',
      'coaching',
      'help',
      'support',
      'feeling',
      'emotion',
      'talk',
      'listen',
      'understand',
      'team',
      'handoff',
      'back',
      'overwhelmed',
      'stressed',
      'anxious',
      'sad',
    ],
    domains: ['coaching', 'wellbeing', 'coordination'],
  },
};

// ============================================================================
// PREDICTION STATE
// ============================================================================

// Track recent predictions to avoid duplicate preloads
const recentPredictions = new Map<string, { persona: PersonaId; timestamp: number }>();

// Track pending preloads to avoid duplicates
const pendingPreloads = new Set<string>();

// Debounce timers per session
const debounceTimers = new Map<string, NodeJS.Timeout>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Analyze conversation text and predict likely handoff target.
 * Returns prediction with confidence score.
 *
 * @param text - User's message or recent conversation
 * @param currentPersona - Currently active persona (to exclude from predictions)
 */
export function predictHandoff(text: string, currentPersona: string): HandoffPrediction | null {
  const lowerText = text.toLowerCase();
  const currentCanonical = normalizePersonaId(currentPersona);

  let bestMatch: HandoffPrediction | null = null;
  let bestScore = 0;

  for (const [personaId, topics] of Object.entries(PERSONA_TOPICS)) {
    // Skip current persona
    if (personaId === currentCanonical) {
      continue;
    }

    const matchedKeywords: string[] = [];

    // Check keyword matches
    for (const keyword of topics.keywords) {
      if (lowerText.includes(keyword)) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on matches
      const confidence = calculateConfidence(matchedKeywords.length, lowerText);

      if (confidence > bestScore) {
        bestScore = confidence;
        bestMatch = {
          targetPersona: personaId as PersonaId,
          confidence,
          reason: `Detected ${matchedKeywords.length} topic match(es) for ${personaId}`,
          matchedTopics: matchedKeywords,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Analyze text and trigger speculative preload if high-confidence prediction.
 * This is the main entry point - call this on each user message.
 *
 * @param text - User's message
 * @param context - Session context with preload function
 */
export function analyzeAndPreload(text: string, context: SpeculativePreloadContext): void {
  const { sessionId, currentPersona } = context;

  // Debounce to avoid excessive predictions
  const existingTimer = debounceTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  debounceTimers.set(
    sessionId,
    setTimeout(() => {
      debounceTimers.delete(sessionId);
      doAnalyzeAndPreload(text, context);
    }, PRELOAD_CONFIG.DEBOUNCE_MS)
  );
}

/**
 * Force immediate analysis without debounce.
 * Use for high-signal events like wake word near-matches.
 */
export function analyzeAndPreloadImmediate(text: string, context: SpeculativePreloadContext): void {
  doAnalyzeAndPreload(text, context);
}

/**
 * Clear speculative preload state for a session.
 * Call on session cleanup.
 */
export function clearSpeculativeState(sessionId: string): void {
  recentPredictions.delete(sessionId);
  pendingPreloads.delete(sessionId);

  const timer = debounceTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(sessionId);
  }

  log.debug({ sessionId }, 'Speculative preload state cleared');
}

/**
 * Get recent prediction for a session.
 * Useful for debugging and metrics.
 */
export function getRecentPrediction(
  sessionId: string
): { persona: PersonaId; timestamp: number } | null {
  return recentPredictions.get(sessionId) || null;
}

/**
 * Initialize speculative preloading system.
 * Call during application startup.
 */
export async function initializeSpeculativePreloading(): Promise<void> {
  // Ensure all persona bundles are preloaded
  await preloadAllBundles();
  log.info('Speculative preloading system initialized');
}

// ============================================================================
// INTERNAL
// ============================================================================

/**
 * Calculate confidence score from match count and context
 */
function calculateConfidence(matchCount: number, text: string): number {
  // Base confidence from match count
  let confidence = 0;

  if (matchCount >= PRELOAD_CONFIG.HIGH_CONFIDENCE_MATCHES) {
    confidence = 0.8;
  } else if (matchCount >= PRELOAD_CONFIG.MEDIUM_CONFIDENCE_MATCHES) {
    confidence = 0.5;
  }

  // Boost for explicit intent signals
  const intentSignals = [
    'can you help',
    'i need',
    'let me talk',
    'can i talk',
    'i want to',
    "let's talk about",
    'tell me about',
  ];

  for (const signal of intentSignals) {
    if (text.includes(signal)) {
      confidence += 0.1;
      break;
    }
  }

  // Boost for question patterns
  if (text.includes('?')) {
    confidence += 0.05;
  }

  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

/**
 * Normalize persona ID to canonical form
 */
function normalizePersonaId(personaId: string): string {
  const mapping: Record<string, PersonaId> = {
    peter: 'peter-john',
    alex: 'alex-chen',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    nayan: 'nayan-patel',
    'jack-b': 'ferni',
    coach: 'ferni',
  };

  return mapping[personaId.toLowerCase()] || personaId;
}

/**
 * Internal implementation of analyze and preload
 */
function doAnalyzeAndPreload(text: string, context: SpeculativePreloadContext): void {
  const { sessionId, userId, currentPersona, buildInsightsFn } = context;

  const prediction = predictHandoff(text, currentPersona);

  if (!prediction) {
    return;
  }

  // Check if confidence meets threshold
  if (prediction.confidence < PRELOAD_CONFIG.CONFIDENCE_THRESHOLD) {
    log.debug(
      {
        sessionId,
        target: prediction.targetPersona,
        confidence: prediction.confidence,
        threshold: PRELOAD_CONFIG.CONFIDENCE_THRESHOLD,
      },
      'Prediction below threshold, skipping preload'
    );
    return;
  }

  // Check if we recently predicted the same persona
  const recent = recentPredictions.get(sessionId);
  if (recent && recent.persona === prediction.targetPersona) {
    const ageMs = Date.now() - recent.timestamp;
    if (ageMs < 30000) {
      // Within 30 seconds
      log.debug({ sessionId, target: prediction.targetPersona }, 'Skipping duplicate prediction');
      return;
    }
  }

  // Update recent prediction
  recentPredictions.set(sessionId, {
    persona: prediction.targetPersona,
    timestamp: Date.now(),
  });

  // Check if preload already pending
  const preloadKey = `${sessionId}:${prediction.targetPersona}`;
  if (pendingPreloads.has(preloadKey)) {
    return;
  }

  // Trigger background preload
  log.info(
    {
      sessionId,
      currentPersona,
      targetPersona: prediction.targetPersona,
      confidence: prediction.confidence,
      matchedTopics: prediction.matchedTopics,
    },
    'Speculative preload triggered'
  );

  pendingPreloads.add(preloadKey);

  // Fire and forget - don't block on preload
  preloadPersonaInsights(sessionId, prediction.targetPersona, userId, async () => {
    return buildInsightsFn(prediction.targetPersona);
  })
    .then(() => {
      log.debug({ sessionId, target: prediction.targetPersona }, 'Speculative preload complete');
    })
    .catch((error) => {
      log.warn(
        { error: String(error), sessionId, target: prediction.targetPersona },
        'Speculative preload failed'
      );
    })
    .finally(() => {
      pendingPreloads.delete(preloadKey);
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  predictHandoff,
  analyzeAndPreload,
  analyzeAndPreloadImmediate,
  clearSpeculativeState,
  getRecentPrediction,
  initializeSpeculativePreloading,
};
