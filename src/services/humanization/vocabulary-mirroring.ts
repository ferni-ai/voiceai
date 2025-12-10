/**
 * Dynamic Vocabulary Mirroring
 *
 * Learns and naturally adopts the user's language patterns:
 * - Unique words they use ("recalibrate", "basically", "vibes")
 * - Their descriptors ("it's like...", "kind of...")
 * - Their emotional vocabulary ("overwhelmed", "stuck")
 * - Their intensity markers ("super", "literally", "so")
 *
 * When Ferni mirrors their vocabulary naturally, it creates:
 * - "They really get me" feeling
 * - Subliminal rapport building
 * - Authentic connection without being creepy
 *
 * "You said you felt 'recalibrating' - I love that word. That's exactly what this is."
 *
 * @module @ferni/vocabulary-mirroring
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'VocabularyMirroring' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A tracked vocabulary item
 */
export interface VocabItem {
  word: string;
  category: VocabCategory;
  frequency: number;
  firstSeen: number;
  lastSeen: number;
  contexts: string[];

  /** Whether Ferni has mirrored this word */
  mirrored: boolean;

  /** How many times Ferni has used it */
  mirrorCount: number;

  /** Whether the user responded positively when mirrored */
  mirrorLanded?: boolean;
}

export type VocabCategory =
  | 'emotional' // "overwhelmed", "anxious", "pumped"
  | 'descriptor' // "it's like...", "kind of..."
  | 'intensifier' // "super", "literally", "so"
  | 'filler' // "basically", "you know", "honestly"
  | 'unique' // Distinctive words they use
  | 'metaphor' // Their go-to metaphors
  | 'self_reference' // How they refer to themselves
  | 'other_reference'; // How they refer to others

/**
 * User's vocabulary profile
 */
export interface VocabProfile {
  userId: string;
  items: VocabItem[];

  /** Their communication style indicators */
  style: {
    formalityLevel: 'formal' | 'casual' | 'mixed';
    intensityLevel: 'low' | 'moderate' | 'high';
    metaphorFrequency: 'rare' | 'occasional' | 'frequent';
    fillerFrequency: 'rare' | 'occasional' | 'frequent';
  };

  /** Last updated */
  updatedAt: number;
}

/**
 * Context for vocabulary analysis
 */
export interface VocabAnalysisContext {
  userMessage: string;
  turn: number;
  emotion?: string;
  topic?: string;
}

/**
 * Mirroring opportunity
 */
export interface MirrorOpportunity {
  word: string;
  category: VocabCategory;
  suggestion: string;
  confidence: number;
}

// ============================================================================
// PATTERNS FOR VOCABULARY EXTRACTION
// ============================================================================

