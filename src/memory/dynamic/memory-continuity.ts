/**
 * Memory Continuity Service
 *
 * Implements dual-write to Firestore (fast) and Spanner (durable) for
 * long-term memory continuity. Creates "memory capsules" for fast
 * session start hydration.
 *
 * Architecture:
 * - Firestore: Fast reads for first-turn hydration (< 100ms)
 * - Spanner: Durable thread state + anchors for weeks/months recall
 *
 * @module memory/dynamic/memory-continuity
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  upsertMemoryThread,
  insertMemoryAnchor,
  getMemoryThreadByTheme,
  isSpannerReady,
  type MemoryThread,
  type MemoryAnchor,
  type MemoryAnchorType,
} from '../spanner-graph/index.js';
import { indexMemoriesBatch, type MemorySourceType } from '../retrieval/semantic-memory-search.js';

const log = createLogger({ module: 'MemoryContinuity' });

// ============================================================================
// TYPES
// ============================================================================

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
// THREAD MANAGEMENT
// ============================================================================

/**
 * Extract themes from topics for thread tracking
 */
function extractThemesFromTopics(topics: string[]): string[] {
  // Normalize and deduplicate themes
  const themes = new Set<string>();
  for (const topic of topics) {
    // Simple theme extraction - could be enhanced with LLM
    const normalized = topic.toLowerCase().trim();
    if (normalized.length > 2 && normalized.length < 100) {
      themes.add(normalized);
    }
  }
  return Array.from(themes).slice(0, 5);
}

/**
 * Update or create memory threads based on session topics
 */
