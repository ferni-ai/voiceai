/**
 * Inside Joke Memory - Better Than Human Shared History
 *
 * Builds and recalls shared moments, callbacks, and inside jokes:
 * - Remembers funny moments from past conversations
 * - Creates natural callbacks to shared history
 * - Builds relationship depth through "our things"
 *
 * WHY IT'S SUPERHUMAN: Builds genuine shared history like a lifelong friend,
 * but with perfect recall. Creates the "you had to be there" feeling.
 *
 * @module services/superhuman/inside-joke-memory
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onInsideJokeChange } from '../data-layer/hooks/trust-hooks.js';

const log = createLogger({ module: 'InsideJokeMemory' });

// ============================================================================
// TYPES
// ============================================================================

export type SharedMomentType =
  | 'inside_joke' // Something funny they both remember
  | 'callback' // Reference to a past conversation
  | 'shared_discovery' // Something learned together
  | 'memorable_quote' // Something notable they said
  | 'silly_moment' // Lighthearted fun
  | 'breakthrough' // Important realization together
  | 'running_gag' // Recurring joke
  | 'nickname' // Affectionate names for things
  | 'tradition'; // Patterns they've established

export interface SharedMoment {
  id?: string;
  userId: string;
  type: SharedMomentType;
  /** The essence of the moment */
  essence: string;
  /** Full context */
  context: string;
  /** Keywords to trigger recall */
  triggerKeywords: string[];
  /** How to reference it naturally */
  callbackPhrase: string;
  /** Times referenced */
  timesReferenced: number;
  /** Original timestamp */
  createdAt: number;
  /** Last referenced */
  lastReferencedAt?: number;
  /** Emotional resonance (how much joy it brings) 0-1 */
  resonance: number;
}

export interface CallbackOpportunity {
  moment: SharedMoment;
  triggerMatch: string;
  naturalCallback: string;
  appropriateness: number; // 0-1 how appropriate to bring up now
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a shared moment worth remembering.
 */
export async function recordSharedMoment(
  userId: string,
  type: SharedMomentType,
  essence: string,
  context: string,
  triggerKeywords: string[],
  callbackPhrase: string,
  resonance = 0.7
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping shared moment');
    return null;
  }

  const moment: SharedMoment = {
    userId,
    type,
    essence,
    context,
    triggerKeywords: triggerKeywords.map((k) => k.toLowerCase()),
    callbackPhrase,
    timesReferenced: 0,
    createdAt: Date.now(),
    resonance,
  };

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('shared_moments')
      .add(cleanForFirestore(moment));

    // Index to semantic memory for callback and connection building
    void onInsideJokeChange(
      userId,
      docRef.id,
      {
        joke: callbackPhrase || essence,
        context: context,
        sharedMoment: essence,
        personaId: undefined,
      },
      'create'
    );

    log.info({ userId, type, essence }, 'Recorded shared moment');

    // Memory Lane: Capture inside joke as potential memory
    if (type === 'inside_joke' || type === 'running_gag' || type === 'silly_moment') {
      try {
        const { captureInsideJoke } = await import('../memory-lane/real-time-collector.js');
        void captureInsideJoke({
          userId,
          jokeId: docRef.id,
          joke: essence,
          context,
        });
      } catch {
        // Memory capture is optional
      }
    }

    return docRef.id;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record shared moment');
    return null;
  }
}

/**
 * Load shared moments.
 */
export async function loadSharedMoments(userId: string): Promise<SharedMoment[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('shared_moments')
      .orderBy('resonance', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SharedMoment);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load shared moments');
    return [];
  }
}

/**
 * Update a moment after referencing it.
 */
