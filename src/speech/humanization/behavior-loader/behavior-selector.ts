/**
 * Behavior Selection Functions
 *
 * All select*() functions for choosing speech behaviors
 * (imperfections, thinking sounds, backchannels, breath sounds,
 * laughter responses) based on persona and context.
 *
 * @module speech/humanization/behavior-loader/behavior-selector
 */

import type {
  SpeechImperfectionsSchema,
  ThinkingSoundsSchema,
  BackchannelsSchema,
  BreathSoundsSchema,
  ImperfectionCategory,
  BehaviorSelectionContext,
  SelectedBehavior,
} from '../types.js';

import {
  loadSpeechProfile,
  getSpeechProfileSync,
  getRandomPhrase,
  matchesContext,
} from './profile-loader.js';

// =============================================================================
// IMPERFECTION SELECTION
// =============================================================================

/**
 * Select an imperfection phrase based on context
 */
export async function selectImperfection(
  personaId: string,
  category: ImperfectionCategory,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.imperfections) {
    return null;
  }

  // Get phrases for the category
  const phrases = profile.imperfections[category as keyof SpeechImperfectionsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  // Check context match
  const { matches, boost } = matchesContext(profile.imperfections.usage_rules, context);
  if (!matches) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    category,
    position: getPositionForCategory(category),
    confidence: 0.7 + boost,
    metadata: {
      source: 'speech-imperfections',
      personaId,
      contextMatch: [],
    },
  };
}

/**
 * Select an imperfection synchronously (uses cached profile)
 */
export function selectImperfectionSync(
  personaId: string,
  category: ImperfectionCategory,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.imperfections) {
    return null;
  }

  const phrases = profile.imperfections[category as keyof SpeechImperfectionsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const { matches, boost } = matchesContext(profile.imperfections.usage_rules, context);
  if (!matches) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) {
    return null;
  }

  return {
    phrase,
    category,
    position: getPositionForCategory(category),
    confidence: 0.7 + boost,
    metadata: {
      source: 'speech-imperfections',
      personaId,
      contextMatch: [],
    },
  };
}

// =============================================================================
// THINKING SOUND SELECTION
// =============================================================================

/**
 * Select a thinking sound based on context
 */
export async function selectThinkingSound(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.thinkingSounds) {
    return null;
  }

  let category: keyof ThinkingSoundsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathy';
  } else if (context.content.isQuestion) {
    category = 'considering';
  } else if (context.emotional.agentTone === 'curious') {
    category = 'uncertainty';
  } else {
    category = 'processing';
  }

  const phrases = profile.thinkingSounds[category];
  if (!Array.isArray(phrases)) {
    const fallback = profile.thinkingSounds.thinking;
    if (!Array.isArray(fallback)) return null;

    const phrase = getRandomPhrase(fallback, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'thinking',
      position: 'prefix',
      confidence: 0.6,
      metadata: {
        source: 'thinking-sounds',
        personaId,
        contextMatch: ['fallback'],
      },
    };
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.75,
    metadata: {
      source: 'thinking-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Select a thinking sound synchronously (uses cached profile)
 */
export function selectThinkingSoundSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.thinkingSounds) {
    return null;
  }

  let category: keyof ThinkingSoundsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathy';
  } else if (context.content.isQuestion) {
    category = 'considering';
  } else if (context.emotional.agentTone === 'curious') {
    category = 'uncertainty';
  } else {
    category = 'processing';
  }

  const phrases = profile.thinkingSounds[category];
  if (!Array.isArray(phrases)) {
    const fallback = profile.thinkingSounds.thinking;
    if (!Array.isArray(fallback)) return null;

    const phrase = getRandomPhrase(fallback, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'thinking',
      position: 'prefix',
      confidence: 0.6,
      metadata: {
        source: 'thinking-sounds',
        personaId,
        contextMatch: ['fallback'],
      },
    };
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.75,
    metadata: {
      source: 'thinking-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

// =============================================================================
// BACKCHANNEL SELECTION
// =============================================================================

/**
 * Select a backchannel based on context
 */
export async function selectBackchannel(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.backchannels) {
    return null;
  }

  let category: keyof BackchannelsSchema;
  if (context.emotional.isVulnerable || context.content.isComforting) {
    category = 'empathetic';
  } else if (context.content.isCelebration) {
    category = 'encouraging';
  } else if (context.content.isQuestion) {
    category = 'curious';
  } else {
    category = 'short';
  }

  const phrases = profile.backchannels[category];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.7,
    metadata: {
      source: 'backchannels',
      personaId,
      contextMatch: [category],
    },
  };
}

