/**
 * Coaching Patterns - Cross-Session Pattern Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module tracks patterns across sessions to surface recurring themes:
 * - Topics they keep coming back to
 * - Words/phrases they use repeatedly
 * - Emotional patterns (e.g., always deflects with humor)
 * - Time-based patterns (e.g., always stressed on Mondays)
 * - Relationship patterns (e.g., always mentions mom during work talk)
 *
 * The goal: Help users see patterns they can't see themselves.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface UserPattern {
  id: string;
  userId: string;
  patternType: PatternType;
  pattern: string;
  occurrences: number;
  contexts: PatternContext[];
  firstSeen: Date;
  lastSeen: Date;
  surfacedToUser: boolean;
  surfacedAt?: Date;
  userReaction?: 'resonated' | 'dismissed' | 'explored';
}

export type PatternType =
  | 'recurring_topic' // Same topic keeps coming up
  | 'deflection_humor' // Uses humor to avoid depth
  | 'deflection_busy' // Says "busy" to avoid topics
  | 'word_repetition' // Repeats certain words ("should", "fine", "just")
  | 'emotional_trigger' // Certain topics trigger emotions
  | 'time_correlation' // Patterns at certain times
  | 'person_correlation' // Patterns when mentioning certain people
  | 'avoidance'; // Consistently avoids certain topics

export interface PatternContext {
  timestamp: Date;
  topic: string;
  triggerText?: string;
  emotion?: string;
  hourOfDay: number;
  dayOfWeek: number;
}

export interface PatternObservation {
  userId: string;
  patternType: PatternType;
  pattern: string;
  context: Omit<PatternContext, 'timestamp'>;
  triggerText: string;
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect patterns in a user's transcript
 */
export function detectPatternsInTranscript(
  transcript: string,
  topic: string,
  emotion?: string
): Array<{ type: PatternType; pattern: string; trigger: string }> {
  const detected: Array<{ type: PatternType; pattern: string; trigger: string }> = [];
  const lowerTranscript = transcript.toLowerCase();

  // Word repetition patterns
  const shouldMatches = (lowerTranscript.match(/\bshould\b/g) || []).length;
  if (shouldMatches >= 2) {
    detected.push({
      type: 'word_repetition',
      pattern: 'uses_should_frequently',
      trigger: `Said "should" ${shouldMatches} times`,
    });
  }

  const fineMatches = (lowerTranscript.match(/\b(fine|okay|alright)\b/gi) || []).length;
  if (fineMatches >= 2) {
    detected.push({
      type: 'word_repetition',
      pattern: 'minimizes_with_fine',
      trigger: `Said "fine/okay" ${fineMatches} times`,
    });
  }

  const justMatches = (lowerTranscript.match(/\bjust\b/g) || []).length;
  if (justMatches >= 3) {
    detected.push({
      type: 'word_repetition',
      pattern: 'minimizes_with_just',
      trigger: `Said "just" ${justMatches} times`,
    });
  }

  // Deflection patterns
  if (lowerTranscript.includes('haha') || lowerTranscript.includes('lol') || 
      lowerTranscript.includes('anyway') || lowerTranscript.includes('whatever')) {
    if (emotion === 'heavy' || emotion === 'sad' || emotion === 'anxious') {
      detected.push({
        type: 'deflection_humor',
        pattern: 'deflects_with_humor_when_emotional',
        trigger: 'Used humor during emotional moment',
      });
    }
  }

  if (lowerTranscript.includes("i'm busy") || lowerTranscript.includes('no time') ||
      lowerTranscript.includes("don't have time")) {
    detected.push({
      type: 'deflection_busy',
      pattern: 'uses_busy_as_deflection',
      trigger: 'Mentioned being busy',
    });
  }

  // Person-correlation patterns
  const mentionedPeople = extractMentionedPeople(transcript);
  for (const person of mentionedPeople) {
    if (topic.toLowerCase().includes('work') || topic.toLowerCase().includes('job')) {
      detected.push({
        type: 'person_correlation',
        pattern: `mentions_${person.toLowerCase()}_during_work_talk`,
        trigger: `Mentioned ${person} while discussing work`,
      });
    }
    if (emotion === 'stressed' || emotion === 'anxious') {
      detected.push({
        type: 'person_correlation',
        pattern: `${person.toLowerCase()}_triggers_stress`,
        trigger: `Became stressed when mentioning ${person}`,
      });
    }
  }

  return detected;
}

