/**
 * Ferni Commitments - Proactive Intelligence V3.2
 *
 * Tracks Ferni's promises to users:
 * - "I'll check in about that"
 * - "Let's revisit this next time"
 * - "I won't bring that up again"
 * - "I'll remember that"
 *
 * This ensures Ferni keeps her promises - a key trust builder.
 *
 * @module services/superhuman/semantic-intelligence/ferni-commitments
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import { createInsight } from './insight-broker.js';

const log = createLogger({ module: 'ferni-commitments' });

// ============================================================================
// TYPES
// ============================================================================

export type CommitmentType =
  | 'check_in' // "I'll check in about that"
  | 'revisit' // "Let's talk about this more"
  | 'remember' // "I'll remember that"
  | 'avoid' // "I won't bring that up"
  | 'follow_up' // "Let me know how it goes"
  | 'research' // "I'll think about that"
  | 'celebrate'; // "We'll celebrate when..."

export interface FerniCommitment {
  id: string;
  userId: string;
  type: CommitmentType;

  // Content
  commitment: string;
  context: string;

  // Timing
  madeAt: Date;
  dueBy?: Date; // When it should be fulfilled

  // Tracking
  fulfilled: boolean;
  fulfilledAt?: Date;
  fulfilledHow?: string;

  // Avoidance tracking (for "avoid" type)
  violated?: boolean;
  violatedAt?: Date;

  // Metadata
  relatedTopic?: string;
  relatedPerson?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_COMMITMENTS: 50,

  // Default due windows by type (in hours)
  DUE_WINDOWS: {
    check_in: 168, // 1 week
    revisit: 336, // 2 weeks
    remember: null, // Forever
    avoid: null, // Forever
    follow_up: 168, // 1 week
    research: 168, // 1 week
    celebrate: 720, // 1 month
  },
};

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const COMMITMENT_PATTERNS: Array<{
  pattern: RegExp;
  type: CommitmentType;
  extractCommitment?: (match: RegExpMatchArray) => string;
}> = [
  // Check-in commitments
  {
    pattern: /\bi(?:'ll| will) check in (?:about |on )?(?:that|this|how)?\b/i,
    type: 'check_in',
  },
  {
    pattern: /\blet(?:'s| us) check in (?:about |on )?(?:that|this)?\b/i,
    type: 'check_in',
  },

  // Revisit commitments
  {
    pattern: /\blet(?:'s| us) (?:come back to|revisit|talk more about) (?:that|this)\b/i,
    type: 'revisit',
  },
  {
    pattern: /\bwe(?:'ll| will| should) (?:come back to|revisit|continue) this\b/i,
    type: 'revisit',
  },
  {
    pattern: /\bnext time (?:we can|let's) (\w+(?:\s+\w+){0,5})/i,
    type: 'revisit',
    extractCommitment: (m) => `Next time: ${m[1]}`,
  },

  // Remember commitments
  {
    pattern: /\bi(?:'ll| will) remember (?:that|this)\b/i,
    type: 'remember',
  },
  {
    pattern: /\bi(?:'ll| will) keep that in mind\b/i,
    type: 'remember',
  },
  {
    pattern: /\bnoted\b/i,
    type: 'remember',
  },

  // Avoidance commitments
  {
    pattern: /\bi(?:'ll| will)(?:n't| not) bring (?:that|this|it) up\b/i,
    type: 'avoid',
  },
  {
    pattern: /\bi(?:'ll| will) (?:avoid|stay away from) (?:that topic|mentioning)\b/i,
    type: 'avoid',
  },
  {
    pattern: /\bwe don(?:'t| not) have to talk about (?:that|this)\b/i,
    type: 'avoid',
  },

  // Follow-up commitments
  {
    pattern: /\blet me know how (?:it|that|this) goes\b/i,
    type: 'follow_up',
  },
  {
    pattern: /\bkeep me (?:posted|updated)\b/i,
    type: 'follow_up',
  },
  {
    pattern: /\bi(?:'d| would) love to hear how\b/i,
    type: 'follow_up',
  },

  // Celebrate commitments
  {
    pattern: /\bwe(?:'ll| will| should) celebrate\b/i,
    type: 'celebrate',
  },
  {
    pattern: /\bcan(?:'t| not) wait to hear\b/i,
    type: 'celebrate',
  },
];

// Topics to track for avoidance
const AVOIDANCE_TOPICS: string[] = []; // Populated per-user from their commitments

// ============================================================================
// CACHE
// ============================================================================

const commitmentCache = new Map<string, FerniCommitment[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a new Ferni commitment.
 */