// =============================================================================
// BREATH SOUND SELECTION
// =============================================================================

type BreathCategory =
  | 'contemplative_breath'
  | 'before_something_hard'
  | 'after_user_shares'
  | 'holding_space'
  | 'grounding'
  | 'gentle_sigh'
  | 'encouraging_breath'
  | 'before_celebration'
  | 'empathetic_sigh'
  | 'meditative_breath'
  | 'before_wisdom'
  | 'excited_breath'
  | 'celebration_build'
  | 'grounding_breath'
  | 'overwhelm_support'
  | 'wisdom_breath'
  | 'before_important_point';

/**
 * Select a breath sound based on context (async)
 */
export async function selectBreathSound(
  personaId: string,
  context: BehaviorSelectionContext
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.breathSounds) {
    return null;
  }

  const { matches, boost } = matchesContext(profile.breathSounds.usage_rules, context);
  if (!matches) {
    return null;
  }

  const category = selectBreathCategory(personaId, context);
  const phrases = profile.breathSounds[category as keyof BreathSoundsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.65 + boost,
    metadata: {
      source: 'breath-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

/**
 * Select a breath sound synchronously (uses cached profile)
 */
export function selectBreathSoundSync(
  personaId: string,
  context: BehaviorSelectionContext
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);
  if (!profile?.breathSounds) {
    return null;
  }

  const { matches, boost } = matchesContext(profile.breathSounds.usage_rules, context);
  if (!matches) {
    return null;
  }

  const category = selectBreathCategory(personaId, context);
  const phrases = profile.breathSounds[category as keyof BreathSoundsSchema];
  if (!Array.isArray(phrases)) {
    return null;
  }

  const phrase = getRandomPhrase(phrases, context.randomSeed);
  if (!phrase) return null;

  return {
    phrase,
    category,
    position: 'prefix',
    confidence: 0.65 + boost,
    metadata: {
      source: 'breath-sounds',
      personaId,
      contextMatch: [category],
    },
  };
}

// =============================================================================
// LAUGHTER CONTAGION SELECTION
// =============================================================================

/**
 * Select a laughter response when user laughs
 */
export async function selectLaughterResponse(
  personaId: string,
  context: BehaviorSelectionContext & { userLaughed?: boolean }
): Promise<SelectedBehavior | null> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.laughterContagion) {
    return null;
  }

  const { contagious_laughter, laugh_with_phrases } = profile.laughterContagion;

  if (context.userLaughed) {
    const shouldLaugh = Math.random() < contagious_laughter.when_user_laughs.probability;
    if (!shouldLaugh) return null;

    const isHighEnergy = context.emotional.energyLevel === 'high' || context.content.isCelebration;
    const laughOptions = isHighEnergy
      ? contagious_laughter.when_user_laughs.full_join
      : contagious_laughter.when_user_laughs.soft_join;

    const phrase = getRandomPhrase(laughOptions, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'contagious_laughter',
      position: 'prefix',
      confidence: 0.8,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['user_laughed'],
      },
    };
  }

  if (context.content.isCelebration && Math.random() < 0.3) {
    const phrase = getRandomPhrase(laugh_with_phrases, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'laugh_with',
      position: 'prefix',
      confidence: 0.7,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['celebration'],
      },
    };
  }

  return null;
}

/**
 * Select a laughter response synchronously
 */
