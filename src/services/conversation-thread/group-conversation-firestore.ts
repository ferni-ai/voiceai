/**
 * Group Conversation Firestore Service
 *
 * Handles persistence of group conversation data to Firestore.
 *
 * Firestore Structure:
 * ```
 * bogle_users/{userId}/
 *   group_sessions/{sessionId}/
 *     - metadata (session info)
 *     - participants[]
 *     - status
 *     - summary?
 *     transcript/
 *       full/
 *         - utterances[]
 *       action_items/
 *         {itemId}/
 *           - text
 *           - assignedTo?
 *           - status
 *     recordings/
 *       {recordingId}/
 *         - url
 *         - duration
 * ```
 *
 * @module services/group-conversation-firestore
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import type {
  GroupConversation,
  GroupParticipant,
  AttributedUtterance,
  GroupConversationSummary,
} from '../../types/group-conversation.js';

// ActionItem and KeyMoment types - defined locally to avoid circular import
// These match the types in agents/group-conversation/transcript-service.ts
interface ActionItem {
  text: string;
  assignedTo?: string;
  dueDate?: string;
  mentionedBy: string;
  timestamp: Date;
  confidence: number;
}

interface KeyMoment {
  type:
    | 'decision'
    | 'agreement'
    | 'disagreement'
    | 'breakthrough'
    | 'action_item'
    | 'emotion_shift'
    | 'topic_change';
  description: string;
  utteranceIds: string[];
  timestamp: Date;
}

const log = getLogger();

// ============================================================================
// TYPES (Firestore Documents)
// ============================================================================

/**
 * Firestore document for a group session
 */
export interface GroupSessionDocument {
  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** Room ID */
  roomId: string;

  /** Conversation mode */
  mode: 'team_roundtable' | 'conference_call' | 'hybrid';

  /** Topic */
  topic?: string;

  /** Session status */
  status: 'active' | 'ended' | 'error';

  /** All participants (denormalized for easy querying) */
  participants: ParticipantDocument[];

  /** When started */
  startedAt: string; // ISO timestamp

  /** When ended */
  endedAt?: string;

  /** Duration in ms */
  durationMs?: number;

  /** Summary (generated at end) */
  summary?: GroupConversationSummary;

  /** Metrics */
  metrics?: {
    totalUtterances: number;
    utterancesByType: Record<'human' | 'agent' | 'external', number>;
    avgResponseTimeMs?: number;
    externalCallTimeMs?: number;
    turnBalanceScore?: number;
  };

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Firestore document for a participant
 */
export interface ParticipantDocument {
  id: string;
  name: string;
  type: 'human' | 'agent' | 'external';
  role: string;
  personaId?: string;
  phoneNumber?: string;
  relationship?: string;
  joinedAt: string;
  leftAt?: string;
}

/**
 * Firestore document for transcript
 */
export interface TranscriptDocument {
  sessionId: string;
  utterances: UtteranceDocument[];
  wordCount: number;
  speakerCount: number;
  updatedAt: string;
}

/**
 * Firestore document for an utterance
 */
export interface UtteranceDocument {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: 'human' | 'agent' | 'external';
  text: string;
  timestamp: string;
  durationMs: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

/**
 * Firestore document for an action item
 */
export interface ActionItemDocument {
  id: string;
  sessionId: string;
  text: string;
  assignedTo?: string;
  mentionedBy: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'cancelled';
  completedAt?: string;
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save a group session to Firestore
 */
export async function saveGroupSession(
  userId: string,
  conversation: GroupConversation
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available - group session not saved');
    return { success: false, error: 'Firestore not available' };
  }