export async function createCommitment(
  userId: string,
  commitment: {
    type: CommitmentType;
    commitment: string;
    context: string;
    dueBy?: Date;
    relatedTopic?: string;
    relatedPerson?: string;
  }
): Promise<FerniCommitment> {
  const now = new Date();
  const id = `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const dueWindow = CONFIG.DUE_WINDOWS[commitment.type];
  const dueBy =
    commitment.dueBy ??
    (dueWindow ? new Date(now.getTime() + dueWindow * 60 * 60 * 1000) : undefined);

  const ferniCommitment: FerniCommitment = {
    id,
    userId,
    type: commitment.type,
    commitment: commitment.commitment,
    context: commitment.context,
    madeAt: now,
    dueBy,
    fulfilled: false,
    relatedTopic: commitment.relatedTopic,
    relatedPerson: commitment.relatedPerson,
  };

  // Save
  await saveCommitment(userId, ferniCommitment);

  // Update cache
  const cached = commitmentCache.get(userId) ?? [];
  cached.push(ferniCommitment);
  commitmentCache.set(userId, cached);

  // Create proactive insight to fulfill
  if (commitment.type !== 'remember' && commitment.type !== 'avoid') {
    await createFulfillmentInsight(userId, ferniCommitment);
  }

  log.debug({ userId, type: commitment.type }, '🤝 Ferni commitment created');

  return ferniCommitment;
}

/**
 * Mark a commitment as fulfilled.
 */
export async function fulfillCommitment(
  userId: string,
  commitmentId: string,
  how?: string
): Promise<void> {
  const commitments = await loadCommitments(userId);
  const commitment = commitments.find((c) => c.id === commitmentId);

  if (commitment) {
    commitment.fulfilled = true;
    commitment.fulfilledAt = new Date();
    commitment.fulfilledHow = how;
    await saveCommitment(userId, commitment);

    log.debug({ userId, commitmentId, type: commitment.type }, '✅ Commitment fulfilled');
  }
}

/**
 * Check if Ferni violated an avoidance commitment.
 */
export async function checkAvoidanceViolation(
  userId: string,
  topic: string
): Promise<FerniCommitment | null> {
  const commitments = await loadCommitments(userId);
  const avoidances = commitments.filter((c) => c.type === 'avoid' && !c.fulfilled && !c.violated);

  for (const commitment of avoidances) {
    const shouldAvoid =
      commitment.relatedTopic?.toLowerCase() === topic.toLowerCase() ||
      commitment.context.toLowerCase().includes(topic.toLowerCase());

    if (shouldAvoid) {
      // Mark as violated
      commitment.violated = true;
      commitment.violatedAt = new Date();
      await saveCommitment(userId, commitment);

      log.warn({ userId, topic, commitmentId: commitment.id }, '⚠️ Avoidance commitment violated');

      return commitment;
    }
  }

  return null;
}

/**
 * Get pending commitments that need to be fulfilled.
 */
export async function getPendingCommitments(userId: string): Promise<FerniCommitment[]> {
  const commitments = await loadCommitments(userId);
  const now = new Date();

  return commitments
    .filter((c) => {
      if (c.fulfilled) return false;
      if (c.type === 'remember' || c.type === 'avoid') return false;
      if (c.dueBy && now > c.dueBy) return false; // Expired

      return true;
    })
    .sort((a, b) => {
      // Sort by due date (soonest first)
      if (a.dueBy && b.dueBy) return a.dueBy.getTime() - b.dueBy.getTime();
      if (a.dueBy) return -1;
      if (b.dueBy) return 1;
      return 0;
    });
}

/**
 * Get "remember" commitments (things Ferni should know).
 */
export async function getRememberedThings(userId: string): Promise<FerniCommitment[]> {
  const commitments = await loadCommitments(userId);
  return commitments.filter((c) => c.type === 'remember' && !c.fulfilled);
}

/**
 * Get topics to avoid.
 */
export async function getAvoidanceTopics(userId: string): Promise<string[]> {
  const commitments = await loadCommitments(userId);
  return commitments
    .filter((c) => c.type === 'avoid' && !c.fulfilled && !c.violated)
    .map((c) => c.relatedTopic ?? c.context)
    .filter(Boolean);
}

/**
 * Get all commitments for a user.
 */
export async function getAllCommitments(userId: string): Promise<FerniCommitment[]> {
  return loadCommitments(userId);
}

// ============================================================================
// DETECTION IN RESPONSE
// ============================================================================

/**
 * Detect commitments in Ferni's response.
 */
export function detectCommitmentsInResponse(responseText: string): Array<{
  type: CommitmentType;
  commitment: string;
  matchedText: string;
}> {
  const detected: Array<{
    type: CommitmentType;
    commitment: string;
    matchedText: string;
  }> = [];

  for (const { pattern, type, extractCommitment } of COMMITMENT_PATTERNS) {
    const match = responseText.match(pattern);
    if (match) {
      detected.push({
        type,
        commitment: extractCommitment ? extractCommitment(match) : match[0],
        matchedText: match[0],
      });
    }
  }

  return detected;
}

/**
 * Process Ferni's response and create commitments.
 */
export async function trackCommitmentsInResponse(
  userId: string,
  responseText: string,
  context: {
    topic?: string;
    person?: string;
    userMessage?: string;
  }
): Promise<FerniCommitment[]> {
  if (!userId || userId === 'anonymous') return [];

  const detected = detectCommitmentsInResponse(responseText);
  const created: FerniCommitment[] = [];

  for (const item of detected) {
    const commitment = await createCommitment(userId, {
      type: item.type,
      commitment: item.commitment,
      context: context.userMessage ?? responseText.slice(0, 200),
      relatedTopic: context.topic,
      relatedPerson: context.person,
    });
    created.push(commitment);
  }

  if (created.length > 0) {
    log.debug({ userId, count: created.length }, '🤝 Tracked Ferni commitments from response');
  }

  return created;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

async function createFulfillmentInsight(
  userId: string,
  commitment: FerniCommitment
): Promise<void> {
  const insightText = generateFulfillmentText(commitment);
  if (!insightText) return;

  await createInsight(userId, {
    source: 'commitment',
    priority: 'high',
    insight: insightText,
    context: commitment.context,
    surfaceWhen: [
      { type: 'session_start' },
      ...(commitment.relatedTopic
        ? [
            {
              type: 'topic' as const,
              value: commitment.relatedTopic,
              condition: 'contains' as const,
            },
          ]
        : []),
      ...(commitment.relatedPerson
        ? [
            {
              type: 'person' as const,
              value: commitment.relatedPerson,
              condition: 'contains' as const,
            },
          ]
        : []),
    ],
    surfaceAfter: commitment.madeAt,
    expiresAt: commitment.dueBy,
    relatedEntities: [
      ...(commitment.relatedPerson ? [commitment.relatedPerson] : []),
      ...(commitment.relatedTopic ? [commitment.relatedTopic] : []),
    ],
    confidence: 0.9,
  });
}

function generateFulfillmentText(commitment: FerniCommitment): string | null {
  switch (commitment.type) {
    case 'check_in':
      return `I said I'd check in about ${commitment.relatedTopic ?? 'something'}. How's that going?`;
    case 'revisit':
      return `We were going to come back to ${commitment.relatedTopic ?? 'our conversation'}. Want to pick that up?`;
    case 'follow_up':
      return `You were going to let me know about ${commitment.relatedTopic ?? 'something'}. Any updates?`;
    case 'celebrate':
      return `I said we'd celebrate ${commitment.relatedTopic ?? 'together'}. Is there good news?`;
    case 'research':
      return `I was thinking about ${commitment.relatedTopic ?? 'something you mentioned'}. Here's what I thought...`;
    default:
      return null;
  }
}

// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================

/**
 * Format commitments for LLM context injection.
 */
export function formatCommitmentsForContext(
  commitments: FerniCommitment[],
  avoidanceTopics: string[]
): string {
  if (commitments.length === 0 && avoidanceTopics.length === 0) return '';

  const lines = [
    '═══════════════════════════════════════════════════════════',
    "FERNI'S COMMITMENTS - Keep your promises!",
    '═══════════════════════════════════════════════════════════',
    '',
  ];

  // Pending commitments
  const pending = commitments.filter(
    (c) => !c.fulfilled && c.type !== 'avoid' && c.type !== 'remember'
  );
  if (pending.length > 0) {
    lines.push('PENDING FOLLOW-UPS:');
    for (const c of pending) {
      const dueStr = c.dueBy ? ` (due by ${c.dueBy.toLocaleDateString()})` : '';
      lines.push(`- ${c.commitment}${dueStr}`);
    }
    lines.push('');
  }

  // Things to remember
  const remembered = commitments.filter((c) => c.type === 'remember' && !c.fulfilled);
  if (remembered.length > 0) {
    lines.push('THINGS TO REMEMBER:');
    for (const c of remembered) {
      lines.push(`- ${c.context.slice(0, 100)}`);
    }
    lines.push('');
  }

  // Topics to avoid
  if (avoidanceTopics.length > 0) {
    lines.push('⚠️ TOPICS TO AVOID (you promised):');
    for (const topic of avoidanceTopics) {
      lines.push(`- ${topic}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadCommitments(userId: string): Promise<FerniCommitment[]> {
  // Check cache
  const cached = commitmentCache.get(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('ferni_commitments')
      .orderBy('madeAt', 'desc')
      .limit(CONFIG.MAX_COMMITMENTS)
      .get();

    const commitments = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        madeAt: data.madeAt?.toDate?.() ?? new Date(data.madeAt),
        dueBy: data.dueBy?.toDate?.() ?? (data.dueBy ? new Date(data.dueBy) : undefined),
        fulfilledAt:
          data.fulfilledAt?.toDate?.() ??
          (data.fulfilledAt ? new Date(data.fulfilledAt) : undefined),
        violatedAt:
          data.violatedAt?.toDate?.() ?? (data.violatedAt ? new Date(data.violatedAt) : undefined),
      } as FerniCommitment;
    });

    commitmentCache.set(userId, commitments);
    return commitments;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load commitments');
    return [];
  }
}

async function saveCommitment(userId: string, commitment: FerniCommitment): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('ferni_commitments')
      .doc(commitment.id)
      .set(cleanForFirestore(commitment));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save commitment');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearCommitmentCache(userId?: string): void {
  if (userId) {
    commitmentCache.delete(userId);
  } else {
    commitmentCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniCommitments = {
  create: createCommitment,
  fulfill: fulfillCommitment,
  checkAvoidance: checkAvoidanceViolation,
  getPending: getPendingCommitments,
  getRemembered: getRememberedThings,
  getAvoidanceTopics,
  getAll: getAllCommitments,
  detectInResponse: detectCommitmentsInResponse,
  trackInResponse: trackCommitmentsInResponse,
  format: formatCommitmentsForContext,
  clearCache: clearCommitmentCache,
};

export default ferniCommitments;
