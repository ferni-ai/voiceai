/**
 * Speech Metrics Integration for Voice Agent
 *
 * Wires up the speech metrics/observability system to the voice agent.
 * Provides automatic latency tracking, quality metrics recording,
 * and session lifecycle tracking.
 *
 * Enhanced with:
 * - Detailed backchannel timing analytics
 * - Turn prediction accuracy tracking with ground truth validation
 * - Per-persona metrics aggregation
 *
 * @module speech-metrics-integration
 */

import {
  getSpeechMetricsSnapshot,
  recordBackchannelTiming,
  recordEmotionConfidence,
  recordLatency,
  recordOperation,
  recordSessionEnd,
  recordSessionStart,
  recordTurnPredictionAccuracy,
  withTiming,
  type MetricsSnapshot,
} from '../../speech/metrics/index.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'SpeechMetricsIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelEvent {
  timestamp: number;
  pauseDurationMs: number;
  wasTimely: boolean;
  category: 'acknowledgment' | 'encouragement' | 'empathy' | 'affirmation';
  userEmotion?: string;
  mode: 'standard' | 'enhanced' | 'live' | 'adaptive' | 'llm';
}

export interface TurnPredictionEvent {
  timestamp: number;
  prediction: 'wait' | 'take_turn' | 'backchannel' | 'uncertain';
  probability: number;
  actualOutcome?: 'user_continued' | 'user_finished' | 'user_interrupted';
  wasCorrect?: boolean;
  silenceDurationMs: number;
}

export interface SpeechMetricsContext {
  sessionId: string;
  personaId: string;
  startTime: number;
  turnCount: number;
  emotionSamples: number;
  backchannelCount: number;
  turnPredictions: number;
  // Enhanced tracking
  backchannelEvents: BackchannelEvent[];
  turnPredictionEvents: TurnPredictionEvent[];
  emotionConfidences: number[];
  avgResponseLatencyMs: number;
  responseLatencySamples: number;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

const sessionContexts = new Map<string, SpeechMetricsContext>();

/**
 * Initialize speech metrics for a session
 * Call this at the start of a voice session
 */
export function initializeSpeechMetrics(
  sessionId: string,
  personaId: string
): SpeechMetricsContext {
  const context: SpeechMetricsContext = {
    sessionId,
    personaId,
    startTime: Date.now(),
    turnCount: 0,
    emotionSamples: 0,
    backchannelCount: 0,
    turnPredictions: 0,
    // Enhanced tracking
    backchannelEvents: [],
    turnPredictionEvents: [],
    emotionConfidences: [],
    avgResponseLatencyMs: 0,
    responseLatencySamples: 0,
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

    // Calculate backchannel accuracy
    const timelyBackchannels = context.backchannelEvents.filter((e) => e.wasTimely).length;
    const backchannelAccuracy =
      context.backchannelEvents.length > 0
        ? timelyBackchannels / context.backchannelEvents.length
        : 0;

    // Calculate turn prediction accuracy
    const correctPredictions = context.turnPredictionEvents.filter((e) => e.wasCorrect).length;
    const validatedPredictions = context.turnPredictionEvents.filter(
      (e) => e.wasCorrect !== undefined
    ).length;
    const turnPredictionAccuracy =
      validatedPredictions > 0 ? correctPredictions / validatedPredictions : 0;

    // Calculate emotion confidence average
    const avgEmotionConfidence =
      context.emotionConfidences.length > 0
        ? context.emotionConfidences.reduce((a, b) => a + b, 0) / context.emotionConfidences.length
        : 0;

    log.info(
      {
        sessionId,
        personaId: context.personaId,
        durationSec,
        turnCount: context.turnCount,
        emotionSamples: context.emotionSamples,
        avgEmotionConfidence: avgEmotionConfidence.toFixed(2),
        backchannelCount: context.backchannelCount,
        backchannelAccuracy: backchannelAccuracy.toFixed(2),
        turnPredictions: context.turnPredictions,
        turnPredictionAccuracy: turnPredictionAccuracy.toFixed(2),
        avgResponseLatencyMs: context.avgResponseLatencyMs.toFixed(0),
      },
      '📊 Speech metrics finalized'
    );

    // Store session summary for per-persona aggregation
    storeSessionSummary(context, {
      durationSec,
      backchannelAccuracy,
      turnPredictionAccuracy,
      avgEmotionConfidence,
    });

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
 * Record detailed backchannel event
 */
export function trackBackchannelEvent(
  sessionId: string,
  event: Omit<BackchannelEvent, 'timestamp'>
): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.backchannelCount++;
    context.backchannelEvents.push({
      ...event,
      timestamp: Date.now(),
    });

    // Keep only last 50 events per session to limit memory
    if (context.backchannelEvents.length > 50) {
      context.backchannelEvents.shift();
    }
  }

  recordBackchannelTiming(event.wasTimely);
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

/**
 * Record detailed turn prediction event
 */
export function trackTurnPredictionEvent(
  sessionId: string,
  event: Omit<TurnPredictionEvent, 'timestamp'>
): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    context.turnPredictions++;
    context.turnPredictionEvents.push({
      ...event,
      timestamp: Date.now(),
    });

    // Keep only last 100 events per session
    if (context.turnPredictionEvents.length > 100) {
      context.turnPredictionEvents.shift();
    }
  }

