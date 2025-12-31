/**
 * Emotional Vocabulary Expansion - Better Than Human EQ Development
 *
 * Helps users develop emotional intelligence by:
 * - Recognizing when they use vague emotion words ("bad", "fine", "stressed")
 * - Offering more precise alternatives
 * - Building their emotional vocabulary over time
 * - Tracking which emotions they commonly experience
 *
 * WHY IT'S SUPERHUMAN: Helps users name feelings more precisely than
 * any human friend would, developing their long-term emotional intelligence.
 *
 * @module services/superhuman/emotional-vocabulary
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onEmotionalPatternChange } from '../data-layer/hooks/wisdom-hooks.js';

const log = createLogger({ module: 'EmotionalVocabulary' });

// ============================================================================
// TYPES
// ============================================================================

export type EmotionCategory =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation';

export interface EmotionWord {
  word: string;
  category: EmotionCategory;
  intensity: 'low' | 'medium' | 'high';
  nuance: string;
}

export interface VagueEmotionMapping {
  vagueWord: string;
  possibleMeanings: EmotionWord[];
  clarifyingQuestion: string;
}

export interface EmotionUsageRecord {
  userId: string;
  emotionWord: string;
  category: EmotionCategory;
  context?: string;
  timestamp: number;
}

export interface EmotionalVocabularyProfile {
  userId: string;
  /** Emotions they use frequently */
  frequentEmotions: Map<string, number>;
  /** Emotions they rarely name */
  underusedCategories: EmotionCategory[];
  /** Vocabulary richness score */
  vocabularyScore: number;
  /** Suggested expansions */
  suggestedExpansions: string[];
  /** Last updated */
  lastUpdated: number;
}

// ============================================================================
// EMOTION DICTIONARY
// ============================================================================

