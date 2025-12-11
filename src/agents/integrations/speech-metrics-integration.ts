/**
 * Speech Metrics Integration for Voice Agent
 *
 * Wires up the speech metrics/observability system to the voice agent.
 * Provides automatic latency tracking, quality metrics recording,
 * and session lifecycle tracking.
 *
 * @module speech-metrics-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  recordLatency,
  recordEmotionConfidence,
  recordBackchannelTiming,
  recordTurnPredictionAccuracy,
  recordSessionStart,
  recordSessionEnd,
  recordOperation,
  withTiming,
  getSpeechMetricsSnapshot,
  type MetricsSnapshot,
} from '../../speech/metrics/index.js';

const log = getLogger().child({ module: 'SpeechMetricsIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpeechMetricsContext {
  sessionId: string;
  personaId: string;
  startTime: number;
  turnCount: number;
  emotionSamples: number;
  backchannelCount: number;
  turnPredictions: number;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

const sessionContexts = new Map<string, SpeechMetricsContext>();

/**
 * Initialize speech metrics for a session
 * Call this at the start of a voice session
 */
export function initializeSpeechMetrics(sessionId: string, personaId: string): SpeechMetricsContext {
  const context: SpeechMetricsContext = {
    sessionId,
    personaId,
    startTime: Date.now(),
    turnCount: 0,
    emotionSamples: 0,
    backchannelCount: 0,
    turnPredictions: 0,
  };

  sessionContexts.set(sessionId, context);
  recordSessionStart(sessionId);

  log.info({ sessionId, personaId }, '📊 Speech metrics initialized');

  return context;
}

/**
 * Finalize speech metrics for a session
 * Call this at the end of a voice session
 */
export function finalizeSpeechMetrics(sessionId: string, success = true): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    const durationSec = Math.round((Date.now() - context.startTime) / 1000);

    log.info(
      {
        sessionId,
        durationSec,
        turnCount: context.turnCount,
        emotionSamples: context.emotionSamples,
        backchannelCount: context.backchannelCount,
        turnPredictions: context.turnPredictions,
      },
      '📊 Speech metrics finalized'
    );

    sessionContexts.delete(sessionId);
  }

  recordSessionEnd(sessionId, success);
}

// ============================================================================
// LATENCY TRACKING
// ============================================================================

/**
 * Record latency for a speech operation
 */
export function trackSpeechLatency(sessionId: string, operation: string, latencyMs: number): void {
  recordLatency(operation, latencyMs);
  recordOperation(operation, latencyMs, true);
}

/**
 * Wrap an async operation with latency tracking
 */
export async function trackSpeechOperation<T>(
  sessionId: string,
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  return withTiming(operationName, fn);
}

// ============================================================================
// QUALITY METRICS
// ============================================================================

/**
 * Record emotion detection quality
 */
export function trackEmotionDetection(sessionId: string, confidence: number): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.emotionSamples++;
  }

  recordEmotionConfidence(confidence);
}

/**
 * Record backchannel timing quality
 * @param wasTimely - True if backchannel was well-timed (not too early/late)
 */
export function trackBackchannelQuality(sessionId: string, wasTimely: boolean): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.backchannelCount++;
  }

  recordBackchannelTiming(wasTimely);
}

/**
 * Record turn prediction accuracy
 * @param wasCorrect - True if turn prediction was correct
 */
export function trackTurnPrediction(sessionId: string, wasCorrect: boolean): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.turnPredictions++;
  }

  recordTurnPredictionAccuracy(wasCorrect);
}

// ============================================================================
// TURN TRACKING
// ============================================================================

/**
 * Record a conversation turn for metrics
 */
export function trackConversationTurn(sessionId: string): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.turnCount++;
  }
}

// ============================================================================
// SNAPSHOT & REPORTING
// ============================================================================

/**
 * Get current metrics snapshot for a session
 */
export function getSessionMetricsContext(sessionId: string): SpeechMetricsContext | undefined {
  return sessionContexts.get(sessionId);
}

/**
 * Get global metrics snapshot
 */
export function getGlobalMetricsSnapshot(): MetricsSnapshot {
  return getSpeechMetricsSnapshot();
}

/**
 * Log current metrics summary
 */
export function logMetricsSummary(sessionId?: string): void {
  const snapshot = getSpeechMetricsSnapshot();

  log.info(
    {
      sessionId,
      uptimeSec: snapshot.uptimeSec,
      latency: {
        avg: snapshot.metrics.latency.avgAnalysisLatencyMs,
        p99: snapshot.metrics.latency.p99LatencyMs,
        samples: snapshot.metrics.latency.sampleCount,
      },
      quality: {
        emotionConfidence: snapshot.metrics.quality.avgEmotionConfidence,
        highConfidenceRate: snapshot.metrics.quality.highConfidenceRate,
      },
      usage: {
        activeSessions: snapshot.metrics.usage.activeSessionCount,
        totalCreated: snapshot.metrics.usage.totalSessionsCreated,
      },
    },
    '📊 Speech metrics summary'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeSpeechMetrics,
  finalizeSpeechMetrics,
  trackSpeechLatency,
  trackSpeechOperation,
  trackEmotionDetection,
  trackBackchannelQuality,
  trackTurnPrediction,
  trackConversationTurn,
  getSessionMetricsContext,
  getGlobalMetricsSnapshot,
  logMetricsSummary,
};
