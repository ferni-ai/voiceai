/**
 * Family Context Sharing Service
 *
 * Manages what context can be shared between family members and sponsors.
 * Implements privacy boundaries and explicit sharing controls.
 *
 * PRIVACY PRINCIPLES:
 * - Specific conversation content is NEVER shared unless explicitly requested
 * - Only aggregate emotional patterns can be shared
 * - Explicit "share with X" requests are honored
 * - Health details beyond general wellness stay private
 *
 * @module services/family/family-context-sharing
 */

import { getFirestore } from '../memory/firestore-factory.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'FamilyContextSharing' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of shareable context between family members.
 */
export type ShareableContextType =
  | 'emotional_state' // General emotional state hint
  | 'explicit_share' // Explicitly requested to share
  | 'milestone' // Achievement or positive milestone
  | 'check_in_request' // Asked Ferni to check in on the other person
  | 'thinking_of_you'; // Mentioned thinking of the other person

/**
 * A shareable context item between family members.
 */
export interface ShareableContext {
  id: string;
  type: ShareableContextType;

  /** Who generated this context (their familyUserId or userId) */
  fromUserId: string;
  /** Display name of source */
  fromName: string;
  /** Relationship of source */
  fromRelationship: string;

  /** Who should receive this context */
  toUserId: string;

  /** Summary content (privacy-safe) */
  summary: string;

  /** When this context was created */
  createdAt: Date;

  /** When this context expires (auto-cleanup) */
  expiresAt: Date;

  /** Whether this context has been delivered */
  delivered: boolean;

  /** Session ID where context was generated */
  sourceSessionId?: string;
}

/**
 * Emotional state summary (privacy-safe aggregate).
 */
export interface EmotionalStateSummary {
  /** General emotional valence: positive, neutral, negative, mixed */
  valence: 'positive' | 'neutral' | 'negative' | 'mixed';

  /** Brief, safe description */
  description: string;

  /** Last conversation timestamp */
  lastConversationAt: Date;

  /** Any notable topics (only non-sensitive) */
  notableTopics?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'family_shared_context';
const CONTEXT_TTL_DAYS = 3; // Context expires after 3 days

// Topics that should NEVER be shared
const PRIVATE_TOPICS = new Set([
  'health',
  'medical',
  'therapy',
  'medication',
  'diagnosis',
  'money',
  'debt',
  'divorce',
  'affair',
  'addiction',
  'substance',
  'suicide',
  'self-harm',
  'abuse',
]);

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/**
 * Create shareable context from one family member to another.
 * Enforces privacy boundaries automatically.
 */
export async function createShareableContext(params: {
  type: ShareableContextType;
  fromUserId: string;
  fromName: string;
  fromRelationship: string;
  toUserId: string;
  summary: string;
  sourceSessionId?: string;
}): Promise<ShareableContext | null> {
  // Check privacy boundaries
  if (containsPrivateTopics(params.summary)) {
    log.info(
      { fromUserId: params.fromUserId, type: params.type },
      '🔒 Context not shared - contains private topics'
    );
    return null;
  }

  const db = getFirestore();
  const id = `fctx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CONTEXT_TTL_DAYS);

  const context: ShareableContext = {
    id,
    type: params.type,
    fromUserId: params.fromUserId,
    fromName: params.fromName,
    fromRelationship: params.fromRelationship,
    toUserId: params.toUserId,
    summary: sanitizeSummary(params.summary),
    createdAt: new Date(),
    expiresAt,
    delivered: false,
    sourceSessionId: params.sourceSessionId,
  };

  if (db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).set(context);
    } catch (error) {
      log.error({ error, id }, 'Failed to save shared context to Firestore');
    }
  }

  log.info(
    {
      id,
      type: params.type,
      fromName: params.fromName,
      toUserId: params.toUserId,
    },
    '🔗 Created shareable family context'
  );

  return context;
}

/**
 * Create an explicit share request (user specifically asked to share something).
 */
export async function createExplicitShare(params: {
  fromUserId: string;
  fromName: string;
  fromRelationship: string;
  toUserId: string;
  message: string;
  sourceSessionId?: string;
}): Promise<ShareableContext | null> {
  return createShareableContext({
    type: 'explicit_share',
    ...params,
    summary: params.message,
  });
}

/**
 * Create a check-in request (one family member asked Ferni to check on another).
 */
export async function createCheckInRequest(params: {
  fromUserId: string;
  fromName: string;
  fromRelationship: string;
  toUserId: string;
  reason?: string;
  sourceSessionId?: string;
}): Promise<ShareableContext | null> {
  const summary = params.reason
    ? `${params.fromName} asked me to check in on you: "${params.reason}"`
    : `${params.fromName} asked me to check in on you`;

  return createShareableContext({
    type: 'check_in_request',
    ...params,
    summary,
  });
}

/**
 * Create a "thinking of you" context (mentioned they're thinking of the other person).
 */
export async function createThinkingOfYouContext(params: {
  fromUserId: string;
  fromName: string;
  fromRelationship: string;
  toUserId: string;
  sourceSessionId?: string;
}): Promise<ShareableContext | null> {
  return createShareableContext({
    type: 'thinking_of_you',
    ...params,
    summary: `${params.fromName} mentioned they're thinking of you`,
  });
}