const EMOTION_DICTIONARY: EmotionWord[] = [
  // Joy spectrum
  { word: 'content', category: 'joy', intensity: 'low', nuance: 'Peaceful satisfaction' },
  {
    word: 'pleased',
    category: 'joy',
    intensity: 'low',
    nuance: 'Mild happiness from something working out',
  },
  { word: 'happy', category: 'joy', intensity: 'medium', nuance: 'General positive state' },
  {
    word: 'delighted',
    category: 'joy',
    intensity: 'medium',
    nuance: 'Pleasantly surprised happiness',
  },
  { word: 'joyful', category: 'joy', intensity: 'high', nuance: 'Deep, radiating happiness' },
  { word: 'ecstatic', category: 'joy', intensity: 'high', nuance: 'Overwhelming joy' },
  {
    word: 'grateful',
    category: 'joy',
    intensity: 'medium',
    nuance: 'Appreciation-based happiness',
  },
  { word: 'proud', category: 'joy', intensity: 'medium', nuance: 'Satisfaction from achievement' },

  // Sadness spectrum
  { word: 'disappointed', category: 'sadness', intensity: 'low', nuance: 'Expectations not met' },
  {
    word: 'melancholic',
    category: 'sadness',
    intensity: 'low',
    nuance: 'Gentle, reflective sadness',
  },
  { word: 'sad', category: 'sadness', intensity: 'medium', nuance: 'General unhappiness' },
  { word: 'grief-stricken', category: 'sadness', intensity: 'high', nuance: 'Deep loss' },
  { word: 'heartbroken', category: 'sadness', intensity: 'high', nuance: 'Emotional devastation' },
  { word: 'lonely', category: 'sadness', intensity: 'medium', nuance: 'Missing connection' },
  { word: 'homesick', category: 'sadness', intensity: 'medium', nuance: 'Missing a place or time' },
  { word: 'empty', category: 'sadness', intensity: 'medium', nuance: 'Void, lack of feeling' },

  // Anger spectrum
  { word: 'annoyed', category: 'anger', intensity: 'low', nuance: 'Mild irritation' },
  { word: 'frustrated', category: 'anger', intensity: 'medium', nuance: 'Blocked from goal' },
  { word: 'irritated', category: 'anger', intensity: 'low', nuance: 'Surface-level bothered' },
  { word: 'angry', category: 'anger', intensity: 'medium', nuance: 'General displeasure' },
  { word: 'furious', category: 'anger', intensity: 'high', nuance: 'Intense anger' },
  { word: 'resentful', category: 'anger', intensity: 'medium', nuance: 'Lingering bitter anger' },
  {
    word: 'indignant',
    category: 'anger',
    intensity: 'medium',
    nuance: 'Righteous anger at unfairness',
  },

  // Fear spectrum
  { word: 'uneasy', category: 'fear', intensity: 'low', nuance: 'Slight discomfort' },
  { word: 'worried', category: 'fear', intensity: 'low', nuance: 'Concern about future' },
  { word: 'anxious', category: 'fear', intensity: 'medium', nuance: 'Pervasive worry' },
  { word: 'nervous', category: 'fear', intensity: 'medium', nuance: 'Anticipatory fear' },
  { word: 'scared', category: 'fear', intensity: 'medium', nuance: 'Present danger feeling' },
  { word: 'terrified', category: 'fear', intensity: 'high', nuance: 'Overwhelming fear' },
  { word: 'panicked', category: 'fear', intensity: 'high', nuance: 'Loss of control from fear' },
  {
    word: 'dread',
    category: 'fear',
    intensity: 'medium',
    nuance: 'Heavy anticipation of something bad',
  },

  // Other categories
  { word: 'overwhelmed', category: 'fear', intensity: 'medium', nuance: 'Too much at once' },
  { word: 'exhausted', category: 'sadness', intensity: 'medium', nuance: 'Depleted beyond tired' },
  { word: 'ashamed', category: 'sadness', intensity: 'medium', nuance: 'Painful self-judgment' },
  { word: 'guilty', category: 'sadness', intensity: 'medium', nuance: 'Regret about actions' },
  { word: 'embarrassed', category: 'fear', intensity: 'low', nuance: 'Social discomfort' },
  { word: 'jealous', category: 'anger', intensity: 'medium', nuance: 'Wanting what others have' },
  { word: 'envious', category: 'anger', intensity: 'low', nuance: 'Milder jealousy' },
  {
    word: 'hopeful',
    category: 'anticipation',
    intensity: 'medium',
    nuance: 'Positive expectation',
  },
  { word: 'curious', category: 'anticipation', intensity: 'low', nuance: 'Wanting to know more' },
  { word: 'excited', category: 'anticipation', intensity: 'high', nuance: 'Eager anticipation' },
  {
    word: 'conflicted',
    category: 'fear',
    intensity: 'medium',
    nuance: 'Pulled in multiple directions',
  },
  { word: 'ambivalent', category: 'fear', intensity: 'low', nuance: 'Mixed feelings' },
];

// ============================================================================
// VAGUE WORD MAPPINGS
// ============================================================================

