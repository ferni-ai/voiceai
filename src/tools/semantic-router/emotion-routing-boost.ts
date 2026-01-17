/**
 * Emotion-Aware Routing Boost
 *
 * Applies confidence boosts to tools based on detected voice emotion.
 * When user sounds angry, boost conflict resolution tools.
 * When user sounds sad, boost grief/support tools.
 *
 * @module tools/semantic-router/emotion-routing-boost
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionRoutingBoost' });

// ============================================================================
// LOCAL TYPES (to avoid coupling to main router types)
// ============================================================================

interface ScoredToolMatch {
  toolId: string;
  score: number;
  domain?: string;
  category?: string;
}

// ============================================================================
// EMOTION → DOMAIN MAPPING
// ============================================================================

/**
 * Maps detected emotions to domains that should be boosted.
 * Boost values are added to tool confidence scores.
 */
export const EMOTION_DOMAIN_BOOST: Record<string, { domains: string[]; boost: number }> = {
  // Anger family
  angry: {
    domains: ['anger', 'conflict', 'resentment', 'boundaries', 'communication'],
    boost: 0.15,
  },
  frustrated: {
    domains: ['anger', 'stress', 'communication', 'problem-solving'],
    boost: 0.12,
  },
  irritated: {
    domains: ['anger', 'stress', 'boundaries', 'self-care'],
    boost: 0.1,
  },

  // Sadness family
  sad: {
    domains: ['grief', 'depression', 'loss', 'breakup-recovery', 'emotional-support'],
    boost: 0.15,
  },
  grieving: {
    domains: ['grief', 'loss', 'mourning', 'support'],
    boost: 0.2,
  },
  lonely: {
    domains: ['loneliness', 'relationships', 'connection', 'social'],
    boost: 0.15,
  },
  heartbroken: {
    domains: ['breakup-recovery', 'grief', 'loss', 'healing'],
    boost: 0.18,
  },

  // Anxiety family
  anxious: {
    domains: ['anxiety', 'worry', 'stress', 'panic', 'grounding'],
    boost: 0.15,
  },
  worried: {
    domains: ['anxiety', 'worry', 'future-planning', 'reassurance'],
    boost: 0.12,
  },
  nervous: {
    domains: ['anxiety', 'confidence', 'preparation', 'grounding'],
    boost: 0.1,
  },
  panicked: {
    domains: ['panic', 'anxiety', 'crisis', 'grounding', 'breathing'],
    boost: 0.25,
  },

  // Fear family
  fearful: {
    domains: ['fear', 'anxiety', 'safety', 'support'],
    boost: 0.15,
  },
  scared: {
    domains: ['fear', 'safety', 'support', 'grounding'],
    boost: 0.15,
  },
  terrified: {
    domains: ['crisis', 'fear', 'safety', 'emergency'],
    boost: 0.25,
  },

  // Overwhelm family
  overwhelmed: {
    domains: ['burnout', 'capacity', 'sandwich-generation', 'stress', 'prioritization'],
    boost: 0.2,
  },
  exhausted: {
    domains: ['burnout', 'capacity', 'sleep', 'new-parent', 'self-care', 'rest'],
    boost: 0.18,
  },
  stressed: {
    domains: ['stress', 'burnout', 'time-management', 'self-care'],
    boost: 0.15,
  },

  // Hopelessness family (HIGH PRIORITY)
  hopeless: {
    domains: ['depression', 'crisis', 'hope', 'meaning', 'support'],
    boost: 0.25,
  },
  desperate: {
    domains: ['crisis', 'emergency', 'support', 'hope'],
    boost: 0.25,
  },
  defeated: {
    domains: ['depression', 'motivation', 'resilience', 'hope'],
    boost: 0.18,
  },

  // Shame/guilt family
  ashamed: {
    domains: ['shame', 'guilt', 'self-esteem', 'self-compassion', 'healing'],
    boost: 0.2,
  },
  guilty: {
    domains: ['guilt', 'shame', 'forgiveness', 'self-compassion'],
    boost: 0.15,
  },
  embarrassed: {
    domains: ['shame', 'self-esteem', 'social-anxiety', 'recovery'],
    boost: 0.12,
  },

  // Envy/jealousy family
  jealous: {
    domains: ['envy', 'relationships', 'comparison', 'self-worth'],
    boost: 0.15,
  },
  envious: {
    domains: ['envy', 'comparison', 'gratitude', 'self-worth'],
    boost: 0.15,
  },
  resentful: {
    domains: ['resentment', 'forgiveness', 'boundaries', 'healing'],
    boost: 0.18,
  },

  // Positive emotions (boost relevant growth tools)
  happy: {
    domains: ['celebration', 'gratitude', 'growth', 'momentum'],
    boost: 0.08,
  },
  excited: {
    domains: ['planning', 'goals', 'celebration', 'momentum'],
    boost: 0.08,
  },
  hopeful: {
    domains: ['goals', 'planning', 'vision', 'growth'],
    boost: 0.1,
  },
  grateful: {
    domains: ['gratitude', 'reflection', 'relationships', 'mindfulness'],
    boost: 0.08,
  },
  peaceful: {
    domains: ['mindfulness', 'meditation', 'reflection', 'wellness'],
    boost: 0.08,
  },

  // Life stage emotions
  lost: {
    domains: ['identity', 'purpose', 'career', 'life-transition', 'meaning'],
    boost: 0.15,
  },
  stuck: {
    domains: ['motivation', 'change', 'breakthrough', 'perspective'],
    boost: 0.15,
  },
  confused: {
    domains: ['clarity', 'decision-making', 'guidance', 'perspective'],
    boost: 0.12,
  },
};