/**
 * Extract people mentioned in transcript
 */
function extractMentionedPeople(transcript: string): string[] {
  const people: string[] = [];
  
  // Common relationship words followed by names
  const patterns = [
    /my\s+(mom|mother|dad|father|sister|brother|boss|partner|husband|wife|friend|colleague)\b/gi,
    /(?:my\s+)?([A-Z][a-z]+)(?:\s+said|\s+told|\s+thinks|\s+always)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const person = match[1];
      if (person && !people.includes(person)) {
        people.push(person);
      }
    }
  }

  return people;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const PATTERNS_COLLECTION = 'userPatterns';
const patternsCache = new Map<string, UserPattern[]>();

/**
 * Record a pattern observation
 */
export async function recordPattern(observation: PatternObservation): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  const { userId, patternType, pattern, context, triggerText } = observation;
  const now = new Date();

  try {
    // Check if pattern already exists
    const existingRef = db
      .collection(PATTERNS_COLLECTION)
      .where('userId', '==', userId)
      .where('patternType', '==', patternType)
      .where('pattern', '==', pattern)
      .limit(1);

    const existing = await existingRef.get();

    if (existing.empty) {
      // Create new pattern
      const newPattern: UserPattern = {
        id: `${userId}_${patternType}_${Date.now()}`,
        userId,
        patternType,
        pattern,
        occurrences: 1,
        contexts: [{ ...context, timestamp: now, triggerText }],
        firstSeen: now,
        lastSeen: now,
        surfacedToUser: false,
      };

      await db.collection(PATTERNS_COLLECTION).doc(newPattern.id).set(newPattern);
      log.debug({ userId, patternType, pattern }, 'Created new pattern record');
    } else {
      // Update existing pattern
      const doc = existing.docs[0];
      const data = doc.data();
      
      await doc.ref.update({
        occurrences: (data.occurrences || 0) + 1,
        lastSeen: now,
        contexts: [...(data.contexts || []).slice(-9), { ...context, timestamp: now, triggerText }],
      });
      
      log.debug({ userId, patternType, pattern, occurrences: data.occurrences + 1 }, 'Updated pattern record');
    }

    // Invalidate cache
    patternsCache.delete(userId);
  } catch (error) {
    log.warn({ error: String(error), userId, patternType }, 'Failed to record pattern');
  }
}

/**
 * Get patterns for a user
 */
export async function getUserPatterns(userId: string): Promise<UserPattern[]> {
  // Check cache
  if (patternsCache.has(userId)) {
    return patternsCache.get(userId)!;
  }

  const db = getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection(PATTERNS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('occurrences', 'desc')
      .limit(20)
      .get();

    const patterns: UserPattern[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      patterns.push({
        id: doc.id,
        userId: data.userId,
        patternType: data.patternType,
        pattern: data.pattern,
        occurrences: data.occurrences,
        contexts: (data.contexts || []).map((c: Record<string, unknown>) => ({
          ...c,
          timestamp: (c.timestamp as { toDate: () => Date })?.toDate?.() || new Date(c.timestamp as string),
        })),
        firstSeen: data.firstSeen?.toDate?.() || new Date(),
        lastSeen: data.lastSeen?.toDate?.() || new Date(),
        surfacedToUser: data.surfacedToUser || false,
        surfacedAt: data.surfacedAt?.toDate?.(),
        userReaction: data.userReaction,
      });
    });

    patternsCache.set(userId, patterns);
    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load user patterns');
    return [];
  }
}

/**
 * Get patterns ready to be surfaced to user
 * 
 * A pattern is ready to surface when:
 * - It has occurred at least 3 times
 * - It hasn't been surfaced before (or was well-received)
 * - It's been more than a week since last surfacing
 */
export async function getPatternsToSurface(userId: string): Promise<UserPattern[]> {
  const allPatterns = await getUserPatterns(userId);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return allPatterns.filter((p) => {
    // Minimum occurrences
    if (p.occurrences < 3) return false;
    
    // Not surfaced or surfaced long ago
    if (p.surfacedToUser && p.surfacedAt && p.surfacedAt > oneWeekAgo) return false;
    
    // Don't resurface dismissed patterns
    if (p.userReaction === 'dismissed') return false;

    return true;
  });
}

/**
 * Mark a pattern as surfaced
 */
