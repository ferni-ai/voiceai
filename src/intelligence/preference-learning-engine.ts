/**
 * Preference Learning Engine
 *
 * Tracks and learns user preferences over time from conversation patterns.
 * This enables "Better Than Human" by building a comprehensive preference profile
 * that no human friend could consistently maintain.
 *
 * Key Features:
 * 1. Implicit preference detection ("I love..." vs "I prefer...")
 * 2. Strength tracking (preferences mentioned more = stronger signal)
 * 3. Temporal analysis (recent preferences weighted higher)
 * 4. Category inference (time, food, communication, etc.)
 * 5. Contradiction detection (values vs. behavior)
 *
 * @module intelligence/preference-learning-engine
 */

import { createLogger } from '../utils/safe-logger.js';
import type { Firestore } from '@google-cloud/firestore';

const log = createLogger({ module: 'PreferenceLearningEngine' });

// ============================================================================
// TYPES
// ============================================================================

export interface LearnedPreference {
  id: string;
  userId: string;
  category: PreferenceCategory;
  subject: string;
  sentiment: 'positive' | 'negative';
  strength: number; // 0-1, increases with mentions
  confidence: number; // 0-1, based on signal quality
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  sources: PreferenceSource[];
  relatedPreferences?: string[]; // IDs of related preferences
}

export type PreferenceCategory =
  | 'time' // Morning person, evening person
  | 'communication' // Texting vs calling
  | 'social' // Introvert/extrovert patterns
  | 'food' // Dietary, cuisines
  | 'media' // Movies, music, books
  | 'environment' // Quiet, noisy, crowded
  | 'activity' // Types of activities
  | 'work' // Work style preferences
  | 'travel' // Travel style
  | 'learning' // How they learn
  | 'general'; // Catch-all

export interface PreferenceSource {
  transcript: string;
  sessionId: string;
  personaId: string;
  timestamp: Date;
  signalType: 'explicit' | 'implicit' | 'behavioral';
}

export interface PreferencePattern {
  pattern: RegExp;
  category: PreferenceCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  signalStrength: number; // 0-1
  extractSubject: (match: RegExpMatchArray) => string | null;
}

// ============================================================================
// PREFERENCE PATTERNS
// ============================================================================