export function selectLaughterResponseSync(
  personaId: string,
  context: BehaviorSelectionContext & { userLaughed?: boolean }
): SelectedBehavior | null {
  const profile = getSpeechProfileSync(personaId);

  if (!profile?.laughterContagion) {
    return null;
  }

  const { contagious_laughter, laugh_with_phrases } = profile.laughterContagion;

  if (context.userLaughed) {
    const shouldLaugh = Math.random() < contagious_laughter.when_user_laughs.probability;
    if (!shouldLaugh) return null;

    const isHighEnergy = context.emotional.energyLevel === 'high' || context.content.isCelebration;
    const laughOptions = isHighEnergy
      ? contagious_laughter.when_user_laughs.full_join
      : contagious_laughter.when_user_laughs.soft_join;

    const phrase = getRandomPhrase(laughOptions, context.randomSeed);
    if (!phrase) return null;

    return {
      phrase,
      category: 'contagious_laughter',
      position: 'prefix',
      confidence: 0.8,
      metadata: {
        source: 'backchannels',
        personaId,
        contextMatch: ['user_laughed'],
      },
    };
  }

  if (context.content.isCelebration && Math.random() < 0.3) {
    const phrase = getRandomPhrase(laugh_with_phrases, context.randomSeed);
    if (phrase) {
      return {
        phrase,
        category: 'laugh_with',
        position: 'prefix',
        confidence: 0.7,
        metadata: {
          source: 'backchannels',
          personaId,
          contextMatch: ['celebration'],
        },
      };
    }
  }

  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Determine injection position based on category
 */
function getPositionForCategory(category: ImperfectionCategory): 'prefix' | 'suffix' | 'inline' {
  switch (category) {
    case 'trailing_off':
      return 'suffix';
    case 'excitement_overflow':
    case 'celebration_overflow':
    case 'celebration_warmth':
      return 'inline';
    case 'self_corrections':
    case 'restarts':
    case 'natural_restarts':
      return 'inline';
    case 'thinking_aloud':
    case 'contemplative_sounds':
    case 'genuine_processing':
    case 'efficient_processing':
    case 'grandfatherly_processing':
      return 'prefix';
    case 'filler_sounds':
      return 'prefix';
    case 'empathy_sounds':
    case 'grounding_sounds':
    case 'overwhelm_support':
    case 'vocal_vulnerability':
      return 'prefix';
    case 'wisdom_building':
    case 'gentle_laughter':
    case 'presence_sounds':
      return 'prefix';
    case 'research_precision':
    case 'elderly_warmth':
    case 'concern_sounds':
    case 'warm_processing':
      return 'prefix';
    default:
      return 'prefix';
  }
}

/**
 * Select appropriate breath category based on persona and context
 */
function selectBreathCategory(
  personaId: string,
  context: BehaviorSelectionContext
): BreathCategory {
  const { emotional, content } = context;

  switch (personaId) {
    case 'ferni':
      if (emotional.isVulnerable) return 'holding_space';
      if (content.isComforting) return 'after_user_shares';
      if (emotional.isLateNight) return 'grounding';
      return 'contemplative_breath';

    case 'maya-santos':
      if (content.isCelebration) return 'before_celebration';
      if (emotional.isVulnerable) return 'empathetic_sigh';
      if (content.isComforting) return 'grounding';
      return 'encouraging_breath';

    case 'nayan-patel':
      if (emotional.isVulnerable) return 'holding_space';
      if (emotional.isLateNight) return 'meditative_breath';
      return 'before_wisdom';

    case 'jordan-taylor':
      if (content.isCelebration) return 'celebration_build';
      if (emotional.isVulnerable) return 'grounding';
      return 'excited_breath';

    case 'alex-chen':
      if (emotional.userEmotion === 'distressed' || emotional.userEmotion === 'anxious') {
        return 'overwhelm_support';
      }
      return 'grounding_breath';

    case 'peter-john':
      if (emotional.isVulnerable) return 'grounding';
      return 'before_important_point';

    default:
      return 'contemplative_breath';
  }
}
