/**
 * Implicit Correction Capture - Phase 3 Learning Loop Closure
 *
 * Tracks semantic router predictions and detects implicit corrections
 * when the LLM (via JSON executor) chooses a different tool.
 *
 * This is critical for closing the learning loop:
 * - If semantic router predicts "playMusic" with 70% confidence
 * - But LLM actually calls "spotifyPlay"
 * - That's a correction signal we can learn from
 *
 * @module tools/semantic-router/learning/implicit-correction-capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getOnlineLearningEngine } from './online-learning-loop.js';
import type { SemanticRouterResult } from '../types.js';

const log = createLogger({ module: 'implicit-correction-capture' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingPrediction {
  sessionId: string;
  userText: string;
  predictedToolId: string | null;
  confidence: number;
  timestamp: number;
  analyticsEventId?: string;
  matches: Array<{ toolId: string; confidence: number }>;
}

interface CapturedCorrection {
  sessionId: string;
  userText: string;
  predictedToolId: string;
  actualToolId: string;
  predictedConfidence: number;
  timestamp: number;
  correctionType: 'implicit_llm' | 'explicit_user';
}

// ============================================================================
// IN-MEMORY CACHE (per-session, short-lived)
// ============================================================================

// Store the last routing prediction per session
// TTL: 30 seconds - after that, the correlation is stale
const pendingPredictions = new Map<string, RoutingPrediction>();
const PREDICTION_TTL_MS = 30_000;

// Track recently captured corrections to avoid duplicates
const recentCorrections = new Map<string, number>(); // key -> timestamp
const DEDUP_WINDOW_MS = 5_000;

// Metrics for observability
let capturedCorrectionsCount = 0;
let confirmedPredictionsCount = 0;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record a routing prediction from the semantic router.
 * Call this immediately after semantic routing completes.
 */
export function recordRoutingPrediction(
  sessionId: string,
  userText: string,
  routeResult: SemanticRouterResult,
  analyticsEventId?: string
): void {
  const topMatch = routeResult.matches[0];

  const prediction: RoutingPrediction = {
    sessionId,
    userText,
    predictedToolId: topMatch?.toolId || null,
    confidence: topMatch?.confidence || 0,
    timestamp: Date.now(),
    analyticsEventId,
    matches: routeResult.matches.slice(0, 5).map((m) => ({
      toolId: m.toolId,
      confidence: m.confidence,
    })),
  };

  pendingPredictions.set(sessionId, prediction);

  log.debug(
    { sessionId, predictedToolId: prediction.predictedToolId, confidence: prediction.confidence },
    '📝 Recorded routing prediction for correction tracking'
  );

  // Clean up old predictions periodically
  cleanupStalePredictions();
}

/**
 * Record the actual tool that was executed.
 * Call this from JSON function executor after a tool completes.
 *
 * Returns true if a correction was detected and recorded.
 */
export async function recordActualToolExecution(
  sessionId: string,
  actualToolId: string,
  executionSource: 'semantic_direct' | 'json_fallback'
): Promise<boolean> {
  const prediction = pendingPredictions.get(sessionId);

  // No prediction to compare against
  if (!prediction) {
    return false;
  }

  // Prediction is too old
  if (Date.now() - prediction.timestamp > PREDICTION_TTL_MS) {
    pendingPredictions.delete(sessionId);
    return false;
  }

  // Clear the prediction (consumed)
  pendingPredictions.delete(sessionId);

  // No predicted tool to compare
  if (!prediction.predictedToolId) {
    return false;
  }

  // Semantic direct execution - no correction needed (it executed what it predicted)
  if (executionSource === 'semantic_direct') {
    confirmedPredictionsCount++;
    return false;
  }

  // Normalize tool IDs for comparison (some tools have aliases)
  const normalizedPredicted = normalizeToolId(prediction.predictedToolId);
  const normalizedActual = normalizeToolId(actualToolId);

  // Same tool - prediction was correct
  if (normalizedPredicted === normalizedActual) {
    confirmedPredictionsCount++;
    log.debug(
      { sessionId, toolId: actualToolId },
      '✅ LLM confirmed semantic router prediction'
    );
    return false;
  }

  // Deduplication: Avoid recording the same correction twice
  const dedupKey = `${sessionId}:${prediction.predictedToolId}:${actualToolId}`;
  if (recentCorrections.has(dedupKey)) {
    return false;
  }
  recentCorrections.set(dedupKey, Date.now());

  // Record the implicit correction
  const correction: CapturedCorrection = {
    sessionId,
    userText: prediction.userText,
    predictedToolId: prediction.predictedToolId,
    actualToolId,
    predictedConfidence: prediction.confidence,
    timestamp: Date.now(),
    correctionType: 'implicit_llm',
  };

  await processCapturedCorrection(correction);
  capturedCorrectionsCount++;

  log.info(
    {
      sessionId,
      predicted: prediction.predictedToolId,
      actual: actualToolId,
      confidence: prediction.confidence.toFixed(2),
    },
    '🔄 Captured implicit correction: LLM chose different tool'
  );

  return true;
}

/**
 * Get metrics for observability.
 */
export function getCorrectionMetrics(): {
  pendingPredictions: number;
  capturedCorrections: number;
  confirmedPredictions: number;
  correctionRate: number;
} {
  const total = capturedCorrectionsCount + confirmedPredictionsCount;
  return {
    pendingPredictions: pendingPredictions.size,
    capturedCorrections: capturedCorrectionsCount,
    confirmedPredictions: confirmedPredictionsCount,
    correctionRate: total > 0 ? capturedCorrectionsCount / total : 0,
  };
}

/**
 * Clear metrics (for testing).
 */
export function resetMetrics(): void {
  capturedCorrectionsCount = 0;
  confirmedPredictionsCount = 0;
  pendingPredictions.clear();
  recentCorrections.clear();
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Normalize tool IDs for comparison.
 * Handles common aliases (spotify_play → playMusic, etc.)
 */
function normalizeToolId(toolId: string): string {
  // Common aliases - lowercase for comparison
  const aliases: Record<string, string> = {
    spotify_play: 'playmusic',
    spotify_pause: 'pausemusic',
    spotify_skip: 'skipmusic',
    spotify_resume: 'resumemusic',
    play_music: 'playmusic',
    pause_music: 'pausemusic',
    handoff: 'persona_handoff',
    transfer: 'persona_handoff',
  };

  const lower = toolId.toLowerCase().replace(/[-_]/g, '');
  return aliases[toolId.toLowerCase()] || lower;
}

/**
 * Process a captured correction by sending it to the learning engine.
 */
async function processCapturedCorrection(correction: CapturedCorrection): Promise<void> {
  try {
    const learningEngine = getOnlineLearningEngine();

    await learningEngine.addCorrection({
      query: correction.userText,
      predictedToolId: correction.predictedToolId,
      actualToolId: correction.actualToolId,
      confidence: correction.predictedConfidence,
      timestamp: correction.timestamp,
      source: 'implicit',
      metadata: {
        sessionId: correction.sessionId,
      },
    });
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Failed to send correction to learning engine'
    );
  }
}

/**
 * Clean up stale predictions and dedup entries.
 */
function cleanupStalePredictions(): void {
  const now = Date.now();

  // Cleanup old predictions
  for (const [sessionId, prediction] of pendingPredictions) {
    if (now - prediction.timestamp > PREDICTION_TTL_MS) {
      pendingPredictions.delete(sessionId);
    }
  }

  // Cleanup old dedup entries
  for (const [key, timestamp] of recentCorrections) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentCorrections.delete(key);
    }
  }
}
