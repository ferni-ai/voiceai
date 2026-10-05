/**
 * The reads behind the live superhuman injections.
 *
 * Each turn buildLiveSuperhumanInjections may read cross-session threads,
 * emotional trajectories, recall triggers and a pool of the user's joyful
 * memories, from Firestore and Vertex AI. It awaited them one after another,
 * and the joy pool (an embedding plus a vector query, for a query that never
 * changes) was rebuilt on every turn its emotion was intense. The builder's
 * budget is 50 ms (turn-processor/context-injections.ts), and a miss drops
 * every injection it built that turn: on dev it missed on 154 of 381 turns
 * (2026-10-04 23:41 to 10-05 13:55 UTC).
 *
 * So the reads, which don't depend on each other, start together, and the joy
 * pool is kept per user: 5 minutes when it has memories, 30 seconds when it is
 * empty or the search failed (the STABLE and FRESH tiers of the superhuman
 * cache, superhuman-integration.ts). The predicates that decide whether each
 * read runs are the ones the builder used.
 *
 * @module agents/processors/live-superhuman-reads
 */

import type { RecallTriggerResult } from '../../intelligence/triggers/recall-trigger-engine.js';
import type {
  JoyAmplificationResult,
  JoyMemoryPool,
} from '../../memory/emotional/joy-amplification.js';
import type { LiveSuperhumanContext } from './live-superhuman-injections.js';

export interface LiveSuperhumanReads {
  semantic: Promise<string | null>;
  trajectory: Promise<string | null>;
  recall: Promise<RecallTriggerResult | null>;
  joy: Promise<JoyAmplificationResult | null>;
}

/** Starts this turn's reads; each resolves null when its read doesn't apply or fails. */
export function startLiveSuperhumanReads(ctx: LiveSuperhumanContext): LiveSuperhumanReads {
  const none = Promise.resolve(null);
  const conversations = ctx.totalConversations ?? 0;
  return {
    semantic:
      ctx.emotionalState.intensity > 0.7 && conversations > 5
        ? loadSemanticInsightAsync(ctx.userId, ctx.currentTopic)
        : none,
    trajectory:
      ctx.turnCount % 5 === 0 && conversations > 3
        ? loadEmotionalTrajectoryAsync(ctx.userId, ctx.emotionalState.primary)
        : none,
    recall: ctx.turnCount % 3 === 0 ? loadRecallTriggersAsync(ctx) : none,
    joy: ctx.emotionalState.intensity > 0.5 ? loadJoyAmplificationAsync(ctx) : none,
  };
}

// ============================================================================
// JOY POOL CACHE
// ============================================================================

const JOY_POOL_TTL_MS = 5 * 60 * 1000;
const EMPTY_JOY_POOL_TTL_MS = 30 * 1000;
/** A lookup that hasn't settled by then is started again. */
const PENDING_JOY_POOL_TTL_MS = 60 * 1000;
const MAX_CACHED_JOY_POOLS = 1000;

const joyPools = new Map<string, { pool: Promise<JoyMemoryPool | null>; expiresAt: number }>();

/**
 * The user's joy pool, built at most once per TTL. Concurrent turns share one
 * lookup, including one a missed budget left running.
 */
export function getJoyPool(userId: string): Promise<JoyMemoryPool | null> {
  const cached = joyPools.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.pool;

  const pool = import('../../memory/emotional/joy-amplification.js').then(async (m) =>
    m.buildJoyPool(userId)
  );
  joyPools.delete(userId);
  if (joyPools.size >= MAX_CACHED_JOY_POOLS) {
    const oldest = joyPools.keys().next().value;
    if (oldest !== undefined) joyPools.delete(oldest);
  }
  joyPools.set(userId, { pool, expiresAt: Date.now() + PENDING_JOY_POOL_TTL_MS });

  const settle = (ttlMs: number): void => {
    if (joyPools.get(userId)?.pool === pool) {
      joyPools.set(userId, { pool, expiresAt: Date.now() + ttlMs });
    }
  };
  pool.then(
    (p) => settle(p && p.memories.length > 0 ? JOY_POOL_TTL_MS : EMPTY_JOY_POOL_TTL_MS),
    () => {
      if (joyPools.get(userId)?.pool === pool) joyPools.delete(userId);
    }
  );
  return pool;
}

/** For tests. */
export function clearJoyPoolCache(): void {
  joyPools.clear();
}

// ============================================================================
// READS (moved unchanged from live-superhuman-injections.ts, except that the
// joy pool now comes from getJoyPool)
// ============================================================================

/**
 * Load semantic insight asynchronously using cross-session threading.
 * Provides "Better Than Human" cross-session connections and patterns.
 */
async function loadSemanticInsightAsync(
  userId: string,
  currentTopic?: string
): Promise<string | null> {
  try {
    const { crossSessionThreading } =
      await import('../../services/superhuman/semantic-intelligence/cross-session-threading.js');
    const context = await crossSessionThreading.buildContext(userId, {
      topic: currentTopic,
    });
    // Return null if context is empty or just whitespace
    return context?.trim() || null;
  } catch {
    // Non-critical - graceful degradation
    return null;
  }
}

/**
 * Load emotional trajectory context (P1)
 * Shows emotional arcs over weeks/months
 */
async function loadEmotionalTrajectoryAsync(
  userId: string,
  currentEmotion?: string
): Promise<string | null> {
  try {
    const { buildEmotionalTrajectoryContext } =
      await import('../../services/superhuman/semantic-intelligence/emotional-trajectories.js');
    const context = await buildEmotionalTrajectoryContext(userId, {
      emotion: currentEmotion,
    });
    return context || null;
  } catch {
    return null;
  }
}

/**
 * Load recall triggers (Phase 10)
 * Detects anniversaries, pattern matches, commitment reminders, relationship gaps
 */
async function loadRecallTriggersAsync(
  ctx: LiveSuperhumanContext
): Promise<RecallTriggerResult | null> {
  try {
    const { detectRecallTriggers } =
      await import('../../intelligence/triggers/recall-trigger-engine.js');
    const result = await detectRecallTriggers({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      transcript: ctx.userText,
      emotion: ctx.emotionalState.primary,
      emotionIntensity: ctx.emotionalState.intensity,
      mentionedEntities: ctx.analysis.topics?.detected || [],
      turnNumber: ctx.turnCount,
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Load joy amplification (Phase 14)
 * Surfaces positive memories when user is struggling
 */
async function loadJoyAmplificationAsync(
  ctx: LiveSuperhumanContext
): Promise<JoyAmplificationResult | null> {
  try {
    const { shouldAmplifyJoy } = await import('../../memory/emotional/joy-amplification.js');

    // Build joy pool from user's positive memories
    const joyPool = await getJoyPool(ctx.userId);
    if (!joyPool || joyPool.memories.length === 0) {
      return null;
    }

    const result = shouldAmplifyJoy(
      ctx.userId,
      ctx.sessionId,
      {
        emotion: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
        valence: ctx.emotionalState.intensity > 0.5 ? -0.5 : 0, // Negative valence if high intensity negative emotion
        topic: ctx.currentTopic,
      },
      joyPool
    );

    return result;
  } catch {
    return null;
  }
}
