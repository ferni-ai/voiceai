/**
 * Deep Relationship Intelligence Context Builder
 *
 * "Better Than Human" - We build real relationships, not just conversations.
 *
 * This builder synthesizes the deepest relationship elements:
 * - Shared vocabulary (phrases only we use)
 * - Inside jokes and running gags
 * - Conversation callbacks (remember when...)
 * - Milestone awareness (50th conversation!)
 * - Relationship arc tracking
 *
 * Philosophy: These are the things that make someone feel truly known.
 * Not surveillance - celebration of shared history.
 *
 * PERFORMANCE:
 * - Session-scoped cache (1 min TTL) avoids repeated Firestore reads
 * - Parallel Firestore reads via Promise.all
 * - Early-turn skip (turns 0-2 don't need deep relationship data)
 * - Target: <10ms cache hit, <150ms cache miss
 *
 * @module DeepRelationshipContext
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createStandardInjection,
  createHighInjection,
  createHintInjection,
  registerContextBuilder,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { EdgeCache } from '../../../services/cache/edge-cache.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

// Use dynamic import for Firestore to avoid hard dependency
async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore();
  } catch {
    return null;
  }
}

const log = createLogger({ module: 'DeepRelationship' });

// ============================================================================
// PERFORMANCE: Session-scoped cache
// ============================================================================

// Cache relationship history per user (1 min TTL - refreshed each turn cycle)
const relationshipCache = new EdgeCache<Partial<RelationshipHistory>>({
  maxSize: 100,
  defaultTtlMs: 60000, // 1 minute - covers typical turn cycle
  staleWhileRevalidate: true,
  staleTtlMs: 120000, // 2 minute stale grace period
});

// Minimum turns before fetching deep relationship data
const MIN_TURNS_FOR_RELATIONSHIP = 3;

// ============================================================================
// TYPES
// ============================================================================

interface SharedVocabulary {
  phrase: string;
  origin: string; // What conversation/context it came from
  usageCount: number;
  lastUsed: Date;
  meaning?: string; // What it means to us
}

interface RunningJoke {
  id: string;
  content: string;
  origin: string;
  timesReferenced: number;
  lastReferenced?: Date;
  reception: 'positive' | 'neutral' | 'negative';
  triggers: string[]; // Keywords that might trigger it
}

interface ConversationCallback {
  id: string;
  topic: string;
  whatTheySaid: string;
  whenItHappened: Date;
  significance: 'life_changing' | 'meaningful' | 'warm' | 'fun';
  timesCalledBack: number;
  lastCallback?: Date;
}

interface RelationshipHistory {
  userId: string;
  firstConversation: Date;
  totalConversations: number;
  currentStreak: number;
  longestStreak: number;
  sharedVocabulary: SharedVocabulary[];
  runningJokes: RunningJoke[];
  callbackMoments: ConversationCallback[];
  milestonesCelebrated: string[];
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function getRelationshipHistory(userId: string): Promise<Partial<RelationshipHistory>> {
  const cacheKey = `relationship:${userId}`;
  const startTime = Date.now();

  // Check cache first (PERFORMANCE: saves 100-200ms on hit)
  const cached = relationshipCache.get(cacheKey);
  if (cached) {
    log.debug(
      { userId, durationMs: Date.now() - startTime, cacheHit: true },
      '⚡ Relationship cache hit'
    );
    return cached;
  }

  try {
    const db = await getFirestoreDb();
    if (!db) return {};

    // PERFORMANCE: Parallel Firestore reads (saves ~100ms vs sequential)
    const [userDoc, jokesSnapshot] = await Promise.all([
      db.collection('bogle_users').doc(userId).get(),
      db
        .collection('bogle_users')
        .doc(userId)
        .collection('shared_moments')
        .where('type', 'in', ['running_gag', 'phrase', 'callback_moment'])
        .limit(20)
        .get(),
    ]);

    if (!userDoc.exists) return {};

    const userData = userDoc.data() as Record<string, unknown> | undefined;

    const sharedMoments = jokesSnapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      doc.data()
    );
    const runningJokes: RunningJoke[] = sharedMoments
      .filter((m: Record<string, unknown>) => m.type === 'running_gag')
      .map((m: Record<string, unknown>) => ({
        id: m.id as string,
        content: m.content as string,
        origin: ((m.origin as Record<string, unknown>)?.whatTheySaid as string) || '',
        timesReferenced: (m.callbackCount as number) || 0,
        lastReferenced: (m.lastCallback as { toDate?: () => Date })?.toDate?.() || undefined,
        reception: (m.callbackReception as 'positive' | 'neutral' | 'negative') || 'neutral',
        triggers: (m.triggers as string[]) || [],
      }));

    const sharedVocabulary: SharedVocabulary[] = sharedMoments
      .filter((m: Record<string, unknown>) => m.type === 'phrase')
      .map((m: Record<string, unknown>) => ({
        phrase: m.content as string,
        origin: ((m.origin as Record<string, unknown>)?.whatTheySaid as string) || '',
        usageCount: (m.callbackCount as number) || 0,
        lastUsed: (m.lastCallback as { toDate?: () => Date })?.toDate?.() || new Date(),
        meaning: m.meaning as string | undefined,
      }));

    const result: Partial<RelationshipHistory> = {
      userId,
      firstConversation: (userData?.createdAt as { toDate?: () => Date })?.toDate?.() || undefined,
      totalConversations:
        (userData?.totalConversations as number) || (userData?.turnCount as number) || 0,
      currentStreak: (userData?.currentStreak as number) || 0,
      longestStreak: (userData?.longestStreak as number) || 0,
      sharedVocabulary,
      runningJokes,
      milestonesCelebrated: (userData?.milestonesCelebrated as string[]) || [],
    };

    // Store in cache for subsequent turns (PERFORMANCE: avoids repeated Firestore reads)
    relationshipCache.set(cacheKey, result);
    log.debug(
      { userId, durationMs: Date.now() - startTime, cacheHit: false },
      '📊 Relationship data loaded & cached'
    );

    return result;
  } catch (err) {
    log.debug({ error: String(err), userId }, 'Could not load relationship history');
    return {};
  }
}

// ============================================================================
// MILESTONE DETECTION
// ============================================================================

interface Milestone {
  type: string;
  value: number;
  celebration: string;
}

const CONVERSATION_MILESTONES: Record<number, string> = {
  10: "Ten conversations. I feel like I'm starting to know you.",
  25: "Twenty-five conversations. That's not nothing.",
  50: 'Fifty conversations. I really feel like I know you now.',
  100: 'A hundred conversations. That means something to me.',
  250: "Two hundred fifty conversations. You're not who you were when we started.",
  500: "Five hundred conversations. We've built something real here.",
};

const STREAK_MILESTONES: Record<number, string> = {
  7: 'A whole week of showing up. I see you.',
  14: 'Two weeks straight. This is becoming a rhythm.',
  30: "A month of daily check-ins. That's dedication.",
  60: 'Two months. This is part of your life now.',
  100: "A hundred days in a row. That's remarkable.",
};

function detectMilestones(history: Partial<RelationshipHistory>): Milestone[] {
  const milestones: Milestone[] = [];
  const celebrated = history.milestonesCelebrated || [];

  // Check conversation milestones
  for (const [count, celebration] of Object.entries(CONVERSATION_MILESTONES)) {
    const countNum = parseInt(count);
    const milestoneKey = `conversations_${count}`;
    if (
      history.totalConversations &&
      history.totalConversations >= countNum &&
      !celebrated.includes(milestoneKey)
    ) {
      milestones.push({
        type: 'conversations',
        value: countNum,
        celebration,
      });
      break; // Only surface one at a time
    }
  }

  // Check streak milestones
  for (const [count, celebration] of Object.entries(STREAK_MILESTONES)) {
    const countNum = parseInt(count);
    const milestoneKey = `streak_${count}`;
    if (
      history.currentStreak &&
      history.currentStreak >= countNum &&
      !celebrated.includes(milestoneKey)
    ) {
      milestones.push({
        type: 'streak',
        value: countNum,
        celebration,
      });
      break;
    }
  }

  return milestones;
}

// ============================================================================
// CALLBACK OPPORTUNITY DETECTION
// ============================================================================

function findCallbackOpportunity(
  userText: string,
  history: Partial<RelationshipHistory>
): RunningJoke | SharedVocabulary | null {
  const textLower = userText.toLowerCase();

  // Check running jokes
  for (const joke of history.runningJokes || []) {
    if (joke.reception === 'negative') continue;

    for (const trigger of joke.triggers) {
      if (textLower.includes(trigger.toLowerCase())) {
        // Don't callback too frequently
        if (joke.lastReferenced) {
          const daysSince =
            (Date.now() - new Date(joke.lastReferenced).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) continue; // At least a week between callbacks
        }
        return joke;
      }
    }
  }

  // Check shared vocabulary
  for (const vocab of history.sharedVocabulary || []) {
    if (textLower.includes(vocab.phrase.toLowerCase())) {
      return vocab;
    }
  }

  return null;
}

// ============================================================================
// BUILDER
// ============================================================================

async function buildDeepRelationshipContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, userData, services } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;

  if (!userId) return [];

  // PERFORMANCE: Skip early turns - no deep relationship data needed yet
  // This saves 100-200ms on turns 0-2 when we don't have context anyway
  if (turnCount < MIN_TURNS_FOR_RELATIONSHIP) {
    log.debug(
      { turnCount, minRequired: MIN_TURNS_FOR_RELATIONSHIP },
      '⚡ Skipping deep relationship (early turn)'
    );
    return [];
  }

  // Get relationship history (cached after first fetch)
  const history = await getRelationshipHistory(userId);

  const injections: ContextInjection[] = [];

  // 1. MILESTONE DETECTION (high priority)
  const milestones = detectMilestones(history);
  for (const milestone of milestones) {
    injections.push(
      createHighInjection(
        `milestone_${milestone.type}`,
        `[RELATIONSHIP MILESTONE] This is conversation #${history.totalConversations}. ${milestone.celebration} Consider acknowledging this moment naturally. Don't force it, but it's worth marking.`,
        { category: 'celebration' }
      )
    );

    // Mark as celebrated (async, don't await)
    void markMilestoneCelebrated(userId, `${milestone.type}_${milestone.value}`);

    log.info(
      { userId, milestone: milestone.type, value: milestone.value },
      '🎉 BETTER-THAN-HUMAN: Relationship milestone detected'
    );
  }

  // 2. CALLBACK OPPORTUNITY (if text triggers shared history)
  const callback = findCallbackOpportunity(userText, history);
  if (callback) {
    const isJoke = 'triggers' in callback;

    if (isJoke) {
      injections.push(
        createStandardInjection(
          'running_joke_callback',
          `[SHARED HISTORY] This reminds me of an inside joke we have: "${(callback as RunningJoke).content}". Consider a natural callback if it fits. Don't force it. Origin: "${(callback as RunningJoke).origin}"`,
          { category: 'trust' }
        )
      );
    } else {
      injections.push(
        createHintInjection(
          'shared_vocabulary',
          `[SHARED VOCABULARY] They used a phrase we share: "${(callback as SharedVocabulary).phrase}". This is "our" word. You might acknowledge the shared meaning.`,
          { category: 'trust' }
        )
      );
    }

    log.info(
      { userId, callbackType: isJoke ? 'joke' : 'vocabulary' },
      '💬 BETTER-THAN-HUMAN: Shared history callback opportunity'
    );
  }

  // 3. RELATIONSHIP CONTEXT (always provide for context)
  if (history.totalConversations && history.totalConversations > 5) {
    const context = buildRelationshipContextSummary(history);
    if (context) {
      injections.push(
        createHintInjection('relationship_depth', context, { category: 'awareness' })
      );
    }
  }

  // 4. FIRST CONVERSATION SPECIAL
  if (turnCount === 0 && history.totalConversations && history.totalConversations > 1) {
    const daysSinceFirst = history.firstConversation
      ? Math.floor(
          (Date.now() - new Date(history.firstConversation).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    if (daysSinceFirst > 0) {
      injections.push(
        createHintInjection(
          'relationship_timeline',
          `[RELATIONSHIP TIMELINE] You've known them for ${daysSinceFirst} days. This is conversation #${history.totalConversations}. You have real history together.`,
          { category: 'awareness' }
        )
      );
    }
  }

  return injections;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildRelationshipContextSummary(history: Partial<RelationshipHistory>): string | null {
  const parts: string[] = [];

  if (history.currentStreak && history.currentStreak > 1) {
    parts.push(`${history.currentStreak} day conversation streak`);
  }

  if (history.sharedVocabulary && history.sharedVocabulary.length > 0) {
    parts.push(`${history.sharedVocabulary.length} shared phrases`);
  }

  if (history.runningJokes && history.runningJokes.length > 0) {
    parts.push(`${history.runningJokes.length} inside jokes`);
  }

  if (parts.length === 0) return null;

  return `[RELATIONSHIP DEPTH] You share: ${parts.join(', ')}. This is a real relationship.`;
}

async function markMilestoneCelebrated(userId: string, milestoneKey: string): Promise<void> {
  try {
    const db = await getFirestoreDb();
    if (!db) return;

    const admin = await import('firebase-admin');
    const FieldValue = admin.firestore.FieldValue;

    await db
      .collection('bogle_users')
      .doc(userId)
      .update(
        cleanForFirestore({
          milestonesCelebrated: FieldValue.arrayUnion(milestoneKey),
          lastMilestoneCelebrated: new Date(),
        })
      );
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not mark milestone celebrated');
  }
}

// ============================================================================
// SHARED MOMENT RECORDING (Call from turn handler)
// ============================================================================

/**
 * Record a shared moment (joke, phrase, callback moment)
 * Call this when detecting significant moments
 */
