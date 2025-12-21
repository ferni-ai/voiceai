/**
 * 🧠 Better Than Human Memory for Creative You
 *
 * Surfaces superhuman insights that make Ferni feel like a friend with perfect memory:
 * - "You mentioned this 3 weeks ago..."
 * - "I've noticed you explore this topic when..."
 * - "Last time we talked about this, you seemed..."
 *
 * This is what differentiates Ferni from an algorithm.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ConversationSummary, KeyMoment, EmotionalPattern } from '../../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface SuperhumanMemoryContext {
  /** When the user first mentioned this topic */
  firstMention?: {
    topic: string;
    timestamp: Date;
    timeAgo: string; // "3 weeks ago", "last month"
  };

  /** How many times they've discussed this topic */
  topicFrequency?: {
    topic: string;
    count: number;
    pattern: string; // "keeps coming back to", "mentioned once", "regularly discusses"
  };

  /** Emotional context from past conversations */
  emotionalMemory?: {
    topic: string;
    lastEmotion: string; // "stressed", "curious", "frustrated"
    emotionalArc?: string; // "started anxious, ended hopeful"
    timestamp: Date;
    timeAgo: string;
  };

  /** Time patterns */
  timePattern?: {
    pattern: string; // "usually explores this late at night", "brings this up on Mondays"
    insight: string;
  };

  /** Growth observation */
  growthObservation?: {
    topic: string;
    observation: string; // "You've come a long way on this"
    evidence: string[];
  };

  /** Key moments related to topic */
  relatedMoments?: Array<{
    type: KeyMoment['type'];
    summary: string;
    timeAgo: string;
  }>;
}

export interface PersonalizedCopyContext {
  personalizedReason: string;
  connectionToConversations: string | null;
  superhumanTouch: string | null; // The "Better Than Human" detail
}

// ============================================================================
// TIME HELPERS
// ============================================================================

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return 'last week';
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return 'last month';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return 'a while back';
}

function getFrequencyPattern(count: number): string {
  if (count === 1) return 'mentioned once';
  if (count === 2) return 'brought up a couple times';
  if (count <= 4) return 'comes up sometimes';
  if (count <= 8) return 'regularly discusses';
  return 'keeps coming back to';
}

// ============================================================================
// MEMORY RETRIEVAL (from Firestore via store)
// ============================================================================

// Firestore types (minimal to avoid hard dependency)
interface Firestore {
  collection(path: string): CollectionRef;
}

interface CollectionRef {
  doc(id: string): DocumentRef;
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

interface DocumentRef {
  get(): Promise<DocumentSnapshot>;
  collection(path: string): CollectionRef;
}

interface Query {
  get(): Promise<QuerySnapshot>;
  limit(n: number): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  where(field: string, op: string, value: unknown): Query;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
}

interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

let firestoreDb: Firestore | null = null;
let firestoreInitialized = false;

async function getFirestore(): Promise<Firestore | null> {
  if (firestoreInitialized) return firestoreDb;

  try {
    const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
    firestoreDb = new FirestoreClass({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    }) as unknown as Firestore;
    firestoreInitialized = true;
    return firestoreDb;
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore not available for Better Than Human memory');
    firestoreInitialized = true;
    return null;
  }
}

/**
 * Get conversation summaries for a user
 */
async function getUserSummaries(userId: string, limit = 20): Promise<ConversationSummary[]> {
  const db = await getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    if (snapshot.empty) return [];

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sessionId: (data?.sessionId as string) || '',
        timestamp: data?.timestamp ? new Date(data.timestamp as string) : new Date(),
        duration: (data?.duration as number) || 0,
        turnCount: (data?.turnCount as number) || 0,
        mainTopics: (data?.mainTopics as string[]) || [],
        keyPoints: (data?.keyPoints as string[]) || [],
        emotionalArc: (data?.emotionalArc as string) || '',
        decisionsReached: data?.decisionsReached as string[] | undefined,
        questionsRemaining: data?.questionsRemaining as string[] | undefined,
        followUpItems: data?.followUpItems as string[] | undefined,
      };
    });
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get user summaries');
    return [];
  }
}

/**
 * Get key moments for a user
 */
