/**
 * Emotional Memory Weighting
 *
 * Phase 14: Emotional Memory Intelligence
 *
 * Calculates emotional weight for memories based on multiple signals.
 * High emotional weight = more likely to be remembered and surfaced.
 *
 * Weight Factors:
 * - Text emotion intensity
 * - Voice prosody signals
 * - Topic importance
 * - Relationship significance
 * - Temporal context (anniversaries, milestones)
 *
 * @module memory/emotional/emotional-weighting
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionalWeighting' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for emotional weight calculation
 */
export interface EmotionalWeightInput {
  /** The memory content */
  content: string;
  /** Text-based emotion analysis */
  textEmotion?: {
    primary: string;
    intensity: number;
    valence?: number;
  };
  /** Voice-based emotion signals */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
    voiceStrain?: boolean;
  };
  /** Topic context */
  topic?: string;
  /** Related entities (people, places) */
  relatedEntities?: string[];
  /** Whether this is near a significant date */
  nearSignificantDate?: boolean;
  /** User's relationship with mentioned entities */
  relationshipContext?: {
    person: string;
    emotionalCloseness: number; // 0-1
  };
  /** Previous emotional weight (if updating) */
  previousWeight?: number;
}

/**
 * Emotional weight calculation result
 */
export interface EmotionalWeightResult {
  /** Final calculated weight (0-1) */
  weight: number;
  /** Weight breakdown by factor */
  breakdown: {
    textEmotion: number;
    voiceEmotion: number;
    topicImportance: number;
    relationshipSignificance: number;
    temporalContext: number;
    contentIntensity: number;
  };
  /** Factors that contributed to weight */
  factors: string[];
  /** Confidence in the calculation */
  confidence: number;
  /** Whether this is high importance */
  isHighImportance: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface EmotionalWeightConfig {
  /** Base weight when no signals available */
  baseWeight: number;
  /** Maximum weight multiplier from any single factor */
  maxFactorMultiplier: number;
  /** Threshold for high importance */
  highImportanceThreshold: number;
  /** Factor weights */
  factorWeights: {
    textEmotion: number;
    voiceEmotion: number;
    topicImportance: number;
    relationshipSignificance: number;
    temporalContext: number;
    contentIntensity: number;
  };
}

const DEFAULT_CONFIG: EmotionalWeightConfig = {
  baseWeight: 0.4,
  maxFactorMultiplier: 1.5,
  highImportanceThreshold: 0.7,
  factorWeights: {
    textEmotion: 0.2,
    voiceEmotion: 0.25,
    topicImportance: 0.15,
    relationshipSignificance: 0.15,
    temporalContext: 0.1,
    contentIntensity: 0.15,
  },
};

let config: EmotionalWeightConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setEmotionalWeightConfig(newConfig: Partial<EmotionalWeightConfig>): void {
  config = {
    ...config,
    ...newConfig,
    factorWeights: {
      ...config.factorWeights,
      ...(newConfig.factorWeights || {}),
    },
  };
}

/**
 * Get current configuration
 */
export function getEmotionalWeightConfig(): EmotionalWeightConfig {
  return { ...config };
}

// ============================================================================
// HIGH-EMOTION KEYWORDS
// ============================================================================

const HIGH_EMOTION_KEYWORDS = {
  positive: [
    'love',
    'amazing',
    'wonderful',
    'incredible',
    'best',
    'perfect',
    'grateful',
    'blessed',
    'proud',
    'excited',
    'thrilled',
    'overjoyed',
    'breakthrough',
    'milestone',
    'achieved',
    'accomplished',
    'succeeded',
  ],
  negative: [
    'hate',
    'terrible',
    'awful',
    'devastated',
    'heartbroken',
    'destroyed',
    'terrified',
    'hopeless',
    'helpless',
    'worthless',
    'ashamed',
    'guilty',
    'panic',
    'crisis',
    'emergency',
    'worst',
    'failure',
    'lost',
  ],
  intense: [
    'really',
    'so',
    'very',
    'extremely',
    'incredibly',
    'absolutely',
    'completely',
    'totally',
    'deeply',
    'profoundly',
    'utterly',
  ],
};

const IMPORTANT_TOPICS = [
  'health',
  'family',
  'career',
  'money',
  'relationship',
  'loss',
  'death',
  'marriage',
  'divorce',
  'pregnancy',
  'child',
  'parent',
  'diagnosis',
  'job',
  'fired',
  'hired',
  'promotion',
  'moving',
  'home',
  'trauma',
];

// ============================================================================
// MAIN CALCULATION
// ============================================================================

/**
 * Calculate emotional weight for a memory.
 *
 * This is the main function that combines all emotional signals
 * into a single weight value.
 */
export function calculateEmotionalWeight(input: EmotionalWeightInput): EmotionalWeightResult {
  const breakdown = {
    textEmotion: 0,
    voiceEmotion: 0,
    topicImportance: 0,
    relationshipSignificance: 0,
    temporalContext: 0,
    contentIntensity: 0,
  };
  const factors: string[] = [];

  // 1. Text emotion factor
  if (input.textEmotion) {
    breakdown.textEmotion = calculateTextEmotionFactor(input.textEmotion);
    if (breakdown.textEmotion > 0.3) {
      factors.push('text_emotion');
    }
  }

  // 2. Voice emotion factor
  if (input.voiceEmotion) {
    breakdown.voiceEmotion = calculateVoiceEmotionFactor(input.voiceEmotion);
    if (breakdown.voiceEmotion > 0.3) {
      factors.push('voice_emotion');
    }
    if (input.voiceEmotion.voiceStrain) {
      breakdown.voiceEmotion = Math.min(1.0, breakdown.voiceEmotion + 0.2);
      factors.push('voice_strain');
    }
  }

  // 3. Topic importance factor
  breakdown.topicImportance = calculateTopicImportance(input.content, input.topic);
  if (breakdown.topicImportance > 0.3) {
    factors.push('important_topic');
  }

  // 4. Relationship significance factor
  if (input.relationshipContext) {
    breakdown.relationshipSignificance = input.relationshipContext.emotionalCloseness;
    if (breakdown.relationshipSignificance > 0.5) {
      factors.push('close_relationship');
    }
  } else if (input.relatedEntities && input.relatedEntities.length > 0) {
    breakdown.relationshipSignificance = 0.3; // Some relationship context
    factors.push('mentions_person');
  }

  // 5. Temporal context factor
  if (input.nearSignificantDate) {
    breakdown.temporalContext = 0.8;
    factors.push('significant_date');
  }

  // 6. Content intensity factor
  breakdown.contentIntensity = calculateContentIntensity(input.content);
  if (breakdown.contentIntensity > 0.3) {
    factors.push('intense_language');
  }

  // Calculate weighted sum
  let weight = config.baseWeight;
  weight += breakdown.textEmotion * config.factorWeights.textEmotion;
  weight += breakdown.voiceEmotion * config.factorWeights.voiceEmotion;
  weight += breakdown.topicImportance * config.factorWeights.topicImportance;
  weight += breakdown.relationshipSignificance * config.factorWeights.relationshipSignificance;
  weight += breakdown.temporalContext * config.factorWeights.temporalContext;
  weight += breakdown.contentIntensity * config.factorWeights.contentIntensity;

  // Apply previous weight if updating (smoothing)
  if (input.previousWeight !== undefined) {
    weight = weight * 0.7 + input.previousWeight * 0.3;
  }

  // Cap at 1.0
  weight = Math.min(1.0, weight);

  // Calculate confidence
  const signalCount = Object.values(breakdown).filter((v) => v > 0).length;
  const confidence = Math.min(1.0, 0.5 + signalCount * 0.1);

  const isHighImportance = weight >= config.highImportanceThreshold;

  log.debug(
    {
      weight,
      isHighImportance,
      factors,
      signalCount,
    },
    '⚖️ Emotional weight calculated'
  );

  return {
    weight,
    breakdown,
    factors,
    confidence,
    isHighImportance,
  };
}

// ============================================================================
// FACTOR CALCULATIONS
// ============================================================================

/**
 * Calculate weight factor from text emotion
 */
function calculateTextEmotionFactor(emotion: {
  primary: string;
  intensity: number;
  valence?: number;
}): number {
  let factor = emotion.intensity;

  // Boost for extreme valence
  if (emotion.valence !== undefined) {
    const valenceExtreme = Math.abs(emotion.valence);
    if (valenceExtreme > 0.7) {
      factor += 0.2;
    }
  }

  // Boost for certain emotions
  const highEmotions = ['grief', 'fear', 'joy', 'love', 'anger', 'despair'];
  if (highEmotions.some((e) => emotion.primary.toLowerCase().includes(e))) {
    factor += 0.15;
  }

  return Math.min(1.0, factor);
}

/**
 * Calculate weight factor from voice emotion
 */
function calculateVoiceEmotionFactor(emotion: {
  primary: string;
  confidence: number;
  arousal?: number;
  valence?: number;
}): number {
  let factor = emotion.confidence * 0.5;

  // High arousal indicates emotional intensity
  if (emotion.arousal !== undefined && emotion.arousal > 0.6) {
    factor += 0.3;
  }

  // Extreme valence
  if (emotion.valence !== undefined) {
    const valenceExtreme = Math.abs(emotion.valence);
    if (valenceExtreme > 0.7) {
      factor += 0.2;
    }
  }

  return Math.min(1.0, factor);
}

/**
 * Calculate topic importance factor
 */
function calculateTopicImportance(content: string, topic?: string): number {
  const lowerContent = content.toLowerCase();
  const lowerTopic = topic?.toLowerCase() || '';

  let importance = 0;

  // Check for important topics
  for (const importantTopic of IMPORTANT_TOPICS) {
    if (lowerContent.includes(importantTopic) || lowerTopic.includes(importantTopic)) {
      importance += 0.2;
    }
  }

  return Math.min(1.0, importance);
}

/**
 * Calculate content intensity from language
 */
function calculateContentIntensity(content: string): number {
  const lowerContent = content.toLowerCase();
  let intensity = 0;

  // Check for positive high-emotion words
  for (const word of HIGH_EMOTION_KEYWORDS.positive) {
    if (lowerContent.includes(word)) {
      intensity += 0.15;
    }
  }

  // Check for negative high-emotion words
  for (const word of HIGH_EMOTION_KEYWORDS.negative) {
    if (lowerContent.includes(word)) {
      intensity += 0.2; // Negative emotions often more intense
    }
  }

  // Check for intensity modifiers
  for (const word of HIGH_EMOTION_KEYWORDS.intense) {
    if (lowerContent.includes(word)) {
      intensity += 0.1;
    }
  }

  // Check for exclamations
  const exclamations = (content.match(/!/g) || []).length;
  intensity += exclamations * 0.05;

  return Math.min(1.0, intensity);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Calculate emotional weight for multiple memories
 */
export function calculateBatchEmotionalWeight(
  inputs: EmotionalWeightInput[]
): EmotionalWeightResult[] {
  return inputs.map((input) => calculateEmotionalWeight(input));
}

/**
 * Get average emotional weight for a set of memories
 */
export function getAverageEmotionalWeight(results: EmotionalWeightResult[]): number {
  if (results.length === 0) return config.baseWeight;
  return results.reduce((sum, r) => sum + r.weight, 0) / results.length;
}

/**
 * Find highest emotional weight memories
 */
export function findHighestEmotionalWeight(
  results: Array<{ result: EmotionalWeightResult; id: string }>,
  limit = 5
): Array<{ result: EmotionalWeightResult; id: string }> {
  return [...results].sort((a, b) => b.result.weight - a.result.weight).slice(0, limit);
}
