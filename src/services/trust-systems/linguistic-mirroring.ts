/**
 * Linguistic Mirroring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learn and mirror their vocabulary for deeper connection.
 * Ferni starts naturally using their phrases back to them.
 *
 * We use our words, not theirs. Ferni learns THEIR exact vocabulary:
 * - Their preferred terms for emotions ("freaking out" vs "anxious")
 * - Signature phrases they use often
 * - Words they avoid (might indicate discomfort)
 * - Speech patterns and formality level
 *
 * @module LinguisticMirroring
 */

import { createLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'LinguisticMirroring' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export type FormalityLevel = 'casual' | 'moderate' | 'formal';

export interface SignaturePhrase {
  phrase: string;
  frequency: number;
  contexts: string[];
  lastUsed: Date;
}

export interface AvoidedWord {
  word: string;
  inferredReason?: string;
  detectedAt: Date;
  confidenceAvoided: number;
}

export interface SpeechPatterns {
  avgSentenceLength: number;
  usesFillers: boolean; // "like", "you know"
  prefersContractions: boolean;
  formalityLevel: FormalityLevel;
  commonFillers: string[];
  paceIndicator: 'fast' | 'moderate' | 'slow';
}

export interface LinguisticProfile {
  userId: string;

  /** Their preferred terms for emotions */
  emotionVocabulary: Record<string, string[]>;

  /** Phrases they use often */
  signaturePhrases: SignaturePhrase[];

  /** Words they avoid (might indicate discomfort) */
  avoidedWords: AvoidedWord[];

  /** Speech patterns */
  speechPatterns: SpeechPatterns;

  /** Sample messages for learning */
  recentMessages: Array<{
    message: string;
    timestamp: Date;
    topic?: string;
  }>;

  updatedAt: Date;
}

// ============================================================================
// EMOTION MAPPING (standard terms to detect)
// ============================================================================

const STANDARD_EMOTIONS = [
  'happy',
  'sad',
  'angry',
  'anxious',
  'scared',
  'excited',
  'frustrated',
  'overwhelmed',
  'stressed',
  'tired',
  'confused',
  'grateful',
  'proud',
  'ashamed',
  'lonely',
  'hopeful',
  'peaceful',
  'content',
];

// Common alternative expressions for emotions
const EMOTION_ALTERNATIVES: Record<string, string[]> = {
  anxious: [
    'freaking out',
    'on edge',
    'wound up',
    'spinning',
    'spiraling',
    'worked up',
    'keyed up',
    'antsy',
  ],
  stressed: ['under pressure', 'stretched thin', 'maxed out', 'slammed', 'swamped', 'drowning'],
  sad: ['down', 'blue', 'bummed', 'low', 'gutted', 'heartbroken', 'crushed'],
  angry: ['pissed', 'furious', 'livid', 'ticked off', 'heated', 'fuming'],
  tired: ['exhausted', 'drained', 'wiped', 'burnt out', 'running on empty', 'beat'],
  happy: ['stoked', 'pumped', 'thrilled', 'over the moon', 'psyched', 'buzzing'],
  overwhelmed: ['drowning', 'buried', 'snowed under', 'in over my head', 'losing it'],
  scared: ['terrified', 'freaked', 'spooked', 'rattled', 'shaken'],
  confused: ['lost', 'all over the place', 'scattered', 'foggy', "can't think straight"],
  frustrated: ['fed up', 'at my wits end', 'over it', 'done', 'so done'],
};

// Common fillers
const FILLER_WORDS = [
  'like',
  'you know',
  'basically',
  'literally',
  'um',
  'uh',
  'so yeah',
  'I mean',
];

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

const profiles = new Map<string, LinguisticProfile>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Extract and record linguistic patterns from user message.
 */
export function recordLinguisticPatterns(
  userId: string,
  message: string,
  context?: { topic?: string; emotion?: string }
): void {
  let profile = profiles.get(userId);

  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  // Store message for analysis
  profile.recentMessages.push({
    message,
    timestamp: new Date(),
    topic: context?.topic,
  });

  // Keep last 100 messages
  if (profile.recentMessages.length > 100) {
    profile.recentMessages = profile.recentMessages.slice(-100);
  }

  // Extract emotion vocabulary
  extractEmotionVocabulary(message, profile, context?.emotion);

  // Extract signature phrases
  extractSignaturePhrases(message, profile);

  // Update speech patterns
  updateSpeechPatterns(message, profile);

  profile.updatedAt = new Date();
}

/**
 * Extract emotion vocabulary from message.
 */
function extractEmotionVocabulary(
  message: string,
  profile: LinguisticProfile,
  detectedEmotion?: string
): void {
  const lowerMessage = message.toLowerCase();

  // Look for alternative emotion expressions
  for (const [emotion, alternatives] of Object.entries(EMOTION_ALTERNATIVES)) {
    for (const alt of alternatives) {
      // Use word boundary check to prevent false positives like "bluegrass" matching "blue"
      // For multi-word phrases, use includes (they're specific enough)
      // For single words, require word boundaries
      const isMatch = alt.includes(' ')
        ? lowerMessage.includes(alt)
        : new RegExp(`\\b${alt}\\b`, 'i').test(lowerMessage);

      if (isMatch) {
        if (!profile.emotionVocabulary[emotion]) {
          profile.emotionVocabulary[emotion] = [];
        }
        if (!profile.emotionVocabulary[emotion].includes(alt)) {
          profile.emotionVocabulary[emotion].push(alt);
          log.debug({ userId: profile.userId, emotion, term: alt }, 'Learned emotion term');
        }
      }
    }
  }

  // If we detected an emotion and they used a specific phrase
  if (detectedEmotion) {
    // Look for the emotion expression in the message
    const emotionPatterns = [
      /I['']m\s+(\w+(?:\s+\w+)?)/i,
      /feeling\s+(\w+(?:\s+\w+)?)/i,
      /I\s+feel\s+(\w+(?:\s+\w+)?)/i,
      /so\s+(\w+)/i,
    ];

    for (const pattern of emotionPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const theirTerm = match[1].toLowerCase();
        // Don't record if it's a standard emotion word
        if (!STANDARD_EMOTIONS.includes(theirTerm)) {
          if (!profile.emotionVocabulary[detectedEmotion]) {
            profile.emotionVocabulary[detectedEmotion] = [];
          }
          if (!profile.emotionVocabulary[detectedEmotion].includes(theirTerm)) {
            profile.emotionVocabulary[detectedEmotion].push(theirTerm);
          }
        }
      }
    }
  }
}

