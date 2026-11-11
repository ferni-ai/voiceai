/**
 * Memory Continuity Service
 *
 * Writes a "memory capsule" to Firestore at session end for fast
 * session start hydration (< 100ms reads).
 *
 * @module memory/dynamic/memory-continuity
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { indexMemoriesBatch } from '../retrieval/semantic-memory-search.js';

const log = createLogger({ module: 'MemoryContinuity' });

// ============================================================================
// TYPES
// ============================================================================

/** Kinds of significant moment a session can leave in the capsule. */
export type MemoryAnchorType =
  | 'breakthrough' // Major insight or realization
  | 'commitment' // Promise or commitment made
  | 'milestone' // Life milestone or achievement
  | 'vulnerability' // Moment of vulnerability shared
  | 'growth' // Evidence of personal growth
  | 'pattern' // Recurring pattern identified
  | 'relationship' // Significant relationship event
  | 'emotional_peak'; // High emotional intensity moment

/** A significant moment detected at session end; the capsule keeps its type, summary and score. */
interface DetectedAnchor {
  anchorId: string;
  userId: string;
  anchorType: MemoryAnchorType;
  payload: { summary: string; context?: string; emotionalTone?: string; keywords?: string[] };
  significanceScore: number;
  sourceSessionId?: string;
}

/**
 * Compact memory capsule for fast first-turn hydration.
 * Stored in Firestore for sub-100ms reads.
 */
export interface MemoryCapsule {
  userId: string;
  /** Rolling summary of recent conversations */
  rollingSummary: string;
  /** Active conversation threads (themes) */
  activeThreads: Array<{
    theme: string;
    lastUpdated: string;
    sessionCount: number;
  }>;
  /** High-significance anchors for proactive recall */
  topAnchors: Array<{
    type: MemoryAnchorType;
    summary: string;
    significance: number;
  }>;
  /** Last emotional state */
  lastEmotionalState: string;
  /** Topics to follow up on */
  pendingTopics: string[];
  /** Last session ID */
  lastSessionId: string;
  /** Updated timestamp */
  updatedAt: string;
  /** Version for cache invalidation */
  version: number;
}

/**
 * Session summary data used to update continuity stores
 */
export interface SessionContinuityData {
  sessionId: string;
  userId: string;
  personaId?: string;
  /** Main topics discussed */
  mainTopics: string[];
  /** Natural language summary */
  naturalSummary: string;
  /** Insights generated */
  insights: Array<{
    type: 'pattern' | 'concern' | 'growth' | 'memory' | 'breakthrough';
    content: string;
    confidence: number;
  }>;
  /** Ending emotional state */
  endingEmotionalState: string;
  /** Emotional arc as string */
  emotionalArc?: string;
  /** Unfinished topics */
  unfinishedTopics: string[];
  /** Commitments made */
  commitmentsMade: string[];
  /** Was this significant */
  wasSignificant: boolean;
  /** Significance score 0-1 */
  significanceScore: number;
  /** Session duration in seconds */
  durationSeconds: number;
}

// ============================================================================
// ANCHOR DETECTION
// ============================================================================

/**
 * Detect anchors (significant memories) from session data
 */