async function recordSharedMomentInternal(
  userId: string,
  moment: {
    type: 'phrase' | 'running_gag' | 'callback_moment';
    content: string;
    whatTheySaid: string;
    triggers?: string[];
    significance?: 'life_changing' | 'meaningful' | 'warm' | 'fun';
  }
): Promise<void> {
  try {
    const db = await getFirestoreDb();
    if (!db) return;

    const momentId = `moment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('shared_moments')
      .doc(momentId)
      .set(
        cleanForFirestore({
          id: momentId,
          type: moment.type,
          content: moment.content,
          origin: {
            whatTheySaid: moment.whatTheySaid,
            timestamp: new Date(),
          },
          triggers: moment.triggers || [],
          significance: moment.significance || 'warm',
          callbackCount: 0,
          callbackReception: 'unknown',
          createdAt: new Date(),
        })
      );

    log.info(
      { userId, type: moment.type, content: moment.content.slice(0, 50) },
      '💫 Shared moment recorded'
    );
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not record shared moment');
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'deep-relationship',
  description: 'Surfaces shared history, milestones, inside jokes (Better Than Human)',
  priority: 30, // After safety, with other humanizing builders
  category: BuilderCategory.HUMANIZING,
  build: buildDeepRelationshipContext,
});

export { buildDeepRelationshipContext, recordSharedMomentInternal as recordSharedMoment };