/**
 * Extract signature phrases from message.
 */
function extractSignaturePhrases(message: string, profile: LinguisticProfile): void {
  // Look for repeated phrases across messages
  const minLength = 3;
  const maxLength = 6;

  const words = message.split(/\s+/);

  for (let len = minLength; len <= maxLength && len <= words.length; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words
        .slice(i, i + len)
        .join(' ')
        .toLowerCase();

      // Skip common phrases
      if (isCommonPhrase(phrase)) continue;

      // Check if this phrase appears in other messages
      const occurrences = profile.recentMessages.filter((m) =>
        m.message.toLowerCase().includes(phrase)
      ).length;

      if (occurrences >= 2) {
        const existing = profile.signaturePhrases.find((sp) => sp.phrase === phrase);
        if (existing) {
          existing.frequency = occurrences;
          existing.lastUsed = new Date();
        } else {
          profile.signaturePhrases.push({
            phrase,
            frequency: occurrences,
            contexts: [],
            lastUsed: new Date(),
          });
        }
      }
    }
  }

  // Keep top 20 phrases by frequency
  profile.signaturePhrases.sort((a, b) => b.frequency - a.frequency);
  profile.signaturePhrases = profile.signaturePhrases.slice(0, 20);
}

/**
 * Check if a phrase is too common to be a signature.
 */
function isCommonPhrase(phrase: string): boolean {
  const common = [
    'i think',
    'you know',
    'i mean',
    'kind of',
    'sort of',
    'i guess',
    "i don't know",
    'i just',
    'to be',
    'it was',
    'it is',
    'that was',
    'and then',
    'but then',
    'so then',
  ];
  return common.includes(phrase);
}

