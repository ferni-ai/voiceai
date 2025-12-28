/**
 * Protective Silence - Better Than Human Boundary Memory
 *
 * Remembers what NOT to say - topics to avoid, sensitive areas, and
 * emotional landmines that could hurt this person.
 *
 * WHY IT'S SUPERHUMAN: Most friends accidentally step on emotional landmines.
 * Ferni remembers them all and never forgets a boundary.
 *
 * @module services/superhuman/protective-silence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'ProtectiveSilence' });

// ============================================================================
// TYPES
// ============================================================================

export type BoundarySeverity =
  | 'never' // Absolutely never bring up
  | 'only_if_they_bring_up' // Only if they initiate
  | 'gentle_only' // Can mention but be very careful
  | 'time_sensitive'; // Avoid for now, revisit later

export type BoundaryCategory =
  | 'loss' // Death, relationship end, job loss
  | 'trauma' // Past traumatic events
  | 'health' // Health issues they're sensitive about
  | 'family' // Family issues
  | 'relationship' // Romantic relationship issues
  | 'work' // Career/job sensitive topics
  | 'financial' // Money matters
  | 'identity' // Identity-related sensitivity
  | 'comparison' // People/things not to compare to
  | 'achievement' // Failed goals, unmet expectations
  | 'other';

export interface ProtectiveBoundary {
  id?: string;
  userId: string;
  /** The topic or subject to avoid */
  topic: string;
  /** How severe is this boundary */
  severity: BoundarySeverity;
  /** Category of the boundary */
  category: BoundaryCategory;
  /** Why this is sensitive (context for LLM) */
  reason?: string;
  /** Keywords that might trigger this topic */
  triggerKeywords: string[];
  /** Safe alternative topics to redirect to */
  safeAlternatives?: string[];
  /** When this expires (for time-sensitive boundaries) */
  expiresAt?: number;
  /** When was this created */
  createdAt: number;
  /** Last time this was confirmed still sensitive */
  lastConfirmed?: number;
  /** Source: did user explicitly state this or was it inferred */
  source: 'user_stated' | 'inferred' | 'detected_reaction';
}

export interface BoundaryCheckResult {
  isSafe: boolean;
  matchedBoundaries: ProtectiveBoundary[];
  guidance: string;
  alternatives?: string[];
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a new protective boundary.
 */
export async function recordBoundary(
  userId: string,
  boundary: Omit<ProtectiveBoundary, 'id' | 'userId' | 'createdAt'>
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping boundary');
    return null;
  }

  try {
    const record: ProtectiveBoundary = {
      userId,
      ...boundary,
      createdAt: Date.now(),
    };

    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('protective_boundaries')
      .add(cleanForFirestore(record));

    log.info(
      { userId, topic: boundary.topic, severity: boundary.severity },
      'Recorded protective boundary'
    );

    return docRef.id;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record boundary');
    return null;
  }
}

/**
 * Update or confirm a boundary.
 */
export async function updateBoundary(
  userId: string,
  boundaryId: string,
  updates: Partial<Pick<ProtectiveBoundary, 'severity' | 'lastConfirmed' | 'expiresAt'>>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('protective_boundaries')
      .doc(boundaryId)
      .update(cleanForFirestore(updates));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to update boundary');
  }
}

/**
 * Remove a boundary (user says it's okay now).
 */
export async function removeBoundary(userId: string, boundaryId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('protective_boundaries')
      .doc(boundaryId)
      .delete();

    log.info({ userId, boundaryId }, 'Removed protective boundary');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to remove boundary');
  }
}

/**
 * Load all active boundaries.
 */
export async function loadBoundaries(userId: string): Promise<ProtectiveBoundary[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('protective_boundaries')
      .get();

    const boundaries = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ProtectiveBoundary[];

    // Filter out expired boundaries
    const now = Date.now();
    return boundaries.filter((b) => !b.expiresAt || b.expiresAt > now);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load boundaries');
    return [];
  }
}

// ============================================================================
// BOUNDARY CHECKING
// ============================================================================

/**
 * Check if a message/topic crosses any boundaries.
 */