async function getUserKeyMoments(userId: string, limit = 10): Promise<KeyMoment[]> {
  const db = await getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('key_moments')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    if (snapshot.empty) return [];

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: data?.timestamp ? new Date(data.timestamp as string) : new Date(),
        type: (data?.type as KeyMoment['type']) || 'milestone',
        summary: (data?.summary as string) || '',
        emotionalWeight: (data?.emotionalWeight as KeyMoment['emotionalWeight']) || 'medium',
        topics: (data?.topics as string[]) || [],
        followUpNeeded: data?.followUpNeeded as boolean | undefined,
      };
    });
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get key moments');
    return [];
  }
}

// ============================================================================
// SUPERHUMAN MEMORY ANALYSIS
// ============================================================================

/**
 * Build superhuman memory context for a topic
 */
export async function getSuperhumanMemoryContext(
  userId: string,
  topic: string
): Promise<SuperhumanMemoryContext> {
  const [summaries, keyMoments] = await Promise.all([
    getUserSummaries(userId, 30),
    getUserKeyMoments(userId, 20),
  ]);

  const context: SuperhumanMemoryContext = {};
  const topicLower = topic.toLowerCase();

  // Find all summaries mentioning this topic
  const relatedSummaries = summaries.filter((s) =>
    s.mainTopics.some((t) => t.toLowerCase().includes(topicLower))
  );

  // First mention
  if (relatedSummaries.length > 0) {
    const oldest = relatedSummaries[relatedSummaries.length - 1];
    context.firstMention = {
      topic,
      timestamp: oldest.timestamp,
      timeAgo: getTimeAgo(oldest.timestamp),
    };
  }

  // Topic frequency
  if (relatedSummaries.length > 0) {
    context.topicFrequency = {
      topic,
      count: relatedSummaries.length,
      pattern: getFrequencyPattern(relatedSummaries.length),
    };
  }

  // Emotional memory (most recent)
  const mostRecent = relatedSummaries[0];
  if (mostRecent && mostRecent.emotionalArc) {
    context.emotionalMemory = {
      topic,
      lastEmotion: extractDominantEmotion(mostRecent.emotionalArc),
      emotionalArc: mostRecent.emotionalArc,
      timestamp: mostRecent.timestamp,
      timeAgo: getTimeAgo(mostRecent.timestamp),
    };
  }

  // Time patterns
  const timePattern = analyzeTimePatterns(relatedSummaries);
  if (timePattern) {
    context.timePattern = timePattern;
  }

  // Related key moments
  const relatedMoments = keyMoments.filter((m) =>
    m.topics.some((t) => t.toLowerCase().includes(topicLower))
  );
  if (relatedMoments.length > 0) {
    context.relatedMoments = relatedMoments.slice(0, 3).map((m) => ({
      type: m.type,
      summary: m.summary,
      timeAgo: getTimeAgo(m.timestamp),
    }));
  }

  // Growth observation
  if (relatedSummaries.length >= 3) {
    const growth = detectGrowth(relatedSummaries, topic);
    if (growth) {
      context.growthObservation = growth;
    }
  }

  return context;
}

/**
 * Extract dominant emotion from emotional arc
 */
function extractDominantEmotion(arc: string): string {
  const emotions = [
    'anxious',
    'stressed',
    'frustrated',
    'curious',
    'hopeful',
    'excited',
    'calm',
    'reflective',
    'overwhelmed',
  ];
  const arcLower = arc.toLowerCase();

  // Check for "ended X" pattern first (final state matters most)
  const endedMatch = arcLower.match(/ended\s+(\w+)/);
  if (endedMatch) {
    const emotion = emotions.find((e) => endedMatch[1].includes(e));
    if (emotion) return emotion;
  }

  // Otherwise find first matching emotion
  for (const emotion of emotions) {
    if (arcLower.includes(emotion)) return emotion;
  }

  return 'reflective';
}

/**
 * Analyze time patterns in conversations
 */
function analyzeTimePatterns(
  summaries: ConversationSummary[]
): { pattern: string; insight: string } | null {
  if (summaries.length < 3) return null;

  const hours = summaries.map((s) => s.timestamp.getHours());
  const lateNightCount = hours.filter((h) => h >= 22 || h <= 4).length;
  const morningCount = hours.filter((h) => h >= 6 && h <= 10).length;

  if (lateNightCount / summaries.length > 0.5) {
    return {
      pattern: 'late night topic',
      insight: "You tend to explore this when it's quiet and late.",
    };
  }

  if (morningCount / summaries.length > 0.5) {
    return {
      pattern: 'morning topic',
      insight: 'This comes up when you start your day.',
    };
  }

  return null;
}

/**
 * Detect growth in how user discusses a topic
 */
