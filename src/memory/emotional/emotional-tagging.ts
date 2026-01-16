/**
 * Emotional Tagging
 *
 * Phase 14: Emotional Memory Intelligence
 *
 * Tags memories with emotional context for:
 * - Better retrieval (find memories with similar emotional context)
 * - Pattern detection (emotional trajectories)
 * - Joy amplification (surface positive memories when needed)
 *
 * @module memory/emotional/emotional-tagging
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionalTagging' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Emotional valence categories
 */
export type EmotionalValence = 'positive' | 'negative' | 'neutral' | 'mixed';

/**
 * Primary emotion categories (Russell's circumplex model)
 */
export type PrimaryEmotion =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'anticipation'
  | 'trust'
  | 'neutral';

/**
 * Emotional arousal level
 */
export type ArousalLevel = 'low' | 'medium' | 'high';

/**
 * Emotional tag for a memory
 */
export interface EmotionalTag {
  /** Primary emotion */
  primaryEmotion: PrimaryEmotion;
  /** Secondary emotions (can have multiple) */
  secondaryEmotions: PrimaryEmotion[];
  /** Overall valence */
  valence: EmotionalValence;
  /** Valence score (-1 to 1) */
  valenceScore: number;
  /** Arousal level */
  arousal: ArousalLevel;
  /** Arousal score (0-1) */
  arousalScore: number;
  /** Specific emotion labels */
  emotionLabels: string[];
  /** Whether this is a significant emotional moment */
  isEmotionalPeak: boolean;
  /** Tags for retrieval */
  searchTags: string[];
  /** Tagging confidence */
  confidence: number;
}

/**
 * Input for emotional tagging
 */
export interface EmotionalTagInput {
  /** Memory content */
  content: string;
  /** Text-based emotion (if available) */
  textEmotion?: {
    primary: string;
    intensity: number;
    valence?: number;
  };
  /** Voice-based emotion (if available) */
  voiceEmotion?: {
    primary: string;
    arousal?: number;
    valence?: number;
  };
  /** Context from conversation */
  conversationContext?: string;
}

// ============================================================================
// EMOTION MAPPINGS
// ============================================================================

/**
 * Map text emotions to primary emotions
 */
const EMOTION_TO_PRIMARY: Record<string, PrimaryEmotion> = {
  // Joy family
  happy: 'joy',
  excited: 'joy',
  grateful: 'joy',
  proud: 'joy',
  content: 'joy',
  relieved: 'joy',
  hopeful: 'joy',
  optimistic: 'joy',
  elated: 'joy',
  thrilled: 'joy',
  blissful: 'joy',

  // Sadness family
  sad: 'sadness',
  depressed: 'sadness',
  lonely: 'sadness',
  grief: 'sadness',
  disappointed: 'sadness',
  melancholy: 'sadness',
  heartbroken: 'sadness',
  lost: 'sadness',
  empty: 'sadness',
  hopeless: 'sadness',

  // Anger family
  angry: 'anger',
  frustrated: 'anger',
  irritated: 'anger',
  annoyed: 'anger',
  resentful: 'anger',
  furious: 'anger',
  bitter: 'anger',
  enraged: 'anger',

  // Fear family
  scared: 'fear',
  anxious: 'fear',
  worried: 'fear',
  nervous: 'fear',
  terrified: 'fear',
  panicked: 'fear',
  insecure: 'fear',
  stressed: 'fear',

  // Surprise family
  surprised: 'surprise',
  shocked: 'surprise',
  amazed: 'surprise',
  astonished: 'surprise',
  stunned: 'surprise',

  // Disgust family
  disgusted: 'disgust',
  repulsed: 'disgust',
  contempt: 'disgust',

  // Anticipation family
  curious: 'anticipation',
  eager: 'anticipation',
  expectant: 'anticipation',
  awaiting: 'anticipation',

  // Trust family
  trusting: 'trust',
  comfortable: 'trust',
  safe: 'trust',
  secure: 'trust',
  accepted: 'trust',
  loved: 'trust',

  // Neutral
  calm: 'neutral',
  neutral: 'neutral',
  indifferent: 'neutral',
};

/**
 * Valence mapping for primary emotions
 */
const EMOTION_VALENCE: Record<PrimaryEmotion, EmotionalValence> = {
  joy: 'positive',
  sadness: 'negative',
  anger: 'negative',
  fear: 'negative',
  surprise: 'mixed',
  disgust: 'negative',
  anticipation: 'mixed',
  trust: 'positive',
  neutral: 'neutral',
};

/**
 * Typical arousal levels for primary emotions
 */
const EMOTION_AROUSAL: Record<PrimaryEmotion, ArousalLevel> = {
  joy: 'high',
  sadness: 'low',
  anger: 'high',
  fear: 'high',
  surprise: 'high',
  disgust: 'medium',
  anticipation: 'medium',
  trust: 'low',
  neutral: 'low',
};