export function checkBoundaries(
  text: string,
  boundaries: ProtectiveBoundary[]
): BoundaryCheckResult {
  const textLower = text.toLowerCase();
  const matchedBoundaries: ProtectiveBoundary[] = [];

  for (const boundary of boundaries) {
    // Check topic
    if (
      boundary.topic
        .toLowerCase()
        .split(' ')
        .some((word) => textLower.includes(word))
    ) {
      matchedBoundaries.push(boundary);
      continue;
    }

    // Check trigger keywords
    for (const keyword of boundary.triggerKeywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        matchedBoundaries.push(boundary);
        break;
      }
    }
  }

  if (matchedBoundaries.length === 0) {
    return {
      isSafe: true,
      matchedBoundaries: [],
      guidance: '',
    };
  }

  // Find the most severe boundary
  const severityOrder: BoundarySeverity[] = [
    'never',
    'only_if_they_bring_up',
    'gentle_only',
    'time_sensitive',
  ];
  const sorted = [...matchedBoundaries].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
  );

  const mostSevere = sorted[0];
  let guidance: string;

  switch (mostSevere.severity) {
    case 'never':
      guidance =
        `⛔ DO NOT bring up "${mostSevere.topic}". ${mostSevere.reason || ''}. ` +
        `If they mention it, acknowledge briefly but don't probe.`;
      break;
    case 'only_if_they_bring_up':
      guidance = `⚠️ "${mostSevere.topic}" is sensitive. Only discuss if THEY bring it up first. ${mostSevere.reason || ''}`;
      break;
    case 'gentle_only':
      guidance = `🤏 Be extra gentle around "${mostSevere.topic}". ${mostSevere.reason || ''}`;
      break;
    case 'time_sensitive':
      guidance = `⏰ "${mostSevere.topic}" is temporarily sensitive. ${mostSevere.reason || ''}`;
      break;
  }

  // Collect alternatives
  const alternatives = matchedBoundaries
    .flatMap((b) => b.safeAlternatives || [])
    .filter((a, i, arr) => arr.indexOf(a) === i);

  return {
    isSafe: mostSevere.severity === 'gentle_only' || mostSevere.severity === 'time_sensitive',
    matchedBoundaries,
    guidance,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

/**
 * Detect boundaries from conversation patterns.
 * Call this when user shows signs of discomfort.
 */
export async function inferBoundaryFromReaction(
  userId: string,
  topic: string,
  reactionType: 'deflected' | 'went_silent' | 'changed_subject' | 'showed_distress',
  context?: string
): Promise<void> {
  // Map reaction to suggested severity
  const severityMap: Record<typeof reactionType, BoundarySeverity> = {
    deflected: 'gentle_only',
    went_silent: 'only_if_they_bring_up',
    changed_subject: 'only_if_they_bring_up',
    showed_distress: 'never',
  };

  // Check if boundary already exists
  const existing = await loadBoundaries(userId);
  const existingBoundary = existing.find((b) => b.topic.toLowerCase() === topic.toLowerCase());

  if (existingBoundary) {
    // Potentially escalate severity if reaction was more severe
    const currentIndex = [
      'gentle_only',
      'time_sensitive',
      'only_if_they_bring_up',
      'never',
    ].indexOf(existingBoundary.severity);
    const newIndex = ['gentle_only', 'time_sensitive', 'only_if_they_bring_up', 'never'].indexOf(
      severityMap[reactionType]
    );

    if (newIndex > currentIndex && existingBoundary.id) {
      await updateBoundary(userId, existingBoundary.id, {
        severity: severityMap[reactionType],
        lastConfirmed: Date.now(),
      });
    }
    return;
  }

  // Create new inferred boundary
  await recordBoundary(userId, {
    topic,
    severity: severityMap[reactionType],
    category: 'other',
    reason: context
      ? `Inferred from reaction: ${context}`
      : `User ${reactionType} when this came up`,
    triggerKeywords: topic
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 3),
    source: 'detected_reaction',
  });
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export async function buildProtectiveSilenceContext(userId: string): Promise<string> {
  const boundaries = await loadBoundaries(userId);

  if (boundaries.length === 0) {
    return '';
  }

  const sections: string[] = [];
  sections.push('[PROTECTIVE SILENCE - What NOT to Say]');
  sections.push('You remember sensitive topics that could hurt this person.\n');

  // Group by severity
  const never = boundaries.filter((b) => b.severity === 'never');
  const onlyIfThey = boundaries.filter((b) => b.severity === 'only_if_they_bring_up');
  const gentle = boundaries.filter((b) => b.severity === 'gentle_only');
  const timeSensitive = boundaries.filter((b) => b.severity === 'time_sensitive');

  if (never.length > 0) {
    sections.push('⛔ NEVER bring up:');
    for (const b of never) {
      sections.push(`  • ${b.topic}${b.reason ? ` (${b.reason})` : ''}`);
    }
  }

  if (onlyIfThey.length > 0) {
    sections.push('\n⚠️ Only discuss if THEY bring it up first:');
    for (const b of onlyIfThey) {
      sections.push(`  • ${b.topic}`);
    }
  }

  if (gentle.length > 0) {
    sections.push('\n🤏 Tread gently around:');
    for (const b of gentle) {
      sections.push(`  • ${b.topic}`);
    }
  }

  if (timeSensitive.length > 0) {
    sections.push('\n⏰ Currently sensitive (may change):');
    for (const b of timeSensitive) {
      const daysRemaining = b.expiresAt
        ? Math.ceil((b.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
        : '?';
      sections.push(`  • ${b.topic} (${daysRemaining} days remaining)`);
    }
  }

  return sections.join('\n');
}

/**
 * Quick check if a response would cross boundaries.
 */
export async function checkResponseSafety(
  userId: string,
  proposedResponse: string
): Promise<BoundaryCheckResult> {
  const boundaries = await loadBoundaries(userId);
  return checkBoundaries(proposedResponse, boundaries);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const protectiveSilence = {
  record: recordBoundary,
  update: updateBoundary,
  remove: removeBoundary,
  load: loadBoundaries,
  check: checkBoundaries,
  inferFromReaction: inferBoundaryFromReaction,
  checkResponseSafety,
  buildContext: buildProtectiveSilenceContext,
};