function detectGrowth(
  summaries: ConversationSummary[],
  topic: string
): { topic: string; observation: string; evidence: string[] } | null {
  // Simple heuristic: compare earliest and most recent emotional arcs
  const oldest = summaries[summaries.length - 1];
  const newest = summaries[0];

  if (!oldest.emotionalArc || !newest.emotionalArc) return null;

  const negativeWords = ['anxious', 'stressed', 'frustrated', 'overwhelmed', 'stuck'];
  const positiveWords = ['hopeful', 'excited', 'calm', 'confident', 'clear'];

  const oldNegative = negativeWords.some((w) => oldest.emotionalArc.toLowerCase().includes(w));
  const newPositive = positiveWords.some((w) => newest.emotionalArc.toLowerCase().includes(w));

  if (oldNegative && newPositive) {
    return {
      topic,
      observation: "You've come a long way on this.",
      evidence: [
        `${getTimeAgo(oldest.timestamp)}: ${oldest.emotionalArc}`,
        `Recently: ${newest.emotionalArc}`,
      ],
    };
  }

  return null;
}

// ============================================================================
// PERSONALIZED COPY GENERATION
// ============================================================================

/**
 * Generate superhuman-level personalized copy for content recommendations
 */
export async function generateSuperhumanCopy(
  userId: string,
  topic: string,
  contentTitle: string
): Promise<PersonalizedCopyContext> {
  const memoryContext = await getSuperhumanMemoryContext(userId, topic);

  // Build personalized reason with superhuman touches
  let personalizedReason = `This landed with me. Made me think of you.`;
  let connectionToConversations: string | null = null;
  let superhumanTouch: string | null = null;

  // Priority 1: Specific time reference (most superhuman)
  if (memoryContext.firstMention && memoryContext.topicFrequency) {
    const { timeAgo } = memoryContext.firstMention;
    const { count, pattern } = memoryContext.topicFrequency;

    if (count > 1) {
      personalizedReason = `You first mentioned ${topic} ${timeAgo}. You ${pattern} it.`;
      superhumanTouch = `First came up ${timeAgo}`;
    } else {
      personalizedReason = `You mentioned ${topic} ${timeAgo}. This might help.`;
      superhumanTouch = `From our conversation ${timeAgo}`;
    }
  }

  // Priority 2: Emotional memory
  if (memoryContext.emotionalMemory) {
    const { lastEmotion, timeAgo } = memoryContext.emotionalMemory;
    connectionToConversations = `Last time we talked about ${topic}, you seemed ${lastEmotion}. This is different.`;

    if (!superhumanTouch) {
      superhumanTouch = `You were ${lastEmotion} about this ${timeAgo}`;
    }
  }

  // Priority 3: Growth observation (most meaningful)
  if (memoryContext.growthObservation) {
    personalizedReason = memoryContext.growthObservation.observation + ` This is the next step.`;
    superhumanTouch = "I've watched you grow on this";
  }

  // Priority 4: Time pattern insight
  if (memoryContext.timePattern) {
    if (!connectionToConversations) {
      connectionToConversations = memoryContext.timePattern.insight;
    }
  }

  // Priority 5: Key moment reference
  if (memoryContext.relatedMoments && memoryContext.relatedMoments.length > 0) {
    const moment = memoryContext.relatedMoments[0];
    if (moment.type === 'breakthrough') {
      connectionToConversations = `Remember that breakthrough ${moment.timeAgo}? This connects.`;
    } else if (moment.type === 'shared_vulnerability') {
      connectionToConversations = `You opened up about this ${moment.timeAgo}. Thought of you.`;
    }
  }

  log.debug(
    {
      userId,
      topic,
      hasMemoryContext: !!memoryContext.firstMention,
      superhumanTouch,
    },
    '🧠 Generated superhuman copy'
  );

  return {
    personalizedReason,
    connectionToConversations,
    superhumanTouch,
  };
}

/**
 * Get memory-enhanced recommendation reasons for multiple topics
 */
export async function getMemoryEnhancedReasons(
  userId: string,
  topics: string[]
): Promise<Map<string, PersonalizedCopyContext>> {
  const results = new Map<string, PersonalizedCopyContext>();

  // Process in parallel but limit concurrency
  const promises = topics.slice(0, 5).map(async (topic) => {
    const copy = await generateSuperhumanCopy(userId, topic, '');
    results.set(topic.toLowerCase(), copy);
  });

  await Promise.all(promises);
  return results;
}
