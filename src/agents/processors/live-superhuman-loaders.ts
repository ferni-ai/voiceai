/**
 * Live Superhuman Injections - async loaders
 *
 * Lazy-loaded memory lookups and fire-and-forget writes used by
 * buildLiveSuperhumanInjections, plus the per-lookup time budget.
 *
 * @module agents/processors/live-superhuman-loaders
 */

import type { LiveSuperhumanContext } from './live-superhuman.types.js';

// Phase 10: Recall Triggers (lazy loaded for performance)
import type { RecallTriggerResult } from '../../intelligence/triggers/recall-trigger-engine.js';

// Phase 14: Joy Amplification (lazy loaded for performance)
import type { JoyAmplificationResult } from '../../memory/emotional/joy-amplification.js';

// Phase 13: Commitment E2E (lazy loaded for performance)
import type {
  CommitmentE2EResult,
  ProgressUpdateResult,
} from '../../services/superhuman/commitment-keeper-e2e.js';
import type { PersonaId } from '../../memory/cross-persona/index.js';

/**
 * Callers give this whole builder ~50ms and discard everything on overrun, so the
 * memory lookups run in parallel and each gets at most this long. A slow lookup
 * drops only its own insight (and keeps warming its cache for the next turn);
 * the instant text/voice detections always make it into the turn.
 */
const ASYNC_LOADER_BUDGET_MS = 35;

export function withinBudget<T>(work: Promise<T | null>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ASYNC_LOADER_BUDGET_MS);
    timer.unref?.();
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

// ============================================================================
// ASYNC HELPERS (Fire-and-forget operations)
// ============================================================================

/**
 * Save commitment asynchronously (fire-and-forget)
 * Uses the recordTrustMoment function for write-through persistence
 */
export async function saveCommitmentAsync(
  userId: string,
  type: string,
  content: string,
  topic?: string
): Promise<void> {
  try {
    const { recordTrustMoment } = await import('../../services/trust-systems/unified-recorder.js');
    await recordTrustMoment(userId, {
      type: 'intention',
      content: `${type}: ${content}`,
      context: topic,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Load semantic insight asynchronously using cross-session threading.
 * Provides "Better Than Human" cross-session connections and patterns.
 */
export async function loadSemanticInsightAsync(
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
export async function loadEmotionalTrajectoryAsync(
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
export async function loadRecallTriggersAsync(
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
export async function loadJoyAmplificationAsync(
  ctx: LiveSuperhumanContext
): Promise<JoyAmplificationResult | null> {
  try {
    const { shouldAmplifyJoy, buildJoyPool } =
      await import('../../memory/emotional/joy-amplification.js');

    // Build joy pool from user's positive memories (in production, this would be cached)
    const joyPool = await buildJoyPool(ctx.userId);
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

/**
 * Load Commitment E2E detection (Phase 13)
 * Enhanced commitment detection with conversation context and memory linking
 */
export async function loadCommitmentE2EAsync(
  ctx: LiveSuperhumanContext
): Promise<CommitmentE2EResult | null> {
  try {
    const { detectCommitmentE2E } =
      await import('../../services/superhuman/commitment-keeper-e2e.js');

    const result = await detectCommitmentE2E({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      transcript: ctx.userText,
      personaId: (ctx.services?.personaId || 'ferni') as PersonaId,
      topic: ctx.currentTopic,
      emotionalContext: {
        primary: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
      },
      mentionedEntities: ctx.mentionedEntities,
    });

    return result;
  } catch {
    return null;
  }
}

/**
 * Load Commitment Progress check (Phase 13)
 * Detects when user mentions progress on existing commitments
 */
export async function loadCommitmentProgressAsync(
  ctx: LiveSuperhumanContext
): Promise<ProgressUpdateResult | null> {
  try {
    const { checkProgressE2E } = await import('../../services/superhuman/commitment-keeper-e2e.js');

    const result = await checkProgressE2E({
      userId: ctx.userId,
      transcript: ctx.userText,
      mentionedEntities: ctx.mentionedEntities,
      emotionalContext: {
        primary: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
      },
    });

    return result;
  } catch {
    return null;
  }
}