const VOCAB_PATTERNS: Record<VocabCategory, RegExp[]> = {
  emotional: [
    /i (?:feel|felt|am|was|'m) (\w+)/gi,
    /(?:feeling|felt) (?:so |really |very )?(\w+)/gi,
    /it makes me (\w+)/gi,
    /i get (\w+) when/gi,
  ],

  descriptor: [
    /it's (?:like|kind of|sort of) (\w+)/gi,
    /(?:pretty|quite|rather) (\w+)/gi,
    /(\w+(?:ish|y|ful|less))\b/gi,
  ],

  intensifier: [
    /\b(super|literally|totally|absolutely|completely|extremely)\b/gi,
    /\b(so|really|very|incredibly|insanely)\b/gi,
  ],

  filler: [
    /\b(basically|honestly|actually|obviously|clearly)\b/gi,
    /\b(you know|i mean|like|kind of|sort of)\b/gi,
  ],

  unique: [
    // Multi-syllable words that aren't common
    /\b([a-z]{8,})\b/gi,
    // Compound-style words
    /\b(\w+-\w+)\b/gi,
    // Words ending in unique suffixes
    /\b(\w+(?:ization|fulness|ability|ivity))\b/gi,
  ],

  metaphor: [/(?:like|as if) (?:a |an )?(\w+ \w+)/gi, /(?:it's|feels like) (?:a |an )?(\w+ \w+)/gi],

  self_reference: [/\bi (?:always|never|usually|tend to|often) (\w+)/gi, /\b(my \w+|myself)/gi],

  other_reference: [
    /\bthey (?:always|never|usually) (\w+)/gi,
    /\bpeople (?:always|never|usually) (\w+)/gi,
  ],
};

/**
 * Common words to ignore
 */
const IGNORE_WORDS = new Set([
  'the',
  'and',
  'but',
  'for',
  'not',
  'with',
  'you',
  'this',
  'that',
  'have',
  'from',
  'they',
  'say',
  'she',
  'will',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'out',
  'about',
  'who',
  'get',
  'which',
  'when',
  'make',
  'can',
  'like',
  'time',
  'just',
  'him',
  'know',
  'take',
  'people',
  'into',
  'year',
  'your',
  'good',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'new',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'been',
  'thing',
  'things',
  'yeah',
  'okay',
  'really',
  'something',
  'nothing',
  'everything',
  'anything',
  'going',
  'doing',
  'being',
  'having',
]);

// ============================================================================
// VOCABULARY PROFILE MANAGEMENT
// ============================================================================

const userProfiles = new Map<string, VocabProfile>();

/**
 * Get or create vocabulary profile for a user
 */
export function getOrCreateProfile(userId: string): VocabProfile {
  if (!userProfiles.has(userId)) {
    userProfiles.set(userId, {
      userId,
      items: [],
      style: {
        formalityLevel: 'mixed',
        intensityLevel: 'moderate',
        metaphorFrequency: 'occasional',
        fillerFrequency: 'occasional',
      },
      updatedAt: Date.now(),
    });
  }
  return userProfiles.get(userId)!;
}

/**
 * Analyze a message for vocabulary
 */
export function analyzeVocabulary(userId: string, context: VocabAnalysisContext): VocabItem[] {
  const profile = getOrCreateProfile(userId);
  const { userMessage, topic } = context;
  const newItems: VocabItem[] = [];
  const foundWords = new Set<string>();

  // Extract vocabulary by category
  for (const [category, patterns] of Object.entries(VOCAB_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = userMessage.matchAll(pattern);
      for (const match of matches) {
        const word = (match[1] || match[0]).toLowerCase().trim();

        // Skip if already found, too short, or common
        if (foundWords.has(word) || word.length < 3 || IGNORE_WORDS.has(word)) {
          continue;
        }

        foundWords.add(word);

        // Check if word already exists in profile
        const existing = profile.items.find((item) => item.word.toLowerCase() === word);

        if (existing) {
          // Update existing
          existing.frequency++;
          existing.lastSeen = Date.now();
          if (topic && !existing.contexts.includes(topic)) {
            existing.contexts.push(topic);
            if (existing.contexts.length > 5) {
              existing.contexts = existing.contexts.slice(-5);
            }
          }
        } else {
          // Add new
          const item: VocabItem = {
            word,
            category: category as VocabCategory,
            frequency: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            contexts: topic ? [topic] : [],
            mirrored: false,
            mirrorCount: 0,
          };
          profile.items.push(item);
          newItems.push(item);
        }
      }
    }
  }

  // Update style indicators
  updateStyleIndicators(profile, userMessage);

  // Cap profile size
  if (profile.items.length > 200) {
    // Keep highest frequency items
    profile.items.sort((a, b) => b.frequency - a.frequency);
    profile.items = profile.items.slice(0, 200);
  }

  profile.updatedAt = Date.now();

  if (newItems.length > 0) {
    logger.debug({ userId, newWords: newItems.map((i) => i.word) }, 'Learned new vocabulary');
  }

  return newItems;
}

/**
 * Update style indicators based on message
 */
function updateStyleIndicators(profile: VocabProfile, message: string): void {
  const lower = message.toLowerCase();

  // Formality
  const formalMarkers = /\b(therefore|however|furthermore|regarding|additionally)\b/gi;
  const casualMarkers = /\b(gonna|wanna|kinda|sorta|yeah|nah|yep|nope|lol|haha)\b/gi;

  const formalCount = (lower.match(formalMarkers) || []).length;
  const casualCount = (lower.match(casualMarkers) || []).length;

  if (formalCount > casualCount) {
    profile.style.formalityLevel = 'formal';
  } else if (casualCount > formalCount) {
    profile.style.formalityLevel = 'casual';
  }

  // Intensity
  const intensifierCount = (
    lower.match(/\b(super|literally|totally|absolutely|extremely|so|really|very)\b/gi) || []
  ).length;
  const wordCount = message.split(/\s+/).length;
  const intensityRatio = intensifierCount / wordCount;

  if (intensityRatio > 0.1) {
    profile.style.intensityLevel = 'high';
  } else if (intensityRatio < 0.03) {
    profile.style.intensityLevel = 'low';
  } else {
    profile.style.intensityLevel = 'moderate';
  }

  // Filler frequency
  const fillerCount = (
    lower.match(/\b(basically|honestly|actually|you know|i mean|like)\b/gi) || []
  ).length;
  const fillerRatio = fillerCount / wordCount;

  if (fillerRatio > 0.08) {
    profile.style.fillerFrequency = 'frequent';
  } else if (fillerRatio < 0.02) {
    profile.style.fillerFrequency = 'rare';
  } else {
    profile.style.fillerFrequency = 'occasional';
  }
}

// ============================================================================
// MIRRORING LOGIC
// ============================================================================

/**
 * Get vocabulary to mirror in a response
 */
export function getMirrorOpportunities(
  userId: string,
  responseContext: {
    emotion?: string;
    topic?: string;
    isVulnerable?: boolean;
  },
  maxOpportunities = 2
): MirrorOpportunity[] {
  const profile = getOrCreateProfile(userId);
  const opportunities: MirrorOpportunity[] = [];

  // Score each unmimicked item
  const candidates = profile.items
    .filter((item) => {
      // Prefer items not yet mirrored
      if (item.mirrored && item.mirrorCount > 2) return false;
      // Need some frequency
      if (item.frequency < 2) return false;
      return true;
    })
    .map((item) => {
      let score = 0;

      // Frequency bonus
      score += Math.min(item.frequency * 5, 25);

      // Recency bonus
      const hoursSinceUsed = (Date.now() - item.lastSeen) / (1000 * 60 * 60);
      if (hoursSinceUsed < 1) score += 20;
      else if (hoursSinceUsed < 24) score += 10;

      // Category bonuses
      if (item.category === 'emotional' && responseContext.isVulnerable) {
        score += 25;
      }
      if (item.category === 'unique') {
        score += 15; // Unique words are great for mirroring
      }
      if (item.category === 'metaphor') {
        score += 20;
      }

      // Context match
      if (responseContext.topic && item.contexts.includes(responseContext.topic)) {
        score += 15;
      }

      // Not yet mirrored bonus
      if (!item.mirrored) {
        score += 20;
      }

      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  // Build opportunities
  for (const { item, score } of candidates.slice(0, maxOpportunities)) {
    const suggestion = buildMirrorSuggestion(item, profile.style);

    opportunities.push({
      word: item.word,
      category: item.category,
      suggestion,
      confidence: Math.min(score / 100, 1),
    });
  }

  return opportunities;
}

/**
 * Build a natural mirroring suggestion
 */
function buildMirrorSuggestion(item: VocabItem, style: VocabProfile['style']): string {
  const { word, category } = item;

  switch (category) {
    case 'emotional':
      return `Use "${word}" to describe a similar feeling`;

    case 'descriptor':
      return `Adopt "${word}" as a descriptor`;

    case 'intensifier':
      if (style.intensityLevel === 'high') {
        return `Use "${word}" for emphasis`;
      }
      return `Echo their intensity with "${word}"`;

    case 'unique':
      return `Incorporate "${word}" naturally - they coined it, honor it`;

    case 'metaphor':
      return `Reference their metaphor: "${word}"`;

    case 'filler':
      if (style.fillerFrequency === 'frequent') {
        return `Match their rhythm with "${word}"`;
      }
      return `Skip - their filler, not needed`;

    default:
      return `Use "${word}" if it fits naturally`;
  }
}

/**
 * Generate mirroring phrases
 */
export function generateMirrorPhrase(
  word: string,
  category: VocabCategory,
  _context: { topic?: string; emotion?: string }
): string[] {
  switch (category) {
    case 'emotional':
      return [
        `I hear that "${word}" feeling.`,
        `"${word}" - that's exactly the right word.`,
        `That ${word} energy makes sense.`,
      ];

    case 'unique':
      return [
        `I love that - "${word}."`,
        `"${word}" - I might steal that.`,
        `That's such a good way to put it - ${word}.`,
      ];

    case 'metaphor':
      return [`That image of "${word}" - I can see it.`, `Like you said, "${word}."`];

    case 'intensifier':
      return [`${word.charAt(0).toUpperCase() + word.slice(1)}.`, `That's ${word} what it is.`];

    default:
      return [`"${word}" - yes.`];
  }
}

/**
 * Mark that Ferni mirrored a word
 */
export function markWordMirrored(userId: string, word: string, landed?: boolean): void {
  const profile = getOrCreateProfile(userId);

  const item = profile.items.find((i) => i.word.toLowerCase() === word.toLowerCase());

  if (item) {
    item.mirrored = true;
    item.mirrorCount++;
    if (landed !== undefined) {
      item.mirrorLanded = landed;
    }

    logger.debug(
      { userId, word, mirrorCount: item.mirrorCount, landed },
      'Marked word as mirrored'
    );
  }
}

/**
 * Check if a word should be mirrored
 */
export function shouldMirrorWord(
  userId: string,
  word: string
): { should: boolean; reason: string } {
  const profile = getOrCreateProfile(userId);

  const item = profile.items.find((i) => i.word.toLowerCase() === word.toLowerCase());

  if (!item) {
    return { should: false, reason: 'Word not in vocabulary profile' };
  }

  // Don't over-mirror
  if (item.mirrorCount > 3) {
    return { should: false, reason: 'Already mirrored enough' };
  }

  // Don't mirror if it didn't land before
  if (item.mirrorLanded === false) {
    return { should: false, reason: "Didn't land last time" };
  }

  // Mirror if frequent enough
  if (item.frequency >= 2) {
    return { should: true, reason: `Used ${item.frequency} times` };
  }

  return { should: false, reason: 'Not frequent enough yet' };
}

/**
 * Get the user's communication style
 */
export function getUserStyle(userId: string): VocabProfile['style'] | null {
  const profile = userProfiles.get(userId);
  return profile?.style || null;
}

/**
 * Get top vocabulary for a user
 */
export function getTopVocabulary(
  userId: string,
  category?: VocabCategory,
  limit = 10
): VocabItem[] {
  const profile = userProfiles.get(userId);
  if (!profile) return [];

  let items = profile.items;

  if (category) {
    items = items.filter((i) => i.category === category);
  }

  return items.sort((a, b) => b.frequency - a.frequency).slice(0, limit);
}

/**
 * Get profile summary for context injection
 */
export function getVocabSummary(userId: string): {
  topWords: string[];
  style: string;
  mirrorReady: string[];
} {
  const profile = userProfiles.get(userId);

  if (!profile) {
    return {
      topWords: [],
      style: 'unknown',
      mirrorReady: [],
    };
  }

  const topWords = profile.items
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5)
    .map((i) => i.word);

  const style = [
    profile.style.formalityLevel,
    `${profile.style.intensityLevel} intensity`,
    profile.style.fillerFrequency === 'frequent' ? 'uses fillers' : '',
  ]
    .filter(Boolean)
    .join(', ');

  const mirrorReady = profile.items
    .filter((i) => i.frequency >= 2 && !i.mirrored)
    .slice(0, 3)
    .map((i) => i.word);

  return { topWords, style, mirrorReady };
}

/**
 * Clear user profile (for testing)
 */
export function clearUserProfile(userId: string): void {
  userProfiles.delete(userId);
}

/**
 * Clear all profiles (for testing)
 */
export function clearAllProfiles(): void {
  userProfiles.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const vocabularyMirroring = {
  // Profile management
  getProfile: getOrCreateProfile,
  analyze: analyzeVocabulary,

  // Mirroring
  getOpportunities: getMirrorOpportunities,
  generatePhrase: generateMirrorPhrase,
  shouldMirror: shouldMirrorWord,
  markMirrored: markWordMirrored,

  // Queries
  getStyle: getUserStyle,
  getTopVocab: getTopVocabulary,
  getSummary: getVocabSummary,

  // Testing
  clearUser: clearUserProfile,
  clearAll: clearAllProfiles,
};

export default vocabularyMirroring;