// ============================================================================
// CONTEXT RETRIEVAL
// ============================================================================

/**
 * Get pending shareable contexts for a user.
 * Returns contexts that haven't been delivered yet.
 */
export async function getPendingContexts(userId: string): Promise<ShareableContext[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    const now = new Date();
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('toUserId', '==', userId)
      .where('delivered', '==', false)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    return snapshot.docs.map(docToContext);
  } catch (error) {
    log.error({ error, userId }, 'Failed to get pending contexts');
    return [];
  }
}

/**
 * Mark contexts as delivered.
 */
export async function markContextsDelivered(ids: string[]): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    const batch = db.batch();
    for (const id of ids) {
      batch.update(db.collection(COLLECTION_NAME).doc(id), { delivered: true });
    }
    await batch.commit();
  } catch (error) {
    log.error({ error, ids }, 'Failed to mark contexts as delivered');
  }
}

// ============================================================================
// EMOTIONAL STATE ANALYSIS (Privacy-Safe)
// ============================================================================

/**
 * Get a privacy-safe emotional state summary for a user.
 * This is the only emotional data that can be shared.
 */
export async function getEmotionalStateSummary(
  userId: string
): Promise<EmotionalStateSummary | null> {
  // For now, return a default summary
  // In production, this would analyze recent conversation patterns
  // using only aggregate, non-specific data

  // TODO: Implement actual analysis from conversation history
  // - Check last conversation timestamp
  // - Analyze overall sentiment without specific content
  // - Identify safe topics discussed

  return null; // Return null until implemented
}

// ============================================================================
// HELPERS
// ============================================================================

function docToContext(doc: FirebaseFirestore.DocumentSnapshot): ShareableContext {
  const data = doc.data()!;
  return {
    id: doc.id,
    type: data.type,
    fromUserId: data.fromUserId,
    fromName: data.fromName,
    fromRelationship: data.fromRelationship,
    toUserId: data.toUserId,
    summary: data.summary,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    expiresAt: data.expiresAt?.toDate?.() || new Date(data.expiresAt),
    delivered: data.delivered,
    sourceSessionId: data.sourceSessionId,
  };
}

/**
 * Check if text contains private topics that shouldn't be shared.
 */
function containsPrivateTopics(text: string): boolean {
  const lower = text.toLowerCase();
  for (const topic of PRIVATE_TOPICS) {
    if (lower.includes(topic)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize summary to remove any potentially private details.
 */
function sanitizeSummary(summary: string): string {
  // Remove any numbers that might be phone numbers, amounts, etc.
  let sanitized = summary.replace(/\b\d{3,}\b/g, '[number]');

  // Truncate if too long
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired contexts.
 */
export async function cleanupExpiredContexts(): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;

  const now = new Date();

  try {
    const snapshot = await db.collection(COLLECTION_NAME).where('expiresAt', '<', now).get();

    if (snapshot.empty) return 0;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log.info({ count: snapshot.size }, '🧹 Cleaned up expired family contexts');
    return snapshot.size;
  } catch (error) {
    log.error({ error }, 'Failed to cleanup expired contexts');
    return 0;
  }
}
