/**
 * Emotional Granularity Training
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Helps users develop richer emotional vocabulary.
 * "I feel bad" → "I feel disappointed, anxious, and a little angry"
 *
 * Philosophy:
 * - Naming emotions helps regulate them
 * - Precision in language creates clarity in experience
 * - Growth in vocabulary = growth in self-understanding
 *
 * @module EmotionalGranularity
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionalGranularity' });

// ============================================================================
// TYPES
// ============================================================================

export type EmotionCategory =
  | 'anger'
  | 'sadness'
  | 'fear'
  | 'joy'
  | 'surprise'
  | 'disgust'
  | 'mixed';

export interface EmotionWord {
  word: string;
  category: EmotionCategory;
  intensity: 'low' | 'medium' | 'high';
  nuance: string; // What makes this different from similar words
}

export interface GranularityProfile {
  userId: string;

  // Vocabulary tracking
  emotionWordsUsed: Map<string, number>;
  uniqueWordsCount: number;

  // Patterns
  commonVagueExpressions: string[];
  granularityScore: number; // 0-100

  // Progress
  expansionOpportunities: number; // Times we offered vocabulary expansion
  expansionsAccepted: number;

  lastUpdated: Date;
}

// ============================================================================
// EMOTION VOCABULARY
// ============================================================================

const EMOTION_VOCABULARY: Record<EmotionCategory, EmotionWord[]> = {
  anger: [
    {
      word: 'irritated',
      category: 'anger',
      intensity: 'low',
      nuance: 'Mild annoyance, easily passes',
    },
    {
      word: 'frustrated',
      category: 'anger',
      intensity: 'medium',
      nuance: 'Blocked from something you want',
    },
    { word: 'annoyed', category: 'anger', intensity: 'low', nuance: 'Bothered by something small' },
    { word: 'resentful', category: 'anger', intensity: 'medium', nuance: 'Lingering unfairness' },
    { word: 'furious', category: 'anger', intensity: 'high', nuance: 'Intense, often righteous' },
    { word: 'enraged', category: 'anger', intensity: 'high', nuance: 'Out of control feeling' },
    {
      word: 'indignant',
      category: 'anger',
      intensity: 'medium',
      nuance: 'Moral outrage at unfairness',
    },
    { word: 'bitter', category: 'anger', intensity: 'medium', nuance: 'Anger that has settled in' },
    {
      word: 'exasperated',
      category: 'anger',
      intensity: 'medium',
      nuance: 'Frustrated beyond patience',
    },
    { word: 'hostile', category: 'anger', intensity: 'high', nuance: 'Ready to fight' },
  ],
  sadness: [
    { word: 'disappointed', category: 'sadness', intensity: 'low', nuance: 'Expectations unmet' },
    {
      word: 'melancholy',
      category: 'sadness',
      intensity: 'medium',
      nuance: 'Gentle, almost sweet sadness',
    },
    {
      word: 'heartbroken',
      category: 'sadness',
      intensity: 'high',
      nuance: 'Loss of love or connection',
    },
    {
      word: 'grief',
      category: 'sadness',
      intensity: 'high',
      nuance: 'Response to significant loss',
    },
    {
      word: 'lonely',
      category: 'sadness',
      intensity: 'medium',
      nuance: 'Disconnected from others',
    },
    { word: 'dejected', category: 'sadness', intensity: 'medium', nuance: 'Defeated and low' },
    { word: 'despondent', category: 'sadness', intensity: 'high', nuance: 'Lost hope' },
    { word: 'wistful', category: 'sadness', intensity: 'low', nuance: 'Longing for what was' },
    { word: 'bereft', category: 'sadness', intensity: 'high', nuance: 'Emptied by loss' },
    {
      word: 'forlorn',
      category: 'sadness',
      intensity: 'medium',
      nuance: 'Pitifully sad and alone',
    },
  ],
  fear: [
    { word: 'nervous', category: 'fear', intensity: 'low', nuance: 'Mild worry about outcome' },
    { word: 'anxious', category: 'fear', intensity: 'medium', nuance: 'Worry that lingers' },
    { word: 'terrified', category: 'fear', intensity: 'high', nuance: 'Extreme fear, paralysis' },
    { word: 'apprehensive', category: 'fear', intensity: 'low', nuance: 'Uneasy about future' },
    { word: 'dread', category: 'fear', intensity: 'high', nuance: 'Deep fear of inevitable' },
    { word: 'panicked', category: 'fear', intensity: 'high', nuance: 'Overwhelming, urgent fear' },
    { word: 'uneasy', category: 'fear', intensity: 'low', nuance: 'Something feels off' },
    { word: 'vulnerable', category: 'fear', intensity: 'medium', nuance: 'Exposed, unprotected' },
    { word: 'insecure', category: 'fear', intensity: 'medium', nuance: 'Doubting your stability' },
    { word: 'overwhelmed', category: 'fear', intensity: 'medium', nuance: 'Too much to handle' },
  ],
  joy: [
    { word: 'content', category: 'joy', intensity: 'low', nuance: 'Quiet satisfaction' },
    { word: 'happy', category: 'joy', intensity: 'medium', nuance: 'General positive feeling' },
    { word: 'elated', category: 'joy', intensity: 'high', nuance: 'Intense happiness' },
    { word: 'peaceful', category: 'joy', intensity: 'low', nuance: 'Calm absence of distress' },
    { word: 'grateful', category: 'joy', intensity: 'medium', nuance: 'Appreciation for gifts' },
    { word: 'proud', category: 'joy', intensity: 'medium', nuance: 'Satisfaction in achievement' },
    { word: 'hopeful', category: 'joy', intensity: 'medium', nuance: 'Positive expectation' },
    { word: 'excited', category: 'joy', intensity: 'high', nuance: 'Anticipation energy' },
    { word: 'delighted', category: 'joy', intensity: 'high', nuance: 'Pleasant surprise' },
    { word: 'fulfilled', category: 'joy', intensity: 'medium', nuance: 'Deep life satisfaction' },
  ],
  surprise: [
    {
      word: 'startled',
      category: 'surprise',
      intensity: 'medium',
      nuance: 'Caught off guard physically',
    },
    { word: 'amazed', category: 'surprise', intensity: 'high', nuance: 'Wonderfully unexpected' },
    { word: 'shocked', category: 'surprise', intensity: 'high', nuance: 'Completely unexpected' },
    { word: 'confused', category: 'surprise', intensity: 'low', nuance: "Things don't make sense" },
    { word: 'intrigued', category: 'surprise', intensity: 'low', nuance: 'Curiosity sparked' },
    {
      word: 'bewildered',
      category: 'surprise',
      intensity: 'medium',
      nuance: 'Disoriented by unexpected',
    },
  ],
  disgust: [
    {
      word: 'disgusted',
      category: 'disgust',
      intensity: 'high',
      nuance: 'Strong physical revulsion',
    },
    { word: 'repulsed', category: 'disgust', intensity: 'high', nuance: 'Pushed away feeling' },
    {
      word: 'uncomfortable',
      category: 'disgust',
      intensity: 'low',
      nuance: 'Something feels wrong',
    },
    { word: 'offended', category: 'disgust', intensity: 'medium', nuance: 'Values violated' },
    { word: 'contempt', category: 'disgust', intensity: 'high', nuance: 'Looking down on' },
  ],
  mixed: [
    {
      word: 'conflicted',
      category: 'mixed',
      intensity: 'medium',
      nuance: 'Pulled in different directions',
    },
    {
      word: 'ambivalent',
      category: 'mixed',
      intensity: 'low',
      nuance: 'Mixed feelings, uncertain',
    },
    {
      word: 'bittersweet',
      category: 'mixed',
      intensity: 'medium',
      nuance: 'Joy and sadness together',
    },
    { word: 'nostalgic', category: 'mixed', intensity: 'low', nuance: 'Happy-sad about the past' },
  ],
};

// ============================================================================
// VAGUE EXPRESSION PATTERNS
// ============================================================================

const VAGUE_EXPRESSIONS: { pattern: RegExp; alternatives: string[]; category: EmotionCategory }[] =
  [
    {
      pattern: /i feel (bad|terrible|awful|horrible)/i,
      alternatives: ['disappointed', 'frustrated', 'sad', 'hurt', 'dejected'],
      category: 'sadness',
    },
    {
      pattern: /i feel (good|great|fine|okay|ok)/i,
      alternatives: ['content', 'relieved', 'peaceful', 'satisfied', 'hopeful'],
      category: 'joy',
    },
    {
      pattern: /i('m| am) (stressed|stressed out)/i,
      alternatives: ['overwhelmed', 'anxious', 'pressured', 'tense', 'stretched thin'],
      category: 'fear',
    },
    {
      pattern: /i('m| am) (mad|angry|pissed)/i,
      alternatives: ['frustrated', 'resentful', 'irritated', 'indignant', 'bitter'],
      category: 'anger',
    },
    {
      pattern: /i('m| am) (scared|afraid)/i,
      alternatives: ['anxious', 'apprehensive', 'nervous', 'vulnerable', 'uneasy'],
      category: 'fear',
    },
    {
      pattern: /i('m| am) (sad|down)/i,
      alternatives: ['melancholy', 'lonely', 'disappointed', 'dejected', 'wistful'],
      category: 'sadness',
    },
    {
      pattern: /i feel (weird|off|strange)/i,
      alternatives: ['uneasy', 'unsettled', 'confused', 'disconnected', 'conflicted'],
      category: 'mixed',
    },
  ];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const granularityProfiles = new Map<string, GranularityProfile>();

function getOrCreateProfile(userId: string): GranularityProfile {
  let profile = granularityProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      emotionWordsUsed: new Map(),
      uniqueWordsCount: 0,
      commonVagueExpressions: [],
      granularityScore: 50, // Start at middle
      expansionOpportunities: 0,
      expansionsAccepted: 0,
      lastUpdated: new Date(),
    };
    granularityProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// DETECTION & ANALYSIS
// ============================================================================

/**
 * Detect vague emotional expressions that could be expanded
 */