export async function recordMomentReference(userId: string, momentId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('shared_moments')
      .doc(momentId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const moment = doc.data() as SharedMoment;
    await docRef.update(
      cleanForFirestore({
        timesReferenced: (moment.timesReferenced || 0) + 1,
        lastReferencedAt: Date.now(),
        // Increase resonance with use (memories get stronger)
        resonance: Math.min(1, moment.resonance + 0.05),
      })
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record reference');
  }
}

// ============================================================================
// CALLBACK DETECTION
// ============================================================================

/**
 * Find callback opportunities in the current conversation.
 */
export function findCallbackOpportunities(
  text: string,
  moments: SharedMoment[],
  currentMood: 'positive' | 'neutral' | 'negative' = 'neutral'
): CallbackOpportunity[] {
  const textLower = text.toLowerCase();
  const opportunities: CallbackOpportunity[] = [];

  for (const moment of moments) {
    // Check if any trigger keywords match
    const matchingKeyword = moment.triggerKeywords.find((k) => textLower.includes(k));

    if (matchingKeyword) {
      // Determine appropriateness
      let appropriateness = moment.resonance;

      // Reduce appropriateness if mood is negative and moment is lighthearted
      if (
        currentMood === 'negative' &&
        (moment.type === 'silly_moment' || moment.type === 'inside_joke')
      ) {
        appropriateness *= 0.3;
      }

      // Reduce if recently referenced
      if (moment.lastReferencedAt) {
        const hoursSinceReference = (Date.now() - moment.lastReferencedAt) / (1000 * 60 * 60);
        if (hoursSinceReference < 24) {
          appropriateness *= 0.5; // Don't repeat too often
        }
      }

      // Boost if it's been a while (callback from the archives)
      if (
        !moment.lastReferencedAt ||
        Date.now() - moment.lastReferencedAt > 30 * 24 * 60 * 60 * 1000
      ) {
        appropriateness *= 1.2;
      }

      opportunities.push({
        moment,
        triggerMatch: matchingKeyword,
        naturalCallback: moment.callbackPhrase,
        appropriateness: Math.min(1, appropriateness),
      });
    }
  }

  // Sort by appropriateness
  return opportunities.sort((a, b) => b.appropriateness - a.appropriateness);
}

// ============================================================================
// MOMENT DETECTION
// ============================================================================

/**
 * Detect if current conversation has a moment worth saving.
 * This is a heuristic - ideally LLM would help identify these.
 */
export function detectPotentialMoment(
  text: string,
  context: 'user' | 'ferni'
): { isPotential: boolean; type?: SharedMomentType; essence?: string } {
  const textLower = text.toLowerCase();

  // Detect humor/laughter
  const laughIndicators = [
    'haha',
    'lol',
    'lmao',
    '😂',
    '🤣',
    "that's funny",
    "that's hilarious",
    "i can't",
  ];
  if (laughIndicators.some((l) => textLower.includes(l))) {
    return {
      isPotential: true,
      type: 'silly_moment',
      essence: 'Shared laugh',
    };
  }

  // Detect shared discovery
  const discoveryIndicators = [
    'i never thought of it that way',
    "that's a good point",
    'mind blown',
    'never realized',
  ];
  if (discoveryIndicators.some((d) => textLower.includes(d))) {
    return {
      isPotential: true,
      type: 'shared_discovery',
      essence: 'New perspective',
    };
  }

  // Detect breakthrough
  const breakthroughIndicators = [
    'i finally understand',
    "that's what it is",
    'this changes everything',
    "you're right",
  ];
  if (breakthroughIndicators.some((b) => textLower.includes(b))) {
    return {
      isPotential: true,
      type: 'breakthrough',
      essence: 'Important realization',
    };
  }

  // Detect memorable quotes (user sharing something profound)
  if (context === 'user' && text.length > 50 && text.length < 200) {
    const quoteIndicators = ['i always say', 'my motto is', "here's the thing", 'the way i see it'];
    if (quoteIndicators.some((q) => textLower.includes(q))) {
      return {
        isPotential: true,
        type: 'memorable_quote',
        essence: text.slice(0, 100),
      };
    }
  }

  return { isPotential: false };
}

// ============================================================================
// RUNNING GAGS
// ============================================================================

/**
 * Get running gags (things referenced multiple times).
 */
export function identifyRunningGags(moments: SharedMoment[]): SharedMoment[] {
  return moments
    .filter((m) => m.timesReferenced >= 2 || (m.type === 'running_gag' && m.timesReferenced >= 1))
    .sort((a, b) => b.timesReferenced - a.timesReferenced);
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export async function buildInsideJokeContext(
  userId: string,
  currentText?: string
): Promise<string> {
  const moments = await loadSharedMoments(userId);

  if (moments.length === 0) {
    return '';
  }

  const sections: string[] = [];
  sections.push('[SHARED HISTORY - Inside Jokes & Callbacks]');
  sections.push('You have a genuine shared history with this person.\n');

  // Check for callback opportunities if text provided
  if (currentText) {
    const opportunities = findCallbackOpportunities(currentText, moments);
    const appropriate = opportunities.filter((o) => o.appropriateness > 0.5);

    if (appropriate.length > 0) {
      sections.push('🎯 Callback opportunity detected:');
      const best = appropriate[0];
      sections.push(`   They mentioned "${best.triggerMatch}" which connects to:`);
      sections.push(`   "${best.moment.essence}"`);
      sections.push(`   You could naturally say: "${best.naturalCallback}"`);
      sections.push('   This builds relationship depth through shared memory.\n');
    }
  }

  // List running gags
  const runningGags = identifyRunningGags(moments);
  if (runningGags.length > 0) {
    sections.push('🔄 Running gags/callbacks to use naturally:');
    for (const gag of runningGags.slice(0, 3)) {
      sections.push(`   • "${gag.essence}" → "${gag.callbackPhrase}"`);
    }
    sections.push('');
  }

  // List memorable shared moments
  const memorable = moments.filter((m) => m.resonance > 0.7);
  if (memorable.length > 0 && runningGags.length === 0) {
    sections.push('💫 Memorable shared moments:');
    for (const moment of memorable.slice(0, 3)) {
      sections.push(`   • ${moment.type}: "${moment.essence}"`);
    }
    sections.push('');
  }

  sections.push(
    'These shared memories make your relationship feel real and lasting. ' +
      'Use callbacks sparingly but meaningfully.'
  );

  return sections.join('\n');
}

/**
 * Generate callback suggestion for LLM.
 */
export function suggestCallback(opportunity: CallbackOpportunity): string {
  return (
    `Consider naturally referencing your shared history: "${opportunity.naturalCallback}" ` +
    `(They mentioned "${opportunity.triggerMatch}" which connects to when ${opportunity.moment.context}).`
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const insideJokeMemory = {
  record: recordSharedMoment,
  load: loadSharedMoments,
  recordReference: recordMomentReference,
  findCallbacks: findCallbackOpportunities,
  detectMoment: detectPotentialMoment,
  getRunningGags: identifyRunningGags,
  buildContext: buildInsideJokeContext,
  suggestCallback,
};