  try {
    const doc: GroupSessionDocument = {
      sessionId: conversation.sessionId,
      userId,
      roomId: conversation.roomId,
      mode: conversation.mode,
      topic: conversation.topic,
      status: conversation.endedAt ? 'ended' : 'active',
      participants: Array.from(conversation.participants.values()).map(participantToDocument),
      startedAt: conversation.startedAt.toISOString(),
      endedAt: conversation.endedAt?.toISOString(),
      durationMs: conversation.endedAt
        ? conversation.endedAt.getTime() - conversation.startedAt.getTime()
        : undefined,
      metrics: {
        totalUtterances: conversation.transcript.length,
        utterancesByType: countUtterancesByType(conversation.transcript),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(conversation.sessionId)
      .set(cleanForFirestore(doc), { merge: true });

    log.info({ userId, sessionId: conversation.sessionId }, '💾 Group session saved to Firestore');

    return { success: true };
  } catch (error) {
    log.error(
      { error: String(error), userId, sessionId: conversation.sessionId },
      'Failed to save group session'
    );
    return { success: false, error: String(error) };
  }
}

/**
 * Save transcript to Firestore
 */
export async function saveTranscript(
  userId: string,
  sessionId: string,
  utterances: AttributedUtterance[]
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore not available' };
  }

  try {
    const doc: TranscriptDocument = {
      sessionId,
      utterances: utterances.map(utteranceToDocument),
      wordCount: utterances.reduce((sum, u) => sum + u.text.split(/\s+/).length, 0),
      speakerCount: new Set(utterances.map((u) => u.speakerId)).size,
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .collection('transcript')
      .doc('full')
      .set(cleanForFirestore(doc));

    log.debug({ userId, sessionId, utteranceCount: utterances.length }, '💾 Transcript saved');

    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save transcript');
    return { success: false, error: String(error) };
  }
}

/**
 * Save action items to Firestore
 */
export async function saveActionItems(
  userId: string,
  sessionId: string,
  actionItems: ActionItem[]
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore not available' };
  }

  try {
    const batch = db.batch();
    const collectionRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .collection('action_items');

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      const docRef = collectionRef.doc(`item_${i}`);
      const doc: ActionItemDocument = {
        id: `item_${i}`,
        sessionId,
        text: item.text,
        assignedTo: item.assignedTo,
        mentionedBy: item.mentionedBy,
        timestamp: item.timestamp.toISOString(),
        status: 'pending',
      };
      batch.set(docRef, doc);
    }

    await batch.commit();

    log.debug({ userId, sessionId, count: actionItems.length }, '💾 Action items saved');

    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save action items');
    return { success: false, error: String(error) };
  }
}

/**
 * Update session summary
 */
export async function updateSessionSummary(
  userId: string,
  sessionId: string,
  summary: GroupConversationSummary
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore not available' };
  }

  try {
    // Convert Map to object for Firestore
    const participantSummaries: Record<string, any> = {};
    summary.participantSummaries.forEach((value, key) => {
      participantSummaries[key] = value;
    });

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .update(
        cleanForFirestore({
          summary: {
            keyPoints: summary.keyPoints,
            actionItems: summary.actionItems,
            decisions: summary.decisions,
            participantSummaries,
          },
          updatedAt: new Date().toISOString(),
        })
      );

    log.debug({ userId, sessionId }, '💾 Session summary updated');

    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update session summary');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

/**
 * Load group session from Firestore
 */
export async function loadGroupSession(
  userId: string,
  sessionId: string
): Promise<GroupSessionDocument | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as GroupSessionDocument;
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Failed to load group session');
    return null;
  }
}

/**
 * Load recent group sessions
 */
export async function loadRecentSessions(
  userId: string,
  limit = 20
): Promise<GroupSessionDocument[]> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(
      (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as GroupSessionDocument
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load recent sessions');
    return [];
  }
}

/**
 * Load transcript for a session
 */
export async function loadTranscript(
  userId: string,
  sessionId: string
): Promise<TranscriptDocument | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .collection('transcript')
      .doc('full')
      .get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as TranscriptDocument;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load transcript');
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function participantToDocument(participant: GroupParticipant): ParticipantDocument {
  return {
    id: participant.id,
    name: participant.name,
    type: participant.type,
    role: participant.role,
    personaId:
      participant.connection.type === 'agent' ? participant.connection.personaId : undefined,
    phoneNumber:
      participant.connection.type === 'sip' ? participant.connection.phoneNumber : undefined,
    relationship: participant.relationship,
    joinedAt: participant.joinedAt.toISOString(),
    leftAt: participant.leftAt?.toISOString(),
  };
}

function utteranceToDocument(utterance: AttributedUtterance): UtteranceDocument {
  return {
    id: utterance.id,
    speakerId: utterance.speakerId,
    speakerName: utterance.speakerName,
    speakerType: utterance.speakerType,
    text: utterance.text,
    timestamp: utterance.timestamp.toISOString(),
    durationMs: utterance.durationMs,
    sentiment: utterance.sentiment,
  };
}

function countUtterancesByType(
  utterances: AttributedUtterance[]
): Record<'human' | 'agent' | 'external', number> {
  const counts = { human: 0, agent: 0, external: 0 };
  for (const u of utterances) {
    counts[u.speakerType]++;
  }
  return counts;
}