async function updateMemoryThreads(data: SessionContinuityData): Promise<MemoryThread[]> {
  const themes = extractThemesFromTopics(data.mainTopics);
  const updatedThreads: MemoryThread[] = [];
  const now = new Date();

  for (const theme of themes) {
    try {
      // Check if thread exists
      const existingThread = await getMemoryThreadByTheme(data.userId, theme);

      if (existingThread) {
        // Update existing thread
        const updatedThread: Omit<MemoryThread, 'createdAt'> = {
          ...existingThread,
          rollingSummary: data.naturalSummary
            ? `${existingThread.rollingSummary || ''}\n\n[${now.toISOString().split('T')[0]}] ${data.naturalSummary}`.slice(
                -4000
              )
            : existingThread.rollingSummary,
          lastEmotionalArc: data.emotionalArc || existingThread.lastEmotionalArc,
          confidence: Math.min(existingThread.confidence + 0.05, 0.95),
          sessionCount: existingThread.sessionCount + 1,
          lastSessionId: data.sessionId,
          lastUpdated: now,
        };
        await upsertMemoryThread(updatedThread);
        updatedThreads.push({ ...updatedThread, createdAt: existingThread.createdAt });
      } else {
        // Create new thread
        const newThread: Omit<MemoryThread, 'createdAt'> = {
          threadId: `thread_${data.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId: data.userId,
          theme,
          rollingSummary: data.naturalSummary,
          lastEmotionalArc: data.emotionalArc,
          confidence: 0.5,
          sessionCount: 1,
          firstSessionId: data.sessionId,
          lastSessionId: data.sessionId,
          firstMentioned: now,
          lastUpdated: now,
        };
        await upsertMemoryThread(newThread);
        updatedThreads.push({ ...newThread, createdAt: now });
      }
    } catch (error) {
      log.warn({ error: String(error), theme }, 'Failed to update memory thread');
    }
  }

  return updatedThreads;
}

// ============================================================================
// ANCHOR DETECTION
// ============================================================================

/**
 * Detect anchors (significant memories) from session data
 */
function detectAnchors(
  data: SessionContinuityData
): Array<Omit<MemoryAnchor, 'createdAt' | 'recallCount'>> {
  const anchors: Array<Omit<MemoryAnchor, 'createdAt' | 'recallCount'>> = [];
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

/**
 * Write detected anchors to Spanner and index for semantic search
 */
async function writeAnchors(
  anchors: Array<Omit<MemoryAnchor, 'createdAt' | 'recallCount'>>
): Promise<number> {
  let written = 0;
  const anchorsToIndex: Array<{
    text: string;
    source: MemorySourceType;
    sourceId: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const anchor of anchors) {
    try {
      // Write to Spanner
      await insertMemoryAnchor(anchor);
      written++;

      // Prepare for semantic indexing
      anchorsToIndex.push({
        text: `${anchor.payload.summary}${anchor.payload.context ? ` - ${anchor.payload.context}` : ''}`,
        source: 'anchor',
        sourceId: anchor.anchorId,
        metadata: {
          anchorType: anchor.anchorType,
          significanceScore: anchor.significanceScore,
          keywords: anchor.payload.keywords,
          sessionId: anchor.sourceSessionId,
        },
      });
    } catch (error) {
      log.warn({ error: String(error), anchorId: anchor.anchorId }, 'Failed to write anchor');
    }
  }

  // Index all anchors for semantic search (non-blocking)
  if (anchorsToIndex.length > 0 && anchors[0]?.userId) {
    indexMemoriesBatch(anchors[0].userId, anchorsToIndex).catch((err) => {
      log.debug({ error: String(err) }, 'Failed to index anchors for semantic search');
    });
  }

  return written;
}

// ============================================================================
// MEMORY CAPSULE
// ============================================================================

/**
 * Create or update the memory capsule in Firestore
 */
async function updateMemoryCapsule(
  data: SessionContinuityData,
  threads: MemoryThread[],
  anchors: Array<Omit<MemoryAnchor, 'createdAt' | 'recallCount'>>
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

    // Get existing capsule for version increment
    const existing = await capsuleRef.get();
    const existingCapsule = existing.data() as MemoryCapsule | undefined;
    const version = (existingCapsule?.version || 0) + 1;

    // Build capsule summary - merge with existing if present
    const rollingSummary = existingCapsule?.rollingSummary
      ? `${existingCapsule.rollingSummary}\n\n---\n\n${data.naturalSummary}`.slice(-2000)
      : data.naturalSummary;

    // Merge threads
    const existingThreadMap = new Map(
      (existingCapsule?.activeThreads || []).map((t) => [t.theme, t])
    );
    for (const thread of threads) {
      existingThreadMap.set(thread.theme, {
        theme: thread.theme,
        lastUpdated: thread.lastUpdated.toISOString(),
        sessionCount: thread.sessionCount,
      });
    }
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

    await capsuleRef.set(capsule);

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

    log.info(
      {
        userId: data.userId,
        version,
        threads: activeThreads.length,
        anchors: topAnchors.length,
      },
      '💊 Memory capsule updated'
    );
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
  spannerAvailable: boolean;
}

/**
 * Main entry point: Write session data to both Firestore and Spanner
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
    spannerAvailable: false,
  };

  // Skip empty or trivial sessions
  if (!data.naturalSummary || data.durationSeconds < 30) {
    log.debug({ sessionId: data.sessionId }, 'Skipping trivial session for continuity');
    return result;
  }

  result.spannerAvailable = isSpannerReady();

  // 1. Update memory threads in Spanner
  let threads: MemoryThread[] = [];
  if (result.spannerAvailable && data.mainTopics.length > 0) {
    threads = await updateMemoryThreads(data);
    result.threadsUpdated = threads.length;
  }

  // 2. Detect and write anchors to Spanner
  const anchors = detectAnchors(data);
  if (result.spannerAvailable && anchors.length > 0) {
    result.anchorsCreated = await writeAnchors(anchors);
  }

  // 3. Update memory capsule in Firestore (always, for fast reads)
  try {
    await updateMemoryCapsule(data, threads, anchors);
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
      spannerAvailable: result.spannerAvailable,
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