const PREFERENCE_PATTERNS: PreferencePattern[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // EXPLICIT POSITIVE PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i\s+(?:really\s+)?love\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'positive',
    signalStrength: 0.9,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /my\s+favou?rite\s+(?:thing\s+)?is\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'positive',
    signalStrength: 0.95,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+prefer\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:over|to|instead)/i,
    category: 'general',
    sentiment: 'positive',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /nothing\s+beats\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'positive',
    signalStrength: 0.9,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPLICIT NEGATIVE PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i\s+(?:really\s+)?hate\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'negative',
    signalStrength: 0.9,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+can(?:'t| not)\s+stand\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'negative',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+(?:really\s+)?dislike\s+([a-z]+(?:\s+[a-z]+){0,3})/i,
    category: 'general',
    sentiment: 'negative',
    signalStrength: 0.8,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i(?:'m| am)\s+(?:a|an)?\s*(morning|night|evening)\s*(?:person|owl)/i,
    category: 'time',
    sentiment: 'positive',
    signalStrength: 0.95,
    extractSubject: (m) => (m[1] ? `${m[1].toLowerCase()} person` : null),
  },
  {
    pattern: /i\s+(?:love|prefer|like)\s+(mornings?|evenings?|nights?)/i,
    category: 'time',
    sentiment: 'positive',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern:
      /i(?:'m| am)\s+(?:most\s+)?productive\s+(?:in\s+the\s+)?(morning|afternoon|evening|night)/i,
    category: 'time',
    sentiment: 'positive',
    signalStrength: 0.9,
    extractSubject: (m) => (m[1] ? `productive ${m[1].toLowerCase()}` : null),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i\s+prefer\s+(text|call|email|message)(?:ing|s)?/i,
    category: 'communication',
    sentiment: 'positive',
    signalStrength: 0.9,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i(?:'d| would)\s+rather\s+(text|call|email)/i,
    category: 'communication',
    sentiment: 'positive',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+hate\s+(phone\s+calls?|texting|emails?)/i,
    category: 'communication',
    sentiment: 'negative',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i(?:'m| am)\s+(?:an?\s+)?(introvert|extrovert)/i,
    category: 'social',
    sentiment: 'neutral',
    signalStrength: 0.95,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+(?:prefer|like|love)\s+(small\s+groups?|big\s+groups?|one\s+on\s+one)/i,
    category: 'social',
    sentiment: 'positive',
    signalStrength: 0.85,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+need\s+(alone\s+time|social\s+time|quiet\s+time)/i,
    category: 'social',
    sentiment: 'positive',
    signalStrength: 0.9,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i\s+(?:work|focus|concentrate)\s+better\s+(?:in\s+)?(quiet|noise|silence|music)/i,
    category: 'environment',
    sentiment: 'positive',
    signalStrength: 0.85,
    extractSubject: (m) => (m[1] ? `work better with ${m[1].toLowerCase()}` : null),
  },
  {
    pattern: /i\s+(?:hate|dislike|can't stand)\s+(crowded|noisy|quiet)\s+(?:places?)?/i,
    category: 'environment',
    sentiment: 'negative',
    signalStrength: 0.8,
    extractSubject: (m) => (m[1] ? `${m[1].toLowerCase()} places` : null),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIORAL PATTERNS (Implicit)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    pattern: /i\s+always\s+([a-z]+(?:\s+[a-z]+){0,4})/i,
    category: 'general',
    sentiment: 'positive',
    signalStrength: 0.7,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+never\s+([a-z]+(?:\s+[a-z]+){0,4})/i,
    category: 'general',
    sentiment: 'negative',
    signalStrength: 0.7,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
  {
    pattern: /i\s+tend\s+to\s+([a-z]+(?:\s+[a-z]+){0,4})/i,
    category: 'general',
    sentiment: 'neutral',
    signalStrength: 0.65,
    extractSubject: (m) => m[1]?.trim().toLowerCase() || null,
  },
];

// ============================================================================
// CATEGORY INFERENCE
// ============================================================================

const CATEGORY_KEYWORDS: Record<PreferenceCategory, string[]> = {
  time: ['morning', 'evening', 'night', 'afternoon', 'early', 'late', 'schedule'],
  communication: ['text', 'call', 'email', 'message', 'phone', 'video', 'chat'],
  social: ['alone', 'people', 'crowd', 'group', 'party', 'introvert', 'extrovert', 'social'],
  food: ['eat', 'food', 'restaurant', 'cook', 'meal', 'taste', 'flavor'],
  media: ['movie', 'show', 'music', 'book', 'podcast', 'game', 'watch', 'read', 'listen'],
  environment: ['quiet', 'noisy', 'crowded', 'space', 'room', 'outside', 'inside'],
  activity: ['exercise', 'sport', 'hobby', 'travel', 'walk', 'run', 'play'],
  work: ['work', 'job', 'meeting', 'deadline', 'project', 'task', 'productive'],
  travel: ['travel', 'trip', 'vacation', 'flight', 'hotel', 'destination'],
  learning: ['learn', 'study', 'read', 'course', 'class', 'practice'],
  general: [],
};

function inferCategory(subject: string): PreferenceCategory {
  const lower = subject.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category as PreferenceCategory;
      }
    }
  }

  return 'general';
}

// ============================================================================
// PREFERENCE EXTRACTION
// ============================================================================

export interface ExtractedPreference {
  subject: string;
  category: PreferenceCategory;
  sentiment: 'positive' | 'negative';
  confidence: number;
  signalType: 'explicit' | 'implicit';
}

/**
 * Extract preferences from a transcript
 */
export function extractPreferences(transcript: string): ExtractedPreference[] {
  const preferences: ExtractedPreference[] = [];
  const seen = new Set<string>();

  for (const pattern of PREFERENCE_PATTERNS) {
    const match = transcript.match(pattern.pattern);
    if (match) {
      const subject = pattern.extractSubject(match);
      if (!subject || subject.length < 2) continue;

      // Skip duplicates
      const key = `${subject}:${pattern.sentiment}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Infer category if generic
      const category = pattern.category === 'general' ? inferCategory(subject) : pattern.category;

      // Map neutral patterns to positive (behavioral patterns like "I always X" are mildly positive)
      const finalSentiment: 'positive' | 'negative' =
        pattern.sentiment === 'neutral' ? 'positive' : pattern.sentiment;

      preferences.push({
        subject,
        category,
        sentiment: finalSentiment,
        confidence: pattern.signalStrength,
        signalType: pattern.signalStrength >= 0.8 ? 'explicit' : 'implicit',
      });
    }
  }

  return preferences;
}

// ============================================================================
// PREFERENCE STORAGE & RETRIEVAL
// ============================================================================

/**
 * Store a learned preference
 */
export async function storePreference(
  userId: string,
  preference: ExtractedPreference,
  source: Omit<PreferenceSource, 'signalType'>
): Promise<LearnedPreference> {
  try {
    const { getFirestoreDb } = await import('../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');

    const prefsRef = db.collection('bogle_users').doc(userId).collection('learned_preferences');

    // Check for existing preference on same subject
    const existing = await prefsRef
      .where('subject', '==', preference.subject)
      .where('category', '==', preference.category)
      .limit(1)
      .get();

    const now = new Date();

    if (!existing.empty) {
      // Update existing preference
      const docRef = existing.docs[0].ref;
      const existingData = existing.docs[0].data() as LearnedPreference;

      // Calculate new strength (decays over time, increases with mentions)
      const daysSinceFirst =
        (now.getTime() - new Date(existingData.firstMentioned).getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-daysSinceFirst / 365); // Decay over a year
      const mentionBoost = Math.min(0.3, existingData.mentionCount * 0.05);
      const newStrength = Math.min(1, existingData.strength * decayFactor + 0.1 + mentionBoost);

      const updated: Partial<LearnedPreference> = {
        strength: newStrength,
        confidence: Math.max(existingData.confidence, preference.confidence),
        lastMentioned: now,
        mentionCount: existingData.mentionCount + 1,
        sources: [
          ...existingData.sources.slice(-9), // Keep last 10 sources
          {
            ...source,
            signalType: preference.signalType,
            timestamp: now,
          },
        ],
      };

      await docRef.update(updated);
      log.debug({ userId, subject: preference.subject }, 'Updated existing preference');

      return { ...existingData, ...updated } as LearnedPreference;
    } else {
      // Create new preference
      const newPref: Omit<LearnedPreference, 'id'> = {
        userId,
        category: preference.category,
        subject: preference.subject,
        sentiment: preference.sentiment,
        strength: preference.confidence * 0.5, // Start at half strength
        confidence: preference.confidence,
        firstMentioned: now,
        lastMentioned: now,
        mentionCount: 1,
        sources: [
          {
            ...source,
            signalType: preference.signalType,
            timestamp: now,
          },
        ],
      };

      const docRef = await prefsRef.add(newPref);
      log.info(
        { userId, subject: preference.subject, category: preference.category },
        'Created new preference'
      );

      return { ...newPref, id: docRef.id };
    }
  } catch (error) {
    log.error(
      { error: String(error), userId, subject: preference.subject },
      'Failed to store preference'
    );
    throw error;
  }
}

/**
 * Get all learned preferences for a user
 */
export async function getLearnedPreferences(
  userId: string,
  options: {
    category?: PreferenceCategory;
    minStrength?: number;
    minMentions?: number;
    limit?: number;
  } = {}
): Promise<LearnedPreference[]> {
  try {
    const { getFirestoreDb } = await import('../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];

    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection('learned_preferences')
      .orderBy('strength', 'desc');

    if (options.category) {
      query = query.where('category', '==', options.category);
    }

    if (options.minStrength) {
      query = query.where('strength', '>=', options.minStrength);
    }

    if (options.minMentions) {
      query = query.where('mentionCount', '>=', options.minMentions);
    }

    const snapshot = await query.limit(options.limit || 100).get();

    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data(),
    })) as LearnedPreference[];
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get learned preferences');
    return [];
  }
}

/**
 * Build preference context for LLM injection
 */
export async function buildPreferenceContext(userId: string): Promise<string> {
  const preferences = await getLearnedPreferences(userId, {
    minStrength: 0.3,
    minMentions: 2,
    limit: 20,
  });

  if (preferences.length === 0) return '';

  const positive = preferences.filter((p) => p.sentiment === 'positive');
  const negative = preferences.filter((p) => p.sentiment === 'negative');

  const lines: string[] = ['[LEARNED PREFERENCES]'];

  if (positive.length > 0) {
    lines.push('Likes:');
    for (const pref of positive.slice(0, 10)) {
      lines.push(`  - ${pref.subject} (${pref.category}, mentioned ${pref.mentionCount}x)`);
    }
  }

  if (negative.length > 0) {
    lines.push('Dislikes:');
    for (const pref of negative.slice(0, 10)) {
      lines.push(`  - ${pref.subject} (${pref.category}, mentioned ${pref.mentionCount}x)`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// INTEGRATION - Process transcript for preference learning
// ============================================================================

/**
 * Process a transcript for preference learning
 * Call this during turn processing to learn preferences passively
 */
export async function learnFromTranscript(
  userId: string,
  transcript: string,
  context: { sessionId: string; personaId: string }
): Promise<void> {
  const preferences = extractPreferences(transcript);

  if (preferences.length === 0) return;

  log.debug({ userId, count: preferences.length }, 'Extracted preferences from transcript');

  for (const pref of preferences) {
    try {
      await storePreference(userId, pref, {
        transcript: transcript.slice(0, 200),
        sessionId: context.sessionId,
        personaId: context.personaId,
        timestamp: new Date(),
      });
    } catch {
      // Non-fatal - continue with other preferences
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractPreferences,
  storePreference,
  getLearnedPreferences,
  buildPreferenceContext,
  learnFromTranscript,
};