export function detectVagueExpression(
  userId: string,
  userMessage: string
): {
  isVague: boolean;
  expression?: string;
  alternatives?: string[];
  category?: EmotionCategory;
  expansionPrompt?: string;
} {
  const lower = userMessage.toLowerCase();

  for (const { pattern, alternatives, category } of VAGUE_EXPRESSIONS) {
    const match = lower.match(pattern);
    if (match) {
      const profile = getOrCreateProfile(userId);
      profile.commonVagueExpressions.push(match[0]);
      profile.lastUpdated = new Date();

      // Generate expansion prompt
      const randomAlts = alternatives.sort(() => Math.random() - 0.5).slice(0, 2);
      const expansionPrompt = `Is it more like ${randomAlts[0]} or ${randomAlts[1]}? Or something else entirely?`;

      return {
        isVague: true,
        expression: match[0],
        alternatives,
        category,
        expansionPrompt,
      };
    }
  }

  // Also track specific emotion words used
  trackEmotionWords(userId, userMessage);

  return { isVague: false };
}

/**
 * Track specific emotion words used
 */
function trackEmotionWords(userId: string, userMessage: string): void {
  const profile = getOrCreateProfile(userId);
  const lower = userMessage.toLowerCase();

  for (const category of Object.values(EMOTION_VOCABULARY)) {
    for (const emotion of category) {
      if (lower.includes(emotion.word)) {
        const count = profile.emotionWordsUsed.get(emotion.word) || 0;
        profile.emotionWordsUsed.set(emotion.word, count + 1);
      }
    }
  }

  profile.uniqueWordsCount = profile.emotionWordsUsed.size;
  updateGranularityScore(profile);
}