const VAGUE_WORD_MAPPINGS: VagueEmotionMapping[] = [
  {
    vagueWord: 'bad',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['disappointed', 'sad', 'guilty', 'ashamed', 'frustrated', 'anxious'].includes(e.word)
    ),
    clarifyingQuestion:
      'When you say "bad," is it more like disappointed, sad, guilty, or something else?',
  },
  {
    vagueWord: 'fine',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['content', 'neutral', 'numb', 'resigned', 'disconnected'].includes(e.word)
    ),
    clarifyingQuestion:
      'What does "fine" feel like right now? Content, neutral, or maybe holding something back?',
  },
  {
    vagueWord: 'stressed',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['overwhelmed', 'anxious', 'frustrated', 'exhausted', 'worried'].includes(e.word)
    ),
    clarifyingQuestion: 'Is the stress more like overwhelm, anxiety, frustration, or exhaustion?',
  },
  {
    vagueWord: 'good',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['content', 'happy', 'grateful', 'proud', 'relieved', 'hopeful'].includes(e.word)
    ),
    clarifyingQuestion: 'What kind of good? Content, proud, grateful, or something else?',
  },
  {
    vagueWord: 'upset',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['hurt', 'angry', 'disappointed', 'sad', 'frustrated'].includes(e.word)
    ),
    clarifyingQuestion: 'Is upset leaning more toward hurt, angry, disappointed, or sad?',
  },
  {
    vagueWord: 'okay',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['neutral', 'content', 'resigned', 'numb'].includes(e.word)
    ),
    clarifyingQuestion: 'Is okay meaning "actually fine" or "getting by"?',
  },
  {
    vagueWord: 'weird',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['confused', 'uneasy', 'disconnected', 'conflicted', 'ambivalent'].includes(e.word)
    ),
    clarifyingQuestion: 'Weird in what way? Confused, uneasy, or hard to put your finger on?',
  },
  {
    vagueWord: 'down',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['sad', 'melancholic', 'disappointed', 'empty', 'lonely'].includes(e.word)
    ),
    clarifyingQuestion: 'Is down more like sad, empty, lonely, or disappointed?',
  },
  {
    vagueWord: 'off',
    possibleMeanings: EMOTION_DICTIONARY.filter((e) =>
      ['uneasy', 'disconnected', 'anxious', 'confused'].includes(e.word)
    ),
    clarifyingQuestion: "Off as in uneasy, disconnected, or something you can't quite name?",
  },
];

// ============================================================================
// DETECTION & EXPANSION
// ============================================================================

/**
 * Detect vague emotion words in text and offer expansions.
 */
export function detectVagueEmotions(text: string): VagueEmotionMapping[] {
  const textLower = text.toLowerCase();
  const detected: VagueEmotionMapping[] = [];

  for (const mapping of VAGUE_WORD_MAPPINGS) {
    // Check for "I feel [vague]" or "I'm [vague]" or just "[vague]" at sentence boundaries
    const patterns = [
      new RegExp(`\\bi(?:'m| am| feel)\\s+${mapping.vagueWord}\\b`, 'i'),
      new RegExp(`\\bfeeling\\s+${mapping.vagueWord}\\b`, 'i'),
      new RegExp(`\\b${mapping.vagueWord}\\b`, 'i'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(textLower)) {
        detected.push(mapping);
        break;
      }
    }
  }

  return detected;
}

/**
 * Get suggested emotion words based on context.
 */
export function suggestPreciseEmotions(
  category: EmotionCategory,
  intensityHint?: 'low' | 'medium' | 'high'
): EmotionWord[] {
  let candidates = EMOTION_DICTIONARY.filter((e) => e.category === category);

  if (intensityHint) {
    // Prioritize matching intensity but include others
    candidates = [
      ...candidates.filter((e) => e.intensity === intensityHint),
      ...candidates.filter((e) => e.intensity !== intensityHint),
    ];
  }

  return candidates.slice(0, 5);
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record an emotion word usage.
 */
export async function recordEmotionUsage(
  userId: string,
  emotionWord: string,
  context?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const emotion = EMOTION_DICTIONARY.find(
    (e) => e.word.toLowerCase() === emotionWord.toLowerCase()
  );
  if (!emotion) return;

  const record: EmotionUsageRecord = {
    userId,
    emotionWord: emotion.word,
    category: emotion.category,
    context,
    timestamp: Date.now(),
  };

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('emotion_vocabulary')
      .add(cleanForFirestore(record));

    // Index emotional vocabulary usage for pattern detection
    const positiveCategories = ['joy', 'love', 'surprise'];
    const negativeCategories = ['sadness', 'anger', 'fear', 'disgust'];
    const impact = positiveCategories.includes(emotion.category)
      ? 'positive'
      : negativeCategories.includes(emotion.category)
        ? 'negative'
        : 'mixed';

    void onEmotionalPatternChange(
      userId,
      docRef.id,
      {
        pattern: `Uses "${emotionWord}" to express ${emotion.category} emotions`,
        triggers: context ? [context] : [],
        frequency: 'occasional',
        impact,
        awareness: 'moderate',
      },
      'create'
    );

    log.debug({ userId, emotionWord }, 'Recorded emotion usage');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record emotion');
  }
}