// ============================================================================
// BOOST FUNCTIONS
// ============================================================================

export interface EmotionContext {
  primary: string;
  secondary?: string;
  intensity?: number; // 0-1
  confidence?: number; // 0-1
}

/**
 * Apply emotion-based boosts to tool matches
 */
export function applyEmotionBoosts<T extends ScoredToolMatch>(
  matches: T[],
  emotion: EmotionContext
): T[] {
  const boostConfig = EMOTION_DOMAIN_BOOST[emotion.primary.toLowerCase()];

  if (!boostConfig) {
    return matches;
  }

  // Scale boost by emotion intensity if provided
  const intensityMultiplier = emotion.intensity ?? 1.0;
  const effectiveBoost = boostConfig.boost * intensityMultiplier;

  let boostedCount = 0;

  for (const match of matches) {
    const toolDomain = match.domain?.toLowerCase();
    const toolCategory = match.category?.toLowerCase();

    // Check if tool's domain matches any boosted domain
    const shouldBoost = boostConfig.domains.some(
      (domain) =>
        toolDomain?.includes(domain) ||
        toolCategory?.includes(domain) ||
        match.toolId.toLowerCase().includes(domain)
    );

    if (shouldBoost) {
      match.score += effectiveBoost;
      boostedCount++;

      log.debug(
        {
          toolId: match.toolId,
          emotion: emotion.primary,
          boost: effectiveBoost,
          newScore: match.score,
        },
        '🎭 Emotion boost applied'
      );
    }
  }

  // Re-sort by boosted scores if any were boosted
  if (boostedCount > 0) {
    matches.sort((a, b) => b.score - a.score);

    log.debug(
      {
        emotion: emotion.primary,
        boostedCount,
        topMatch: matches[0]?.toolId,
      },
      '🎭 Emotion routing complete'
    );
  }

  return matches;
}

/**
 * Get domains that should be boosted for an emotion
 */
export function getEmotionDomains(emotion: string): string[] {
  return EMOTION_DOMAIN_BOOST[emotion.toLowerCase()]?.domains ?? [];
}

/**
 * Get boost amount for an emotion
 */
export function getEmotionBoostAmount(emotion: string): number {
  return EMOTION_DOMAIN_BOOST[emotion.toLowerCase()]?.boost ?? 0;
}

/**
 * Check if an emotion warrants special handling
 */
export function isHighPriorityEmotion(emotion: string): boolean {
  const highPriority = ['hopeless', 'desperate', 'terrified', 'panicked', 'suicidal'];
  return highPriority.includes(emotion.toLowerCase());
}

// ============================================================================
// SECONDARY EMOTION HANDLING
// ============================================================================

/**
 * Apply boosts for both primary and secondary emotions
 */
export function applyMultiEmotionBoosts<T extends ScoredToolMatch>(
  matches: T[],
  emotions: EmotionContext[]
): T[] {
  let result = matches;

  for (const emotion of emotions) {
    result = applyEmotionBoosts(result, emotion);
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EMOTION_DOMAIN_BOOST,
  applyEmotionBoosts,
  applyMultiEmotionBoosts,
  getEmotionDomains,
  getEmotionBoostAmount,
  isHighPriorityEmotion,
};
