/**
 * Phrase Selection
 *
 * Celebration phrases, signature catchphrases,
 * session opening anticipation, and continuity markers.
 *
 * @module speech/humanization/behavior-loader/phrases
 */

import type {
  BehaviorSelectionContext,
  SelectedBehavior,
} from '../types.js';

import { getSpeechProfileSync, getRandomPhrase } from './profile-loader.js';

// =============================================================================
// CELEBRATION SELECTION
// =============================================================================

export type CelebrationIntensity =
  | 'small'
  | 'big'
  | 'growth'
  | 'effort'
  | 'quiet'
  | 'courage'
  | 'consistency';

/**
 * Detect what type of celebration is appropriate
 */
export function detectCelebrationIntensity(userText: string): CelebrationIntensity | null {
  const lowerText = userText.toLowerCase();

  // Big milestones
  if (/\b(promoted|graduated|married|engaged|hired|closed|launched|published)\b/i.test(lowerText)) {
    return 'big';
  }

  // Courage moments
  if (/\b(finally|first time|scared|nervous|hard conversation|set a boundary)\b/i.test(lowerText)) {
    return 'courage';
  }

  // Consistency
  if (/\d+\s*(days?|weeks?)\s*(straight|in a row|streak)/i.test(lowerText)) {
    return 'consistency';
  }

  // Growth acknowledgment
  if (/\b(changed|different|grown|used to|before I|now I)\b/i.test(lowerText)) {
    return 'growth';
  }

  // Effort over outcome
  if (/\b(tried|attempted|didn't work|failed but)\b/i.test(lowerText)) {
    return 'effort';
  }

  // Small wins
  if (/\b(managed to|even though|didn't want to|pushed myself)\b/i.test(lowerText)) {
    return 'small';
  }

  return null;
}

/**
 * Select a celebration phrase based on intensity
 */
export function selectCelebration(
  personaId: string,
  intensity: CelebrationIntensity,
  seed?: string
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.celebrations) {
    return null;
  }

  const celebrations = profile.celebrations;
  let phrases: string[] = [];

  switch (intensity) {
    case 'small':
      phrases = celebrations.small_wins || [];
      break;
    case 'big':
      phrases = celebrations.big_milestones || [];
      break;
    case 'growth':
      phrases = celebrations.growth_acknowledgment || [];
      break;
    case 'effort':
      phrases = celebrations.effort_over_outcome || [];
      break;
    case 'quiet':
      phrases = celebrations.quiet_celebrations || [];
      break;
    case 'courage':
      phrases = celebrations.celebrating_courage || [];
      break;
    case 'consistency':
      phrases = celebrations.celebrating_consistency || [];
      break;
  }

  const phrase = getRandomPhrase(phrases, seed);
  if (!phrase) return null;

  return {
    phrase,
    category: `celebration_${intensity}`,
    position: 'prefix',
    confidence: 0.85,
    metadata: {
      source: 'breath-sounds',
      personaId,
      contextMatch: [intensity],
    },
  };
}

/**
 * Sync version of celebration selection
 */
export function selectCelebrationSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  if (!context.userText) return null;

  const intensity = detectCelebrationIntensity(context.userText);
  if (!intensity) return null;

  const baseProbability = intensity === 'big' || intensity === 'courage' ? 0.6 : 0.4;
  if (Math.random() > baseProbability) return null;

  return selectCelebration(personaId, intensity, context.randomSeed);
}

// =============================================================================
// CATCHPHRASE SELECTION
// =============================================================================

/**
 * Catchphrase trigger patterns
 */