/**
 * Load emotion usage history.
 */
export async function loadEmotionHistory(
  userId: string,
  daysBack = 90
): Promise<EmotionUsageRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('emotion_vocabulary')
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(300)
      .get();

    return snapshot.docs.map((doc) => doc.data() as EmotionUsageRecord);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load emotion history');
    return [];
  }
}

// ============================================================================
// PROFILE ANALYSIS
// ============================================================================

/**
 * Analyze user's emotional vocabulary.
 */
export async function analyzeVocabularyProfile(
  userId: string
): Promise<EmotionalVocabularyProfile> {
  const history = await loadEmotionHistory(userId, 90);

  // Count emotion usage
  const frequentEmotions = new Map<string, number>();
  const categoryUsage = new Map<EmotionCategory, number>();

  for (const record of history) {
    frequentEmotions.set(record.emotionWord, (frequentEmotions.get(record.emotionWord) || 0) + 1);
    categoryUsage.set(record.category, (categoryUsage.get(record.category) || 0) + 1);
  }

  // Find underused categories
  const allCategories: EmotionCategory[] = [
    'joy',
    'sadness',
    'anger',
    'fear',
    'surprise',
    'disgust',
    'trust',
    'anticipation',
  ];
  const underusedCategories = allCategories.filter((cat) => {
    const usage = categoryUsage.get(cat) || 0;
    return usage < 2;
  });

  // Calculate vocabulary richness (unique words / total uses)
  const uniqueWords = frequentEmotions.size;
  const totalUses = history.length;
  const vocabularyScore = totalUses > 0 ? Math.min(uniqueWords / Math.sqrt(totalUses), 1) : 0;

  // Suggest expansions
  const suggestedExpansions: string[] = [];
  for (const category of underusedCategories) {
    const suggestions = EMOTION_DICTIONARY.filter(
      (e) => e.category === category && e.intensity === 'medium'
    )
      .slice(0, 2)
      .map((e) => e.word);
    suggestedExpansions.push(...suggestions);
  }

  return {
    userId,
    frequentEmotions,
    underusedCategories,
    vocabularyScore,
    suggestedExpansions: suggestedExpansions.slice(0, 5),
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection when vague emotions detected.
 */
export function buildVagueEmotionContext(detectedVague: VagueEmotionMapping[]): string {
  if (detectedVague.length === 0) return '';

  const sections: string[] = [];
  sections.push('[EMOTIONAL VOCABULARY SUPPORT]');
  sections.push('Help them name their feelings more precisely.\n');

  for (const vague of detectedVague.slice(0, 2)) {
    sections.push(`💬 They said "${vague.vagueWord}". Consider asking:`);
    sections.push(`   "${vague.clarifyingQuestion}"`);
    sections.push(
      `   Possible meanings: ${vague.possibleMeanings
        .slice(0, 4)
        .map((e) => e.word)
        .join(', ')}`
    );
    sections.push('');
  }

  sections.push('Helping them name feelings precisely builds emotional intelligence over time.');

  return sections.join('\n');
}

/**
 * Build general vocabulary context.
 */
export async function buildVocabularyContext(userId: string): Promise<string> {
  const profile = await analyzeVocabularyProfile(userId);

  if (profile.vocabularyScore > 0.7) {
    return ''; // Already has rich vocabulary
  }

  const sections: string[] = [];

  if (profile.underusedCategories.length > 2) {
    sections.push('[EMOTIONAL VOCABULARY NOTE]');
    sections.push(
      `This person rarely names ${profile.underusedCategories.slice(0, 2).join(' or ')}-related emotions. ` +
        `If relevant, help them explore these areas of their emotional landscape.`
    );
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionalVocabulary = {
  detect: detectVagueEmotions,
  suggest: suggestPreciseEmotions,
  record: recordEmotionUsage,
  loadHistory: loadEmotionHistory,
  analyzeProfile: analyzeVocabularyProfile,
  buildVagueContext: buildVagueEmotionContext,
  buildContext: buildVocabularyContext,
  dictionary: EMOTION_DICTIONARY,
};