// ============================================================================
// KEYWORD DETECTION
// ============================================================================

const POSITIVE_KEYWORDS = [
  'love',
  'happy',
  'grateful',
  'proud',
  'wonderful',
  'amazing',
  'beautiful',
  'blessed',
  'excited',
  'thrilled',
  'achieved',
  'succeeded',
  'accomplished',
  'breakthrough',
  'finally',
];

const NEGATIVE_KEYWORDS = [
  'hate',
  'sad',
  'angry',
  'worried',
  'scared',
  'terrible',
  'awful',
  'devastating',
  'heartbroken',
  'failed',
  'lost',
  'hurt',
  'painful',
  'frustrated',
  'stressed',
  'overwhelmed',
];

const HIGH_AROUSAL_KEYWORDS = [
  'amazing',
  'incredible',
  'unbelievable',
  'shocked',
  'stunned',
  'terrified',
  'furious',
  'thrilled',
  'ecstatic',
  'devastated',
  'extremely',
  'absolutely',
  'completely',
  'totally',
];

// ============================================================================
// MAIN TAGGING FUNCTION
// ============================================================================

/**
 * Generate emotional tags for a memory.
 *
 * This is the main function that analyzes content and generates
 * emotional tags for retrieval and pattern detection.
 */
export function tagEmotionally(input: EmotionalTagInput): EmotionalTag {
  // Start with keyword analysis
  const keywordAnalysis = analyzeKeywords(input.content);

  // Determine primary emotion
  let primaryEmotion: PrimaryEmotion = 'neutral';
  let confidence = 0.5;

  // Prefer external emotion detection if available
  if (input.textEmotion) {
    const mapped = EMOTION_TO_PRIMARY[input.textEmotion.primary.toLowerCase()];
    if (mapped) {
      primaryEmotion = mapped;
      confidence = Math.min(1.0, 0.5 + input.textEmotion.intensity * 0.5);
    }
  }

  // Use voice emotion as secondary signal
  if (input.voiceEmotion) {
    const voiceMapped = EMOTION_TO_PRIMARY[input.voiceEmotion.primary.toLowerCase()];
    if (voiceMapped && primaryEmotion === 'neutral') {
      primaryEmotion = voiceMapped;
      confidence = 0.7;
    }
  }

  // Fall back to keyword analysis
  if (primaryEmotion === 'neutral' && keywordAnalysis.primaryEmotion !== 'neutral') {
    primaryEmotion = keywordAnalysis.primaryEmotion;
    confidence = 0.6;
  }

  // Determine valence
  const valence = EMOTION_VALENCE[primaryEmotion];
  let valenceScore = 0;
  if (valence === 'positive') valenceScore = 0.7;
  else if (valence === 'negative') valenceScore = -0.7;
  else if (valence === 'mixed') valenceScore = 0.2;

  // Adjust with external signals
  if (input.textEmotion?.valence !== undefined) {
    valenceScore = (valenceScore + input.textEmotion.valence) / 2;
  }
  if (input.voiceEmotion?.valence !== undefined) {
    valenceScore = (valenceScore + input.voiceEmotion.valence) / 2;
  }

  // Determine arousal
  const arousal = EMOTION_AROUSAL[primaryEmotion];
  let arousalScore = arousal === 'high' ? 0.8 : arousal === 'medium' ? 0.5 : 0.3;

  // Adjust with keyword analysis
  if (keywordAnalysis.highArousal) {
    arousalScore = Math.min(1.0, arousalScore + 0.2);
  }

  // Adjust with voice emotion
  if (input.voiceEmotion?.arousal !== undefined) {
    arousalScore = (arousalScore + input.voiceEmotion.arousal) / 2;
  }

  // Determine secondary emotions
  const secondaryEmotions = detectSecondaryEmotions(input.content, primaryEmotion);

  // Generate search tags
  const searchTags = generateSearchTags(primaryEmotion, secondaryEmotions, valence, arousal);

  // Detect emotional peak
  const isEmotionalPeak =
    arousalScore > 0.7 || Math.abs(valenceScore) > 0.8 || keywordAnalysis.highArousal;

  const result: EmotionalTag = {
    primaryEmotion,
    secondaryEmotions,
    valence,
    valenceScore,
    arousal,
    arousalScore,
    emotionLabels: [primaryEmotion, ...secondaryEmotions],
    isEmotionalPeak,
    searchTags,
    confidence,
  };

  log.debug(
    {
      primaryEmotion,
      valence,
      arousal,
      isEmotionalPeak,
      searchTags,
    },
    '🏷️ Emotional tag generated'
  );

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Analyze content keywords for emotion
 */
function analyzeKeywords(content: string): {
  primaryEmotion: PrimaryEmotion;
  highArousal: boolean;
  positiveScore: number;
  negativeScore: number;
} {
  const lowerContent = content.toLowerCase();

  let positiveScore = 0;
  let negativeScore = 0;
  let highArousal = false;

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      positiveScore += 1;
    }
  }

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      negativeScore += 1;
    }
  }

  for (const keyword of HIGH_AROUSAL_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      highArousal = true;
      break;
    }
  }

  // Determine primary emotion from keywords
  let primaryEmotion: PrimaryEmotion = 'neutral';
  if (positiveScore > negativeScore && positiveScore > 0) {
    primaryEmotion = 'joy';
  } else if (negativeScore > positiveScore && negativeScore > 0) {
    // Try to determine specific negative emotion
    if (lowerContent.includes('angry') || lowerContent.includes('frustrated')) {
      primaryEmotion = 'anger';
    } else if (lowerContent.includes('scared') || lowerContent.includes('worried')) {
      primaryEmotion = 'fear';
    } else {
      primaryEmotion = 'sadness';
    }
  }

  return { primaryEmotion, highArousal, positiveScore, negativeScore };
}