/**
 * Update speech pattern analysis.
 */
function updateSpeechPatterns(message: string, profile: LinguisticProfile): void {
  // Sentence length
  const sentences = message.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  // 🦀 Rust-accelerated word counting for each sentence
  const avgWords =
    sentences.reduce(
      (sum, s) => sum + (RUST_COUNTING_AVAILABLE ? countWordsRust(s) : s.split(/\s+/).length),
      0
    ) / (sentences.length || 1);

  // Weighted average with existing
  const oldAvg = profile.speechPatterns.avgSentenceLength;
  profile.speechPatterns.avgSentenceLength = oldAvg > 0 ? oldAvg * 0.8 + avgWords * 0.2 : avgWords;

  // Fillers
  const lowerMessage = message.toLowerCase();
  const fillerCount = FILLER_WORDS.filter((f) => lowerMessage.includes(f)).length;
  if (fillerCount > 0) {
    profile.speechPatterns.usesFillers = true;
    for (const filler of FILLER_WORDS) {
      if (lowerMessage.includes(filler) && !profile.speechPatterns.commonFillers.includes(filler)) {
        profile.speechPatterns.commonFillers.push(filler);
      }
    }
  }

  // Contractions
  const hasContractions =
    /['']/.test(message) && /(I['']m|don['']t|can['']t|won['']t|it['']s)/i.test(message);
  if (hasContractions) {
    profile.speechPatterns.prefersContractions = true;
  }

  // Formality (simple heuristic)
  const formalIndicators = ['would', 'could', 'perhaps', 'regarding', 'therefore'];
  const casualIndicators = ['gonna', 'wanna', 'kinda', 'gotta', 'yeah', 'nah', 'cool', 'awesome'];

  const formalCount = formalIndicators.filter((f) => lowerMessage.includes(f)).length;
  const casualCount = casualIndicators.filter((c) => lowerMessage.includes(c)).length;

  if (casualCount > formalCount + 1) {
    profile.speechPatterns.formalityLevel = 'casual';
  } else if (formalCount > casualCount + 1) {
    profile.speechPatterns.formalityLevel = 'formal';
  } else {
    profile.speechPatterns.formalityLevel = 'moderate';
  }
}

/**
 * Create empty profile.
 */
function createEmptyProfile(userId: string): LinguisticProfile {
  return {
    userId,
    emotionVocabulary: {},
    signaturePhrases: [],
    avoidedWords: [],
    speechPatterns: {
      avgSentenceLength: 0,
      usesFillers: false,
      prefersContractions: true, // Default assumption
      formalityLevel: 'moderate',
      commonFillers: [],
      paceIndicator: 'moderate',
    },
    recentMessages: [],
    updatedAt: new Date(),
  };
}

// ============================================================================
// RESPONSE ADAPTATION
// ============================================================================

/**
 * Adapt Ferni's response to match user's linguistic style.
 */