export async function markPatternSurfaced(
  patternId: string,
  reaction?: 'resonated' | 'dismissed' | 'explored'
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(PATTERNS_COLLECTION).doc(patternId).update({
      surfacedToUser: true,
      surfacedAt: new Date(),
      ...(reaction && { userReaction: reaction }),
    });

    // Invalidate cache (get userId from pattern ID format)
    const userId = patternId.split('_')[0];
    if (userId) patternsCache.delete(userId);
  } catch (error) {
    log.warn({ error: String(error), patternId }, 'Failed to mark pattern as surfaced');
  }
}

/**
 * Generate a pattern-surfacing question
 */
export function generatePatternSurfacingQuestion(pattern: UserPattern): string {
  const questions: Record<PatternType, (p: UserPattern) => string[]> = {
    recurring_topic: (p) => [
      `I've noticed ${p.pattern} keeps coming up for you. What is it about that?`,
      `This isn't the first time you've mentioned ${p.pattern}. What's pulling you there?`,
      `${p.pattern} seems to be on your mind a lot lately. What do you think that's about?`,
    ],
    word_repetition: (p) => {
      if (p.pattern.includes('should')) {
        return [
          `You've used "should" quite a bit. Whose voice is that—yours or someone else's?`,
          `I notice you say "should" a lot. What would happen if you didn't have to?`,
        ];
      }
      if (p.pattern.includes('fine') || p.pattern.includes('okay')) {
        return [
          `You often say you're "fine". If that word wasn't available, what would you say?`,
          `I've noticed "fine" comes up a lot. What's underneath that?`,
        ];
      }
      if (p.pattern.includes('just')) {
        return [
          `You tend to minimize things with "just". What if it wasn't "just"?`,
          `I notice you use "just" a lot. What if those things were actually a big deal?`,
        ];
      }
      return [`I've noticed a pattern in how you talk about this. What do you make of that?`];
    },
    deflection_humor: () => [
      `You often use humor when things get real. What's actually underneath the jokes?`,
      `I've noticed you tend to laugh when we get close to something important. What's there?`,
    ],
    deflection_busy: () => [
      `You mention being busy a lot. What would you make time for if you could?`,
      `"Busy" comes up often. What's the thing you're not doing that you wish you were?`,
    ],
    emotional_trigger: (p) => [
      `I've noticed ${p.pattern.replace('_', ' ')}. Is there something there worth exploring?`,
    ],
    time_correlation: (p) => [
      `I've noticed this tends to come up at certain times. What do you think that's about?`,
    ],
    person_correlation: (p) => {
      const personMatch = p.pattern.match(/mentions_(\w+)_during/);
      const person = personMatch ? personMatch[1] : 'them';
      return [
        `I've noticed you often bring up ${person} when we talk about this. Is there a connection?`,
        `${person} seems to come up a lot in these conversations. What's there?`,
      ];
    },
    avoidance: (p) => [
      `I've noticed we tend to move away from ${p.pattern.replace('avoids_', '')}. Would you like to go there?`,
    ],
  };

  const questionTemplates = questions[pattern.patternType] || questions.recurring_topic;
  const templateQuestions = questionTemplates(pattern);
  return templateQuestions[Math.floor(Math.random() * templateQuestions.length)];
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Process a turn and record any patterns detected
 */
export async function processTranscriptForPatterns(
  userId: string,
  transcript: string,
  topic: string,
  emotion?: string
): Promise<void> {
  const detected = detectPatternsInTranscript(transcript, topic, emotion);
  const now = new Date();

  for (const pattern of detected) {
    await recordPattern({
      userId,
      patternType: pattern.type,
      pattern: pattern.pattern,
      context: {
        topic,
        emotion,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
      },
      triggerText: pattern.trigger,
    });
  }
}

/**
 * Get a pattern to potentially surface in the next silence
 */
export async function getPatternForSilence(userId: string): Promise<{
  pattern: UserPattern;
  question: string;
} | null> {
  const patternsToSurface = await getPatternsToSurface(userId);
  
  if (patternsToSurface.length === 0) return null;

  // Pick the most significant pattern
  const pattern = patternsToSurface[0];
  const question = generatePatternSurfacingQuestion(pattern);

  return { pattern, question };
}

export default {
  detectPatternsInTranscript,
  recordPattern,
  getUserPatterns,
  getPatternsToSurface,
  markPatternSurfaced,
  generatePatternSurfacingQuestion,
  processTranscriptForPatterns,
  getPatternForSilence,
};