export const CATCHPHRASE_TRIGGERS: Record<string, RegExp[]> = {
  failure: [
    /\b(failed|failure|fell apart|broke|broken|messed up|screwed up)\b/i,
    /\b(wasn't good enough|let.*down|disappointed)\b/i,
  ],
  vulnerability: [
    /\b(vulnerable|scared|afraid|weak|don't know what to do)\b/i,
    /\b(hard to admit|never told|first time saying)\b/i,
  ],
  money_comparison: [
    /\b(not.*successful|behind|peers|net worth|making.*less)\b/i,
    /\b(comparing|feel like a failure|not enough)\b/i,
  ],
  redemption: [
    /\b(second chance|start over|try again|fresh start|new beginning)\b/i,
    /\b(forgive|forgiveness|redemption|another shot)\b/i,
  ],
};

/**
 * Select a signature catchphrase based on context
 * RARE - should only fire on perfect trigger moments
 */
export function selectCatchphrase(
  personaId: string,
  userText: string,
  conversationCount: number,
  usedThisSession = new Set<string>()
): { phrase: string; delivery: string; id: string } | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases) {
    return null;
  }

  const { core_signature, secondary_signatures } = profile.catchphrases;
  const lowerText = userText.toLowerCase();

  // Check for core signature triggers (VERY rare - once per 3-4 conversations)
  if (core_signature && conversationCount % 4 === 0 && !usedThisSession.has('core')) {
    for (const triggerKey of core_signature.triggers) {
      const patterns = CATCHPHRASE_TRIGGERS[triggerKey] || [new RegExp(triggerKey, 'i')];
      for (const pattern of patterns) {
        if (pattern.test(lowerText)) {
          if (Math.random() < 0.3) {
            return {
              phrase: core_signature.phrase,
              delivery: core_signature.delivery,
              id: 'core',
            };
          }
        }
      }
    }
  }

  // Check secondary signatures (once per conversation max)
  if (secondary_signatures?.phrases) {
    for (const sig of secondary_signatures.phrases) {
      if (usedThisSession.has(sig.phrase)) continue;

      for (const triggerKey of sig.triggers) {
        const patterns = CATCHPHRASE_TRIGGERS[triggerKey] || [new RegExp(triggerKey, 'i')];
        for (const pattern of patterns) {
          if (pattern.test(lowerText)) {
            if (Math.random() < 0.25) {
              return {
                phrase: sig.phrase,
                delivery: sig.delivery,
                id: sig.phrase,
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get a powerful question from the persona (more freely used)
 */
export function getPowerfulQuestion(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases?.powerful_questions?.deep_questions) {
    return null;
  }

  return getRandomPhrase(profile.catchphrases.powerful_questions.deep_questions, seed);
}

/**
 * Get a partnership phrase from the persona
 */
export function getPartnershipPhrase(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.catchphrases?.partnership_phrases?.phrases) {
    return null;
  }

  return getRandomPhrase(profile.catchphrases.partnership_phrases.phrases, seed);
}

// =============================================================================
// ANTICIPATION SELECTION
// =============================================================================

export type AnticipationType =
  | 'opening_warmth'
  | 'between_sessions'
  | 'returning_after_time'
  | 'topic_callback'
  | 'future_looking'
  | 'growth_reference'
  | 'journey_acknowledgment';

/**
 * Get an opening anticipation phrase for a returning user
 */
export function getSessionOpeningPhrase(
  personaId: string,
  context: {
    daysSinceLastSession?: number;
    isFirstSession?: boolean;
  } = {},
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation || context.isFirstSession) {
    return null;
  }

  const { session_anticipation, usage_rules } = profile.anticipation;

  const probability = usage_rules?.opening_anticipation_probability ?? 0.4;
  if (Math.random() > probability) {
    return null;
  }

  if (context.daysSinceLastSession && context.daysSinceLastSession > 3) {
    return getRandomPhrase(session_anticipation.returning_after_time, seed);
  }

  return getRandomPhrase(session_anticipation.opening_warmth, seed);
}

/**
 * Get a topic callback phrase with {topic} placeholder
 */
export function getTopicCallbackPhrase(personaId: string, seed?: string): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.looking_forward_to_topic) {
    return null;
  }

  const probability = profile.anticipation.usage_rules?.topic_callback_probability ?? 0.35;
  if (Math.random() > probability) {
    return null;
  }

  return getRandomPhrase(profile.anticipation.looking_forward_to_topic, seed);
}

/**
 * Get a future-looking phrase (curiosity, seeds, or hope)
 */
export function getFutureLookingPhrase(
  personaId: string,
  type: 'curiosity' | 'seeds' | 'hope' = 'curiosity',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.future_looking) {
    return null;
  }

  const probability = profile.anticipation.usage_rules?.future_looking_probability ?? 0.3;
  if (Math.random() > probability) {
    return null;
  }

  const { future_looking } = profile.anticipation;

  switch (type) {
    case 'seeds':
      return getRandomPhrase(future_looking.planting_seeds, seed);
    case 'hope':
      return getRandomPhrase(future_looking.expressing_hope, seed);
    default:
      return getRandomPhrase(future_looking.curiosity_about_outcome, seed);
  }
}

/**
 * Get a continuity marker phrase (growth reference or journey acknowledgment)
 */
export function getContinuityMarker(
  personaId: string,
  type: 'growth' | 'journey' = 'growth',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.continuity_markers) {
    return null;
  }

  const { continuity_markers } = profile.anticipation;

  switch (type) {
    case 'journey':
      return getRandomPhrase(continuity_markers.acknowledging_journey, seed);
    default:
      return getRandomPhrase(continuity_markers.referencing_growth, seed);
  }
}

/**
 * Get a pending item follow-up phrase with placeholder
 */
export function getPendingItemPhrase(
  personaId: string,
  type: 'goal' | 'person' | 'decision' = 'goal',
  seed?: string
): string | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.anticipation?.pending_items) {
    return null;
  }

  const { pending_items } = profile.anticipation;

  switch (type) {
    case 'person':
      return getRandomPhrase(pending_items.person_mentioned, seed);
    case 'decision':
      return getRandomPhrase(pending_items.decision_pending, seed);
    default:
      return getRandomPhrase(pending_items.goal_tracking, seed);
  }
}