function updateGranularityScore(profile: GranularityProfile): void {
  // Score based on vocabulary diversity and usage
  const uniqueWords = profile.uniqueWordsCount;
  const vagueCount = profile.commonVagueExpressions.length;

  // Higher score = more granular
  const diversityBonus = Math.min(30, uniqueWords * 3);
  const vaguePenalty = Math.min(30, vagueCount);

  profile.granularityScore = Math.max(10, Math.min(100, 50 + diversityBonus - vaguePenalty));
  profile.lastUpdated = new Date();
}

/**
 * Record that user accepted vocabulary expansion
 */
export function recordExpansionAccepted(userId: string): void {
  const profile = getOrCreateProfile(userId);
  profile.expansionsAccepted++;
  profile.granularityScore = Math.min(100, profile.granularityScore + 2);
  log.debug({ userId }, '📚 Vocabulary expansion accepted');
}

/**
 * Record expansion opportunity
 */
export function recordExpansionOffered(userId: string): void {
  const profile = getOrCreateProfile(userId);
  profile.expansionOpportunities++;
}

// ============================================================================
// VOCABULARY SUGGESTIONS
// ============================================================================

/**
 * Get vocabulary suggestions for an emotion category
 */
export function getVocabularySuggestions(
  category: EmotionCategory,
  intensity?: 'low' | 'medium' | 'high'
): EmotionWord[] {
  const words = EMOTION_VOCABULARY[category] || [];

  if (intensity) {
    return words.filter((w) => w.intensity === intensity);
  }

  return words;
}