  if (event.wasCorrect !== undefined) {
    recordTurnPredictionAccuracy(event.wasCorrect);
  }
}

/**
 * Validate a previous turn prediction with actual outcome
 */
export function validateTurnPrediction(
  sessionId: string,
  actualOutcome: 'user_continued' | 'user_finished' | 'user_interrupted'
): void {
  const context = sessionContexts.get(sessionId);
  if (!context || context.turnPredictionEvents.length === 0) return;

  // Get the most recent prediction
  const lastPrediction = context.turnPredictionEvents[context.turnPredictionEvents.length - 1];
  if (lastPrediction.actualOutcome !== undefined) return; // Already validated

  lastPrediction.actualOutcome = actualOutcome;

  // Determine if prediction was correct
  const wasCorrect =
    (lastPrediction.prediction === 'take_turn' && actualOutcome === 'user_finished') ||
    (lastPrediction.prediction === 'wait' && actualOutcome === 'user_continued') ||
    (lastPrediction.prediction === 'backchannel' &&
      (actualOutcome === 'user_continued' || actualOutcome === 'user_finished'));

  lastPrediction.wasCorrect = wasCorrect;
  recordTurnPredictionAccuracy(wasCorrect);
}

/**
 * Track response latency
 */
export function trackResponseLatency(sessionId: string, latencyMs: number): void {
  const context = sessionContexts.get(sessionId);
  if (context) {
    // Running average calculation
    const oldTotal = context.avgResponseLatencyMs * context.responseLatencySamples;
    context.responseLatencySamples++;
    context.avgResponseLatencyMs = (oldTotal + latencyMs) / context.responseLatencySamples;
  }

  recordLatency('response', latencyMs);
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
// PER-PERSONA AGGREGATION
// ============================================================================

interface SessionSummary {
  sessionId: string;
  personaId: string;
  timestamp: number;
  durationSec: number;
  turnCount: number;
  backchannelAccuracy: number;
  turnPredictionAccuracy: number;
  avgEmotionConfidence: number;
  avgResponseLatencyMs: number;
}

interface PersonaMetrics {
  personaId: string;
  sessionCount: number;
  totalTurns: number;
  avgBackchannelAccuracy: number;
  avgTurnPredictionAccuracy: number;
  avgEmotionConfidence: number;
  avgResponseLatencyMs: number;
  avgSessionDurationSec: number;
}

// Store recent session summaries for aggregation (last 100 per persona)
const sessionSummaries = new Map<string, SessionSummary[]>();

function storeSessionSummary(
  context: SpeechMetricsContext,
  stats: {
    durationSec: number;
    backchannelAccuracy: number;
    turnPredictionAccuracy: number;
    avgEmotionConfidence: number;
  }
): void {
  const summary: SessionSummary = {
    sessionId: context.sessionId,
    personaId: context.personaId,
    timestamp: Date.now(),
    durationSec: stats.durationSec,
    turnCount: context.turnCount,
    backchannelAccuracy: stats.backchannelAccuracy,
    turnPredictionAccuracy: stats.turnPredictionAccuracy,
    avgEmotionConfidence: stats.avgEmotionConfidence,
    avgResponseLatencyMs: context.avgResponseLatencyMs,
  };

  const personaSummaries = sessionSummaries.get(context.personaId) || [];
  personaSummaries.push(summary);

  // Keep only last 100 sessions per persona
  if (personaSummaries.length > 100) {
    personaSummaries.shift();
  }

  sessionSummaries.set(context.personaId, personaSummaries);
}

/**
 * Get aggregated metrics for a specific persona
 */
export function getPersonaMetrics(personaId: string): PersonaMetrics | null {
  const summaries = sessionSummaries.get(personaId);
  if (!summaries || summaries.length === 0) return null;

  const count = summaries.length;

  return {
    personaId,
    sessionCount: count,
    totalTurns: summaries.reduce((sum, s) => sum + s.turnCount, 0),
    avgBackchannelAccuracy: summaries.reduce((sum, s) => sum + s.backchannelAccuracy, 0) / count,
    avgTurnPredictionAccuracy:
      summaries.reduce((sum, s) => sum + s.turnPredictionAccuracy, 0) / count,
    avgEmotionConfidence: summaries.reduce((sum, s) => sum + s.avgEmotionConfidence, 0) / count,
    avgResponseLatencyMs: summaries.reduce((sum, s) => sum + s.avgResponseLatencyMs, 0) / count,
    avgSessionDurationSec: summaries.reduce((sum, s) => sum + s.durationSec, 0) / count,
  };
}

/**
 * Get aggregated metrics for all personas
 */
export function getAllPersonaMetrics(): PersonaMetrics[] {
  const results: PersonaMetrics[] = [];

  for (const personaId of sessionSummaries.keys()) {
    const metrics = getPersonaMetrics(personaId);
    if (metrics) {
      results.push(metrics);
    }
  }

  return results;
}

/**
 * Get full dashboard data for API endpoint
 */
export function getDashboardData(): {
  global: MetricsSnapshot;
  activeSessions: SpeechMetricsContext[];
  personaMetrics: PersonaMetrics[];
  recentSessions: SessionSummary[];
} {
  const global = getSpeechMetricsSnapshot();
  const activeSessions = Array.from(sessionContexts.values());
  const personaMetrics = getAllPersonaMetrics();

  // Get 20 most recent sessions across all personas
  const allSummaries: SessionSummary[] = [];
  for (const summaries of sessionSummaries.values()) {
    allSummaries.push(...summaries);
  }
  const recentSessions = allSummaries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  return {
    global,
    activeSessions,
    personaMetrics,
    recentSessions,
  };
}

// ============================================================================
// QUALITY ALERTS SYSTEM
// ============================================================================

/**
 * Quality thresholds for alerting
 */
export interface QualityThresholds {
  /** Minimum acceptable turn prediction accuracy (0-1) */
  turnPredictionAccuracy: number;
  /** Minimum acceptable backchannel timing accuracy (0-1) */
  backchannelAccuracy: number;
  /** Maximum acceptable response latency (ms) */
  responseLatencyMs: number;
  /** Minimum acceptable emotion detection confidence (0-1) */
  emotionConfidence: number;
  /** Maximum acceptable p99 latency (ms) */
  p99LatencyMs: number;
}

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Quality alert
 */
export interface QualityAlert {
  id: string;
  severity: AlertSeverity;
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  personaId?: string;
}

/**
 * Default quality thresholds
 */
const DEFAULT_THRESHOLDS: QualityThresholds = {
  turnPredictionAccuracy: 0.7, // 70% minimum
  backchannelAccuracy: 0.7, // 70% minimum
  responseLatencyMs: 300, // 300ms maximum
  emotionConfidence: 0.5, // 50% minimum
  p99LatencyMs: 500, // 500ms maximum for p99
};

// Store for custom thresholds
let customThresholds: Partial<QualityThresholds> = {};

// Alert history (last 100 alerts)
const alertHistory: QualityAlert[] = [];

/**
 * Set custom quality thresholds
 */
export function setQualityThresholds(thresholds: Partial<QualityThresholds>): void {
  customThresholds = { ...customThresholds, ...thresholds };
  log.info({ thresholds: customThresholds }, '📊 Quality thresholds updated');
}

/**
 * Get current quality thresholds
 */
export function getQualityThresholds(): QualityThresholds {
  return { ...DEFAULT_THRESHOLDS, ...customThresholds };
}

/**
 * Check metrics against thresholds and generate alerts
 */
export function checkQualityAlerts(): QualityAlert[] {
  const thresholds = getQualityThresholds();
  const global = getSpeechMetricsSnapshot();
  const alerts: QualityAlert[] = [];

  // Check turn prediction accuracy
  const turnPredAccuracy = global.metrics.quality.turnPredictionAccuracy;
  if (turnPredAccuracy < thresholds.turnPredictionAccuracy && turnPredAccuracy > 0) {
    alerts.push({
      id: `turn-pred-${Date.now()}`,
      severity: turnPredAccuracy < thresholds.turnPredictionAccuracy * 0.7 ? 'critical' : 'warning',
      metric: 'turnPredictionAccuracy',
      message: `Turn prediction accuracy (${(turnPredAccuracy * 100).toFixed(0)}%) below threshold`,
      currentValue: turnPredAccuracy,
      threshold: thresholds.turnPredictionAccuracy,
      timestamp: Date.now(),
    });
  }

  // Check backchannel accuracy
  const backchannelAcc = global.metrics.quality.backchannelAccuracy;
  if (backchannelAcc < thresholds.backchannelAccuracy && backchannelAcc > 0) {
    alerts.push({
      id: `backchannel-${Date.now()}`,
      severity: backchannelAcc < thresholds.backchannelAccuracy * 0.7 ? 'critical' : 'warning',
      metric: 'backchannelAccuracy',
      message: `Backchannel timing accuracy (${(backchannelAcc * 100).toFixed(0)}%) below threshold`,
      currentValue: backchannelAcc,
      threshold: thresholds.backchannelAccuracy,
      timestamp: Date.now(),
    });
  }

  // Check average response latency
  if (global.metrics.latency.avgAnalysisLatencyMs > thresholds.responseLatencyMs) {
    alerts.push({
      id: `latency-avg-${Date.now()}`,
      severity:
        global.metrics.latency.avgAnalysisLatencyMs > thresholds.responseLatencyMs * 1.5
          ? 'critical'
          : 'warning',
      metric: 'responseLatency',
      message: `Average response latency (${global.metrics.latency.avgAnalysisLatencyMs.toFixed(0)}ms) exceeds threshold`,
      currentValue: global.metrics.latency.avgAnalysisLatencyMs,
      threshold: thresholds.responseLatencyMs,
      timestamp: Date.now(),
    });
  }

  // Check p99 latency
  if (global.metrics.latency.p99LatencyMs > thresholds.p99LatencyMs) {
    alerts.push({
      id: `latency-p99-${Date.now()}`,
      severity:
        global.metrics.latency.p99LatencyMs > thresholds.p99LatencyMs * 1.5
          ? 'critical'
          : 'warning',
      metric: 'p99Latency',
      message: `P99 latency (${global.metrics.latency.p99LatencyMs.toFixed(0)}ms) exceeds threshold`,
      currentValue: global.metrics.latency.p99LatencyMs,
      threshold: thresholds.p99LatencyMs,
      timestamp: Date.now(),
    });
  }

  // Check emotion confidence
  if (
    global.metrics.quality.avgEmotionConfidence < thresholds.emotionConfidence &&
    global.metrics.quality.avgEmotionConfidence > 0
  ) {
    alerts.push({
      id: `emotion-${Date.now()}`,
      severity: 'warning',
      metric: 'emotionConfidence',
      message: `Average emotion confidence (${(global.metrics.quality.avgEmotionConfidence * 100).toFixed(0)}%) below threshold`,
      currentValue: global.metrics.quality.avgEmotionConfidence,
      threshold: thresholds.emotionConfidence,
      timestamp: Date.now(),
    });
  }

  // Check per-persona metrics for anomalies
  const personaMetrics = getAllPersonaMetrics();
  for (const persona of personaMetrics) {
    // Persona-specific turn prediction alert
    if (persona.avgTurnPredictionAccuracy / 100 < thresholds.turnPredictionAccuracy * 0.8) {
      alerts.push({
        id: `persona-turn-${persona.personaId}-${Date.now()}`,
        severity: 'warning',
        metric: 'personaTurnPrediction',
        message: `${persona.personaId}: Turn prediction (${persona.avgTurnPredictionAccuracy}%) significantly below average`,
        currentValue: persona.avgTurnPredictionAccuracy / 100,
        threshold: thresholds.turnPredictionAccuracy,
        timestamp: Date.now(),
        personaId: persona.personaId,
      });
    }

    // Persona-specific latency alert
    if (persona.avgResponseLatencyMs > thresholds.responseLatencyMs * 1.2) {
      alerts.push({
        id: `persona-latency-${persona.personaId}-${Date.now()}`,
        severity: 'warning',
        metric: 'personaLatency',
        message: `${persona.personaId}: Response latency (${persona.avgResponseLatencyMs.toFixed(0)}ms) higher than expected`,
        currentValue: persona.avgResponseLatencyMs,
        threshold: thresholds.responseLatencyMs,
        timestamp: Date.now(),
        personaId: persona.personaId,
      });
    }
  }

  // Store alerts in history
  for (const alert of alerts) {
    alertHistory.push(alert);
    if (alertHistory.length > 100) {
      alertHistory.shift();
    }

    // Log alerts
    if (alert.severity === 'critical') {
      log.error(alert, '🚨 Critical quality alert');
    } else if (alert.severity === 'warning') {
      log.warn(alert, '⚠️ Quality warning');
    }
  }

  return alerts;
}

/**
 * Get alert history
 */
export function getAlertHistory(limit = 50): QualityAlert[] {
  return alertHistory.slice(-limit);
}

/**
 * Get current active alerts (check now)
 */
export function getActiveAlerts(): QualityAlert[] {
  return checkQualityAlerts();
}

/**
 * Get full dashboard data including alerts
 */
export function getDashboardDataWithAlerts(): {
  global: MetricsSnapshot;
  activeSessions: SpeechMetricsContext[];
  personaMetrics: PersonaMetrics[];
  recentSessions: SessionSummary[];
  alerts: QualityAlert[];
  thresholds: QualityThresholds;
} {
  return {
    ...getDashboardData(),
    alerts: checkQualityAlerts(),
    thresholds: getQualityThresholds(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { PersonaMetrics, SessionSummary };

export default {
  initializeSpeechMetrics,
  finalizeSpeechMetrics,
  trackSpeechLatency,
  trackSpeechOperation,
  trackEmotionDetection,
  trackBackchannelQuality,
  trackBackchannelEvent,
  trackTurnPrediction,
  trackTurnPredictionEvent,
  validateTurnPrediction,
  trackResponseLatency,
  trackConversationTurn,
  getSessionMetricsContext,
  getGlobalMetricsSnapshot,
  getPersonaMetrics,
  getAllPersonaMetrics,
  getDashboardData,
  getDashboardDataWithAlerts,
  logMetricsSummary,
  // Quality alerts
  setQualityThresholds,
  getQualityThresholds,
  checkQualityAlerts,
  getAlertHistory,
  getActiveAlerts,
};