function detectAnchors(data: SessionContinuityData): DetectedAnchor[] {
  const anchors: DetectedAnchor[] = [];
  const now = new Date();

  // 1. Breakthroughs from insights
  for (const insight of data.insights) {
    if (insight.type === 'breakthrough' && insight.confidence >= 0.7) {
      anchors.push({
        anchorId: `anchor_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: data.userId,
        anchorType: 'breakthrough',
        payload: {
          summary: insight.content,
          context: data.naturalSummary,
          keywords: data.mainTopics,
          emotionalTone: data.endingEmotionalState,
        },
        significanceScore: Math.min(insight.confidence + 0.1, 1.0),
        sourceSessionId: data.sessionId,
      });
    }
  }

  // 2. Commitments made
  for (const commitment of data.commitmentsMade) {
    if (commitment.length > 10) {
      anchors.push({
        anchorId: `anchor_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: data.userId,
        anchorType: 'commitment',
        payload: {
          summary: commitment,
          context: data.naturalSummary,
          keywords: data.mainTopics,
        },
        significanceScore: 0.75,
        sourceSessionId: data.sessionId,
      });
    }
  }

  // 3. Growth insights
  for (const insight of data.insights) {
    if (insight.type === 'growth' && insight.confidence >= 0.6) {
      anchors.push({
        anchorId: `anchor_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: data.userId,
        anchorType: 'growth',
        payload: {
          summary: insight.content,
          context: data.naturalSummary,
          keywords: data.mainTopics,
          emotionalTone: data.endingEmotionalState,
        },
        significanceScore: insight.confidence,
        sourceSessionId: data.sessionId,
      });
    }
  }

  // 4. High-significance sessions become anchors
  if (data.wasSignificant && data.significanceScore >= 0.8) {
    anchors.push({
      anchorId: `anchor_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: data.userId,
      anchorType: 'emotional_peak',
      payload: {
        summary: data.naturalSummary,
        context: `Significant conversation about: ${data.mainTopics.join(', ')}`,
        keywords: data.mainTopics,
        emotionalTone: data.endingEmotionalState,
      },
      significanceScore: data.significanceScore,
      sourceSessionId: data.sessionId,
    });
  }

  // 5. Pattern insights
  for (const insight of data.insights) {
    if (insight.type === 'pattern' && insight.confidence >= 0.65) {
      anchors.push({
        anchorId: `anchor_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: data.userId,
        anchorType: 'pattern',
        payload: {
          summary: insight.content,
          context: data.naturalSummary,
          keywords: data.mainTopics,
        },
        significanceScore: insight.confidence,
        sourceSessionId: data.sessionId,
      });
    }
  }

  return anchors.slice(0, 5); // Limit to 5 anchors per session
}

// ============================================================================
// MEMORY CAPSULE
// ============================================================================

/**
 * Create or update the memory capsule in Firestore
 * Uses a transaction to prevent race conditions when multiple sessions end simultaneously
 */
async function updateMemoryCapsule(
  data: SessionContinuityData,
  anchors: DetectedAnchor[]
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available, skipping capsule update');
    return;
  }

  try {
    const capsuleRef = db
      .collection('bogle_users')
      .doc(data.userId)
      .collection('memory_capsules')
      .doc('current');

    // Use a transaction to atomically read-modify-write
    await db.runTransaction(async (transaction) => {
      // Get existing capsule for version increment
      const existing = await transaction.get(capsuleRef);
      const existingCapsule = existing.data() as MemoryCapsule | undefined;
      const version = (existingCapsule?.version || 0) + 1;

      // Build capsule summary - merge with existing if present
      const rollingSummary = existingCapsule?.rollingSummary
        ? `${existingCapsule.rollingSummary}\n\n---\n\n${data.naturalSummary}`.slice(-2000)
        : data.naturalSummary;

      // Keep the existing threads (one per theme), newest first
      const existingThreadMap = new Map(
        (existingCapsule?.activeThreads || []).map((t) => [t.theme, t])
      );
      const activeThreads = Array.from(existingThreadMap.values())
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
        .slice(0, 10);

      // Merge anchors (keep top by significance)
      const existingAnchors = existingCapsule?.topAnchors || [];
      const newAnchors = anchors.map((a) => ({
        type: a.anchorType,
        summary: a.payload.summary,
        significance: a.significanceScore,
      }));
      const topAnchors = [...existingAnchors, ...newAnchors]
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 10);

      // Merge pending topics
      const pendingTopics = Array.from(
        new Set([...(existingCapsule?.pendingTopics || []), ...data.unfinishedTopics])
      ).slice(0, 10);

      const capsule: MemoryCapsule = {
        userId: data.userId,
        rollingSummary,
        activeThreads,
        topAnchors,
        lastEmotionalState: data.endingEmotionalState,
        pendingTopics,
        lastSessionId: data.sessionId,
        updatedAt: new Date().toISOString(),
        version,
      };

      transaction.set(capsuleRef, capsule);

      log.info(
        {
          userId: data.userId,
          version,
          threads: activeThreads.length,
          anchors: topAnchors.length,
        },
        '💊 Memory capsule updated'
      );
    });

    // Index session summary for semantic search (non-blocking)
    if (data.naturalSummary && data.naturalSummary.length > 20) {
      indexMemoriesBatch(data.userId, [
        {
          text: data.naturalSummary,
          source: 'session_summary',
          sourceId: data.sessionId,
          metadata: {
            topics: data.mainTopics,
            emotionalState: data.endingEmotionalState,
            significanceScore: data.significanceScore,
          },
        },
      ]).catch((err) => {
        log.debug({ error: String(err) }, 'Failed to index session summary for semantic search');
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId: data.userId }, 'Failed to update memory capsule');
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export interface ContinuityWriteResult {
  threadsUpdated: number;
  anchorsCreated: number;
  capsuleUpdated: boolean;
}

/**
 * Main entry point: write session data to the Firestore memory capsule
 *
 * Call this at session end after summary generation.
 *
 * @param data - Session summary data
 * @returns Write result with counts
 */
export async function writeSessionContinuity(
  data: SessionContinuityData
): Promise<ContinuityWriteResult> {
  const result: ContinuityWriteResult = {
    threadsUpdated: 0,
    anchorsCreated: 0,
    capsuleUpdated: false,
  };

  // Skip empty or trivial sessions
  if (!data.naturalSummary || data.durationSeconds < 30) {
    log.debug({ sessionId: data.sessionId }, 'Skipping trivial session for continuity');
    return result;
  }

  // Detect anchors and update the memory capsule in Firestore
  const anchors = detectAnchors(data);
  try {
    await updateMemoryCapsule(data, anchors);
    result.capsuleUpdated = true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to update memory capsule');
  }

  log.info(
    {
      sessionId: data.sessionId,
      userId: data.userId,
      threadsUpdated: result.threadsUpdated,
      anchorsCreated: result.anchorsCreated,
      capsuleUpdated: result.capsuleUpdated,
    },
    '🔗 Session continuity written'
  );

  return result;
}

/**
 * Get the current memory capsule for a user
 */
export async function getMemoryCapsule(userId: string): Promise<MemoryCapsule | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_capsules')
      .doc('current')
      .get();

    if (!doc.exists) return null;
    return doc.data() as MemoryCapsule;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get memory capsule');
    return null;
  }
}