/**
 * Get a teaching moment about an emotion word
 */
export function getEmotionTeaching(word: string): string | null {
  for (const category of Object.values(EMOTION_VOCABULARY)) {
    const emotion = category.find((e) => e.word === word);
    if (emotion) {
      return `"${emotion.word}" - ${emotion.nuance}. It's ${emotion.intensity} intensity ${emotion.category}.`;
    }
  }
  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for emotional granularity
 */
export function buildGranularityContext(userId: string): string | null {
  const profile = granularityProfiles.get(userId);
  if (!profile) return null;

  const lines: string[] = [];

  if (profile.granularityScore < 40) {
    lines.push('[💭 EMOTIONAL VOCABULARY COACHING]');
    lines.push('This person tends to use vague emotional language.');
    lines.push('When they say "I feel bad/good/stressed":');
    lines.push('- Gently help them get more specific');
    lines.push('- "Is that more like X or Y?"');
    lines.push('- Model precise emotion language yourself');
  } else if (profile.granularityScore > 70) {
    lines.push('[💭 EMOTIONAL VOCABULARY]');
    lines.push('This person has good emotional vocabulary.');
    lines.push('Reflect their nuanced language back to them.');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

// ============================================================================
// STATS
// ============================================================================

export function getGranularityScore(userId: string): number {
  return getOrCreateProfile(userId).granularityScore;
}

export function getTopEmotionWords(
  userId: string,
  limit = 5
): Array<{ word: string; count: number }> {
  const profile = getOrCreateProfile(userId);
  return Array.from(profile.emotionWordsUsed.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportGranularityProfile(userId: string): GranularityProfile | null {
  const profile = granularityProfiles.get(userId);
  if (!profile) return null;

  // Convert Map to object for serialization
  return {
    ...profile,
    emotionWordsUsed: new Map(profile.emotionWordsUsed),
  };
}

export function importGranularityProfile(profile: GranularityProfile): void {
  profile.lastUpdated = new Date(profile.lastUpdated);
  profile.emotionWordsUsed = new Map(Object.entries(profile.emotionWordsUsed));
  granularityProfiles.set(profile.userId, profile);
  log.debug({ userId: profile.userId }, 'Imported granularity profile');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectVagueExpression,
  recordExpansionAccepted,
  recordExpansionOffered,
  getVocabularySuggestions,
  getEmotionTeaching,
  buildGranularityContext,
  getGranularityScore,
  getTopEmotionWords,
  exportGranularityProfile,
  importGranularityProfile,
};