export function adaptResponseStyle(response: string, userId: string): string {
  const profile = profiles.get(userId);
  if (!profile) return response;

  let adapted = response;

  // Replace standard emotion words with their vocabulary
  for (const [emotion, theirTerms] of Object.entries(profile.emotionVocabulary)) {
    if (theirTerms.length > 0) {
      const theirTerm = theirTerms[0]; // Use their most common term
      const regex = new RegExp(`\\b${emotion}\\b`, 'gi');
      adapted = adapted.replace(regex, theirTerm);
    }
  }

  // Adjust formality
  if (profile.speechPatterns.formalityLevel === 'casual') {
    // Make more casual
    adapted = adapted.replace(/\bI would\b/gi, "I'd");
    adapted = adapted.replace(/\bYou are\b/gi, "You're");
    adapted = adapted.replace(/\bIt is\b/gi, "It's");
    adapted = adapted.replace(/\bDo not\b/gi, "Don't");
    adapted = adapted.replace(/\bCannot\b/gi, "Can't");
    adapted = adapted.replace(/\bWill not\b/gi, "Won't");
  } else if (profile.speechPatterns.formalityLevel === 'formal') {
    // Make more formal - expand contractions
    adapted = adapted.replace(/\bI'd\b/gi, 'I would');
    adapted = adapted.replace(/\bYou're\b/gi, 'You are');
    adapted = adapted.replace(/\bIt's\b/gi, 'It is');
    adapted = adapted.replace(/\bDon't\b/gi, 'Do not');
    adapted = adapted.replace(/\bCan't\b/gi, 'Cannot');
    adapted = adapted.replace(/\bWon't\b/gi, 'Will not');
  }

  return adapted;
}

/**
 * Get their preferred term for an emotion.
 */
export function getTheirWordFor(userId: string, emotion: string): string | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  const terms = profile.emotionVocabulary[emotion];
  return terms && terms.length > 0 ? terms[0] : null;
}

/**
 * Check if they avoid a word.
 */
export function isWordAvoided(userId: string, word: string): boolean {
  const profile = profiles.get(userId);
  if (!profile) return false;

  return profile.avoidedWords.some(
    (aw) => aw.word.toLowerCase() === word.toLowerCase() && aw.confidenceAvoided > 0.6
  );
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export function buildLinguisticContext(userId: string): string {
  const profile = profiles.get(userId);
  if (!profile) return '';

  const sections: string[] = ['[LINGUISTIC MIRRORING]'];

  // Emotion vocabulary
  const emotionTerms = Object.entries(profile.emotionVocabulary).filter(
    ([_, terms]) => terms.length > 0
  );
  if (emotionTerms.length > 0) {
    sections.push('Their emotion vocabulary:');
    for (const [emotion, terms] of emotionTerms.slice(0, 5)) {
      sections.push(`- For "${emotion}" they say: "${terms[0]}"`);
    }
    sections.push('');
  }

  // Signature phrases
  if (profile.signaturePhrases.length > 0) {
    sections.push('Their signature phrases:');
    for (const phrase of profile.signaturePhrases.slice(0, 3)) {
      sections.push(`- "${phrase.phrase}" (used ${phrase.frequency} times)`);
    }
    sections.push('Consider naturally echoing these phrases back.');
    sections.push('');
  }

  // Avoided words
  if (profile.avoidedWords.length > 0) {
    const avoidList = profile.avoidedWords
      .filter((aw) => aw.confidenceAvoided > 0.6)
      .map((aw) => aw.word)
      .slice(0, 5);
    if (avoidList.length > 0) {
      sections.push(`Words to avoid: ${avoidList.join(', ')}`);
      sections.push('');
    }
  }

  // Speech style
  sections.push(`Formality level: ${profile.speechPatterns.formalityLevel}`);
  if (profile.speechPatterns.usesFillers) {
    sections.push(
      `They use fillers like: ${profile.speechPatterns.commonFillers.slice(0, 3).join(', ')}`
    );
  }

  sections.push('');
  sections.push('Mirror their language style. Use their words, not generic terms.');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

let store: PersistenceStore<LinguisticProfile> | null = null;

function getStore(): PersistenceStore<LinguisticProfile> {
  if (!store) {
    store = createPersistenceStore<LinguisticProfile>({
      collection: 'linguistic_profiles',
    });
  }
  return store;
}

/**
 * Get profile for user.
 */
export function getLinguisticProfile(userId: string): LinguisticProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Save profile to Firestore.
 */
export async function saveLinguisticProfile(userId: string): Promise<void> {
  const profile = profiles.get(userId);
  if (!profile) return;

  try {
    await getStore().setImmediate(userId, profile);
    log.debug({ userId }, 'Saved linguistic profile');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to save linguistic profile');
  }
}

/**
 * Load profile from Firestore.
 */
export async function loadLinguisticProfile(userId: string): Promise<void> {
  try {
    const profile = await getStore().load(userId);
    if (profile) {
      profiles.set(userId, profile);
      log.debug({ userId }, 'Loaded linguistic profile');
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load linguistic profile');
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const linguisticMirroring = {
  recordLinguisticPatterns,
  adaptResponseStyle,
  getTheirWordFor,
  isWordAvoided,
  buildLinguisticContext,
  getLinguisticProfile,
  saveLinguisticProfile,
  loadLinguisticProfile,
};

export default linguisticMirroring;