/**
 * Detect secondary emotions from content
 */
function detectSecondaryEmotions(
  content: string,
  primaryEmotion: PrimaryEmotion
): PrimaryEmotion[] {
  const secondary: PrimaryEmotion[] = [];
  const lowerContent = content.toLowerCase();

  // Check for each emotion family
  const emotionFamilies: Array<[string[], PrimaryEmotion]> = [
    [['grateful', 'thankful', 'blessed'], 'trust'],
    [['curious', 'wondering', 'interested'], 'anticipation'],
    [['surprised', 'shocked', 'amazed'], 'surprise'],
    [['worried', 'anxious', 'nervous'], 'fear'],
    [['frustrated', 'annoyed', 'irritated'], 'anger'],
    [['sad', 'disappointed', 'hurt'], 'sadness'],
    [['happy', 'excited', 'thrilled'], 'joy'],
  ];

  for (const [keywords, emotion] of emotionFamilies) {
    if (emotion !== primaryEmotion && keywords.some((k) => lowerContent.includes(k))) {
      secondary.push(emotion);
    }
  }

  return secondary.slice(0, 2); // Limit to 2 secondary emotions
}

/**
 * Generate search tags for retrieval
 */
function generateSearchTags(
  primaryEmotion: PrimaryEmotion,
  secondaryEmotions: PrimaryEmotion[],
  valence: EmotionalValence,
  arousal: ArousalLevel
): string[] {
  const tags: string[] = [];

  // Primary emotion tag
  tags.push(`emotion:${primaryEmotion}`);

  // Secondary emotion tags
  for (const secondary of secondaryEmotions) {
    tags.push(`emotion:${secondary}`);
  }

  // Valence tag
  tags.push(`valence:${valence}`);

  // Arousal tag
  tags.push(`arousal:${arousal}`);

  // Combined tags for common queries
  if (valence === 'positive' && arousal === 'high') {
    tags.push('mood:euphoric');
  } else if (valence === 'positive' && arousal === 'low') {
    tags.push('mood:content');
  } else if (valence === 'negative' && arousal === 'high') {
    tags.push('mood:distressed');
  } else if (valence === 'negative' && arousal === 'low') {
    tags.push('mood:dejected');
  }

  return tags;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Tag multiple memories
 */
export function tagBatchEmotionally(inputs: EmotionalTagInput[]): EmotionalTag[] {
  return inputs.map((input) => tagEmotionally(input));
}

/**
 * Find memories with similar emotional profile
 */
export function findSimilarEmotions(
  target: EmotionalTag,
  candidates: EmotionalTag[]
): EmotionalTag[] {
  return candidates.filter((candidate) => {
    // Same primary emotion = high similarity
    if (candidate.primaryEmotion === target.primaryEmotion) {
      return true;
    }

    // Same valence + similar arousal = moderate similarity
    if (candidate.valence === target.valence) {
      const arousalDiff = Math.abs(candidate.arousalScore - target.arousalScore);
      return arousalDiff < 0.3;
    }

    return false;
  });
}

/**
 * Get emotional trajectory from a sequence of tags
 */
export function getEmotionalTrajectory(
  tags: EmotionalTag[]
): 'improving' | 'declining' | 'stable' | 'volatile' {
  if (tags.length < 2) return 'stable';

  const valenceScores = tags.map((t) => t.valenceScore);

  // Calculate trend
  const firstHalf = valenceScores.slice(0, Math.floor(valenceScores.length / 2));
  const secondHalf = valenceScores.slice(Math.floor(valenceScores.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;

  // Check for volatility
  const variance =
    valenceScores.reduce((sum, v) => sum + Math.pow(v - (firstAvg + secondAvg) / 2, 2), 0) /
    valenceScores.length;

  if (variance > 0.3) return 'volatile';
  if (diff > 0.2) return 'improving';
  if (diff < -0.2) return 'declining';
  return 'stable';
}
