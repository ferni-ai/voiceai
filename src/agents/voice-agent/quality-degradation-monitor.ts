/**
 * Quality Degradation Monitor
 *
 * Monitors and alerts on quality degradation for:
 * - Gemini (LLM) - response latency, errors, empty responses
 * - Cartesia (TTS) - audio generation latency, errors
 * - Agent responses - quality issues, repetition, tool failures
 *
 * Integrates with critical-function-monitor for loud alerting.
 *
 * @module voice-agent/quality-degradation-monitor
 */

import { voice } from '@livekit/agents';

// ============================================================================
// TYPES
// ============================================================================

type QualityMetricCategory = 'gemini' | 'cartesia' | 'response' | 'stt';

interface QualityMetric {
  value: number;
  timestamp: number;
}

interface QualityThresholds {
  // Gemini/LLM thresholds
  geminiLatencyMs: number; // Max acceptable LLM response time
  geminiLatencyP95Ms: number; // P95 latency threshold
  geminiErrorRate: number; // Max acceptable error rate (0-1)
  geminiEmptyResponseRate: number; // Max acceptable empty response rate

  // Cartesia/TTS thresholds
  cartesiaLatencyMs: number; // Max acceptable TTS generation time
  cartesiaLatencyP95Ms: number; // P95 latency threshold
  cartesiaErrorRate: number; // Max acceptable error rate

  // Response quality thresholds
  minResponseLength: number; // Min characters for non-empty response
  repetitionSimilarityThreshold: number; // Max similarity for repetition detection (0-1)
  toolMissRate: number; // Max acceptable rate of missing tool calls
}

interface QualityAlert {
  id: string;
  category: QualityMetricCategory;
  severity: 'warning' | 'critical';
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  sessionId?: string;
}

interface QualitySessionState {
  // Gemini metrics
  geminiLatencies: QualityMetric[];
  geminiErrors: number;
  geminiSuccesses: number;
  geminiEmptyResponses: number;

  // Cartesia metrics
  cartesiaLatencies: QualityMetric[];
  cartesiaErrors: number;
  cartesiaSuccesses: number;

  // Response quality
  recentResponses: string[];
  toolRequests: number;
  toolCalls: number;

  // STT metrics
  sttLatencies: QualityMetric[];
  sttErrors: number;
  sttSuccesses: number;

  // Alerts
  alerts: QualityAlert[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_THRESHOLDS: QualityThresholds = {
  // Gemini - voice requires low latency
  geminiLatencyMs: 2000, // 2s max
  geminiLatencyP95Ms: 3000, // P95 at 3s
  geminiErrorRate: 0.1, // 10% error rate triggers warning
  geminiEmptyResponseRate: 0.05, // 5% empty responses

  // Cartesia - TTS must be fast
  cartesiaLatencyMs: 500, // 500ms max
  cartesiaLatencyP95Ms: 1000, // P95 at 1s
  cartesiaErrorRate: 0.05, // 5% error rate

  // Response quality
  minResponseLength: 10, // Min 10 chars
  repetitionSimilarityThreshold: 0.9, // 90% similar = repetition
  toolMissRate: 0.3, // 30% tool miss rate
};

// Allow runtime configuration
let customThresholds: Partial<QualityThresholds> = {};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, QualitySessionState>();
const MAX_SAMPLES = 100; // Keep last 100 samples per metric
const MAX_RESPONSES = 10; // Keep last 10 responses for repetition check

function getSessionState(sessionId: string): QualitySessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      geminiLatencies: [],
      geminiErrors: 0,
      geminiSuccesses: 0,
      geminiEmptyResponses: 0,
      cartesiaLatencies: [],
      cartesiaErrors: 0,
      cartesiaSuccesses: 0,
      recentResponses: [],
      toolRequests: 0,
      toolCalls: 0,
      sttLatencies: [],
      sttErrors: 0,
      sttSuccesses: 0,
      alerts: [],
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

function trimSamples<T>(arr: T[], max: number): void {
  while (arr.length > max) {
    arr.shift();
  }
}

// ============================================================================
// ALERTING
// ============================================================================

function emitAlert(alert: QualityAlert): void {
  const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
  const categoryEmoji: Record<QualityMetricCategory, string> = {
    gemini: '🤖',
    cartesia: '🔊',
    response: '💬',
    stt: '🎤',
  };

  process.stderr.write('\n');
  if (alert.severity === 'critical') {
    process.stderr.write(`${'🚨'.repeat(20)}\n`);
  }
  process.stderr.write(
    `${severityEmoji} [QUALITY ${alert.category.toUpperCase()}] ${alert.metric}\n`
  );
  process.stderr.write(`   ${categoryEmoji[alert.category]} ${alert.message}\n`);
  process.stderr.write(
    `   📊 Value: ${alert.currentValue.toFixed(2)} | Threshold: ${alert.threshold.toFixed(2)}\n`
  );
  process.stderr.write(`   🕐 ${new Date(alert.timestamp).toISOString()}\n`);
  if (alert.severity === 'critical') {
    process.stderr.write(`${'🚨'.repeat(20)}\n`);
  }
  process.stderr.write('\n');
}

// ============================================================================
// GEMINI (LLM) MONITORING
// ============================================================================

/**
 * Record Gemini/LLM response latency
 */
export function recordGeminiLatency(sessionId: string, latencyMs: number): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  state.geminiLatencies.push({ value: latencyMs, timestamp: Date.now() });
  trimSamples(state.geminiLatencies, MAX_SAMPLES);
  state.geminiSuccesses++;

  // Check for high latency
  if (latencyMs > thresholds.geminiLatencyMs) {
    const alert: QualityAlert = {
      id: `gemini-latency-${Date.now()}`,
      category: 'gemini',
      severity: latencyMs > thresholds.geminiLatencyMs * 1.5 ? 'critical' : 'warning',
      metric: 'latency',
      message: `Gemini response latency ${latencyMs}ms exceeds threshold`,
      currentValue: latencyMs,
      threshold: thresholds.geminiLatencyMs,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    trimSamples(state.alerts, 50);
    emitAlert(alert);
  }

  // Check P95
  if (state.geminiLatencies.length >= 20) {
    const sorted = [...state.geminiLatencies].sort((a, b) => a.value - b.value);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Value = sorted[p95Index].value;

    if (p95Value > thresholds.geminiLatencyP95Ms) {
      const alert: QualityAlert = {
        id: `gemini-p95-${Date.now()}`,
        category: 'gemini',
        severity: 'warning',
        metric: 'p95_latency',
        message: `Gemini P95 latency ${p95Value}ms exceeds threshold`,
        currentValue: p95Value,
        threshold: thresholds.geminiLatencyP95Ms,
        timestamp: Date.now(),
        sessionId,
      };
      state.alerts.push(alert);
      emitAlert(alert);
    }
  }
}

/**
 * Record Gemini/LLM error
 */
export function recordGeminiError(sessionId: string, error: string): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  state.geminiErrors++;

  const total = state.geminiErrors + state.geminiSuccesses;
  const errorRate = total > 0 ? state.geminiErrors / total : 0;

  if (errorRate > thresholds.geminiErrorRate && total >= 5) {
    const alert: QualityAlert = {
      id: `gemini-errors-${Date.now()}`,
      category: 'gemini',
      severity: errorRate > thresholds.geminiErrorRate * 2 ? 'critical' : 'warning',
      metric: 'error_rate',
      message: `Gemini error rate ${(errorRate * 100).toFixed(1)}% (${state.geminiErrors}/${total}): ${error.slice(0, 100)}`,
      currentValue: errorRate,
      threshold: thresholds.geminiErrorRate,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }
}

/**
 * Record Gemini empty response
 */
export function recordGeminiEmptyResponse(sessionId: string): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  state.geminiEmptyResponses++;
  state.geminiSuccesses++; // Still a "success" in terms of API call

  const total = state.geminiSuccesses;
  const emptyRate = total > 0 ? state.geminiEmptyResponses / total : 0;

  if (emptyRate > thresholds.geminiEmptyResponseRate && total >= 5) {
    const alert: QualityAlert = {
      id: `gemini-empty-${Date.now()}`,
      category: 'gemini',
      severity: 'warning',
      metric: 'empty_response_rate',
      message: `Gemini empty response rate ${(emptyRate * 100).toFixed(1)}% (${state.geminiEmptyResponses}/${total})`,
      currentValue: emptyRate,
      threshold: thresholds.geminiEmptyResponseRate,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }
}

// ============================================================================
// CARTESIA (TTS) MONITORING
// ============================================================================

/**
 * Record Cartesia/TTS latency (time to first audio byte)
 */
export function recordCartesiaLatency(sessionId: string, latencyMs: number): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  state.cartesiaLatencies.push({ value: latencyMs, timestamp: Date.now() });
  trimSamples(state.cartesiaLatencies, MAX_SAMPLES);
  state.cartesiaSuccesses++;

  // Check for high latency
  if (latencyMs > thresholds.cartesiaLatencyMs) {
    const alert: QualityAlert = {
      id: `cartesia-latency-${Date.now()}`,
      category: 'cartesia',
      severity: latencyMs > thresholds.cartesiaLatencyMs * 2 ? 'critical' : 'warning',
      metric: 'latency',
      message: `Cartesia TTS latency ${latencyMs}ms exceeds threshold`,
      currentValue: latencyMs,
      threshold: thresholds.cartesiaLatencyMs,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }

  // Check P95
  if (state.cartesiaLatencies.length >= 20) {
    const sorted = [...state.cartesiaLatencies].sort((a, b) => a.value - b.value);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Value = sorted[p95Index].value;

    if (p95Value > thresholds.cartesiaLatencyP95Ms) {
      const alert: QualityAlert = {
        id: `cartesia-p95-${Date.now()}`,
        category: 'cartesia',
        severity: 'warning',
        metric: 'p95_latency',
        message: `Cartesia P95 latency ${p95Value}ms exceeds threshold`,
        currentValue: p95Value,
        threshold: thresholds.cartesiaLatencyP95Ms,
        timestamp: Date.now(),
        sessionId,
      };
      state.alerts.push(alert);
      emitAlert(alert);
    }
  }
}

/**
 * Record Cartesia/TTS error
 */
export function recordCartesiaError(sessionId: string, error: string): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  state.cartesiaErrors++;

  const total = state.cartesiaErrors + state.cartesiaSuccesses;
  const errorRate = total > 0 ? state.cartesiaErrors / total : 0;

  if (errorRate > thresholds.cartesiaErrorRate && total >= 5) {
    const alert: QualityAlert = {
      id: `cartesia-errors-${Date.now()}`,
      category: 'cartesia',
      severity: errorRate > thresholds.cartesiaErrorRate * 2 ? 'critical' : 'warning',
      metric: 'error_rate',
      message: `Cartesia error rate ${(errorRate * 100).toFixed(1)}%: ${error.slice(0, 100)}`,
      currentValue: errorRate,
      threshold: thresholds.cartesiaErrorRate,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }
}

// ============================================================================
// RESPONSE QUALITY MONITORING
// ============================================================================

/**
 * Record agent response for quality tracking
 */
export function recordAgentResponse(sessionId: string, response: string): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  // Check for too-short response
  if (response.length < thresholds.minResponseLength) {
    const alert: QualityAlert = {
      id: `response-short-${Date.now()}`,
      category: 'response',
      severity: 'warning',
      metric: 'response_length',
      message: `Agent response too short (${response.length} chars): "${response.slice(0, 50)}"`,
      currentValue: response.length,
      threshold: thresholds.minResponseLength,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }

  // Check for repetition (compare to recent responses)
  for (const recent of state.recentResponses) {
    const similarity = calculateSimilarity(response, recent);
    if (similarity > thresholds.repetitionSimilarityThreshold) {
      const alert: QualityAlert = {
        id: `response-repetition-${Date.now()}`,
        category: 'response',
        severity: 'critical',
        metric: 'repetition',
        message: `Agent response appears to be repeating (${(similarity * 100).toFixed(0)}% similar)`,
        currentValue: similarity,
        threshold: thresholds.repetitionSimilarityThreshold,
        timestamp: Date.now(),
        sessionId,
      };
      state.alerts.push(alert);
      emitAlert(alert);
      break; // Only one repetition alert per response
    }
  }

  // Store for future comparison
  state.recentResponses.push(response);
  trimSamples(state.recentResponses, MAX_RESPONSES);
}

/**
 * Record a detected tool request from user
 */
export function recordToolRequest(sessionId: string): void {
  const state = getSessionState(sessionId);
  state.toolRequests++;
}

/**
 * Record a tool call made by agent
 */
export function recordToolCall(sessionId: string): void {
  const state = getSessionState(sessionId);
  state.toolCalls++;
}

/**
 * Check and alert on tool miss rate
 */
export function checkToolMissRate(sessionId: string): void {
  const state = getSessionState(sessionId);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  if (state.toolRequests >= 3) {
    const missRate = 1 - state.toolCalls / state.toolRequests;
    if (missRate > thresholds.toolMissRate) {
      const alert: QualityAlert = {
        id: `tool-miss-${Date.now()}`,
        category: 'response',
        severity: missRate > thresholds.toolMissRate * 1.5 ? 'critical' : 'warning',
        metric: 'tool_miss_rate',
        message: `Tool miss rate ${(missRate * 100).toFixed(0)}% (${state.toolRequests - state.toolCalls}/${state.toolRequests} requests without tool call)`,
        currentValue: missRate,
        threshold: thresholds.toolMissRate,
        timestamp: Date.now(),
        sessionId,
      };
      state.alerts.push(alert);
      emitAlert(alert);
    }
  }
}

// ============================================================================
// STT MONITORING
// ============================================================================

/**
 * Record STT latency
 */
export function recordSTTLatency(sessionId: string, latencyMs: number): void {
  const state = getSessionState(sessionId);
  state.sttLatencies.push({ value: latencyMs, timestamp: Date.now() });
  trimSamples(state.sttLatencies, MAX_SAMPLES);
  state.sttSuccesses++;
}

/**
 * Record STT error
 */
export function recordSTTError(sessionId: string, error: string): void {
  const state = getSessionState(sessionId);
  state.sttErrors++;

  const total = state.sttErrors + state.sttSuccesses;
  if (total >= 5 && state.sttErrors / total > 0.1) {
    const alert: QualityAlert = {
      id: `stt-errors-${Date.now()}`,
      category: 'stt',
      severity: 'warning',
      metric: 'error_rate',
      message: `STT error rate ${((state.sttErrors / total) * 100).toFixed(1)}%: ${error.slice(0, 100)}`,
      currentValue: state.sttErrors / total,
      threshold: 0.1,
      timestamp: Date.now(),
      sessionId,
    };
    state.alerts.push(alert);
    emitAlert(alert);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate Jaccard similarity between two strings (word-level)
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Get quality stats for a session
 */
export function getQualityStats(sessionId: string): {
  gemini: { avgLatencyMs: number; errorRate: number; emptyRate: number; sampleCount: number };
  cartesia: { avgLatencyMs: number; errorRate: number; sampleCount: number };
  response: { toolMissRate: number; repetitions: number };
  alertCount: number;
} {
  const state = getSessionState(sessionId);

  const geminiAvg =
    state.geminiLatencies.length > 0
      ? state.geminiLatencies.reduce((sum, s) => sum + s.value, 0) / state.geminiLatencies.length
      : 0;

  const geminiTotal = state.geminiErrors + state.geminiSuccesses;
  const geminiErrorRate = geminiTotal > 0 ? state.geminiErrors / geminiTotal : 0;
  const geminiEmptyRate =
    state.geminiSuccesses > 0 ? state.geminiEmptyResponses / state.geminiSuccesses : 0;

  const cartesiaAvg =
    state.cartesiaLatencies.length > 0
      ? state.cartesiaLatencies.reduce((sum, s) => sum + s.value, 0) /
        state.cartesiaLatencies.length
      : 0;

  const cartesiaTotal = state.cartesiaErrors + state.cartesiaSuccesses;
  const cartesiaErrorRate = cartesiaTotal > 0 ? state.cartesiaErrors / cartesiaTotal : 0;

  const toolMissRate = state.toolRequests > 0 ? 1 - state.toolCalls / state.toolRequests : 0;

  const repetitionAlerts = state.alerts.filter((a) => a.metric === 'repetition').length;

  return {
    gemini: {
      avgLatencyMs: geminiAvg,
      errorRate: geminiErrorRate,
      emptyRate: geminiEmptyRate,
      sampleCount: state.geminiLatencies.length,
    },
    cartesia: {
      avgLatencyMs: cartesiaAvg,
      errorRate: cartesiaErrorRate,
      sampleCount: state.cartesiaLatencies.length,
    },
    response: {
      toolMissRate,
      repetitions: repetitionAlerts,
    },
    alertCount: state.alerts.length,
  };
}

/**
 * Print quality stats summary
 */
export function printQualityStatsSummary(sessionId: string): void {
  const stats = getQualityStats(sessionId);

  process.stderr.write(`\n${'📈'.repeat(20)}\n`);
  process.stderr.write(`📈 QUALITY STATS - Session ${sessionId.slice(0, 8)}...\n`);
  process.stderr.write(`${'─'.repeat(60)}\n`);

  process.stderr.write(`🤖 GEMINI (LLM)\n`);
  process.stderr.write(`   Avg Latency: ${stats.gemini.avgLatencyMs.toFixed(0)}ms\n`);
  process.stderr.write(`   Error Rate: ${(stats.gemini.errorRate * 100).toFixed(1)}%\n`);
  process.stderr.write(`   Empty Rate: ${(stats.gemini.emptyRate * 100).toFixed(1)}%\n`);
  process.stderr.write(`   Samples: ${stats.gemini.sampleCount}\n\n`);

  process.stderr.write(`🔊 CARTESIA (TTS)\n`);
  process.stderr.write(`   Avg Latency: ${stats.cartesia.avgLatencyMs.toFixed(0)}ms\n`);
  process.stderr.write(`   Error Rate: ${(stats.cartesia.errorRate * 100).toFixed(1)}%\n`);
  process.stderr.write(`   Samples: ${stats.cartesia.sampleCount}\n\n`);

  process.stderr.write(`💬 RESPONSE QUALITY\n`);
  process.stderr.write(`   Tool Miss Rate: ${(stats.response.toolMissRate * 100).toFixed(0)}%\n`);
  process.stderr.write(`   Repetition Alerts: ${stats.response.repetitions}\n\n`);

  process.stderr.write(`🚨 Total Alerts: ${stats.alertCount}\n`);
  process.stderr.write(`${'📈'.repeat(20)}\n\n`);
}

/**
 * Get recent alerts for a session
 */
export function getRecentAlerts(sessionId: string, limit = 20): QualityAlert[] {
  const state = getSessionState(sessionId);
  return state.alerts.slice(-limit);
}

/**
 * Clean up session state
 */
export function cleanupQualitySession(sessionId: string): void {
  printQualityStatsSummary(sessionId);
  sessionStates.delete(sessionId);
}

/**
 * Set custom quality thresholds
 */
export function setQualityThresholds(thresholds: Partial<QualityThresholds>): void {
  customThresholds = { ...customThresholds, ...thresholds };
  process.stderr.write(`📊 Quality thresholds updated: ${JSON.stringify(thresholds)}\n`);
}

/**
 * Get current quality thresholds
 */
export function getQualityThresholds(): QualityThresholds {
  return { ...DEFAULT_THRESHOLDS, ...customThresholds };
}

// ============================================================================
// INTEGRATION WITH AGENT SESSION
// ============================================================================

/**
 * Set up quality monitoring on an AgentSession
 */
export function setupQualityMonitoring(
  sessionId: string,
  session: voice.AgentSession<unknown>
): () => void {
  // Track metrics collected events
  const metricsHandler = (event: unknown) => {
    const metrics = event as {
      llm?: { ttft?: number; error?: string };
      tts?: { ttfb?: number; error?: string };
      stt?: { latency?: number; error?: string };
    };

    // LLM metrics
    if (metrics.llm?.ttft) {
      recordGeminiLatency(sessionId, metrics.llm.ttft);
    }
    if (metrics.llm?.error) {
      recordGeminiError(sessionId, metrics.llm.error);
    }

    // TTS metrics
    if (metrics.tts?.ttfb) {
      recordCartesiaLatency(sessionId, metrics.tts.ttfb);
    }
    if (metrics.tts?.error) {
      recordCartesiaError(sessionId, metrics.tts.error);
    }

    // STT metrics
    if (metrics.stt?.latency) {
      recordSTTLatency(sessionId, metrics.stt.latency);
    }
    if (metrics.stt?.error) {
      recordSTTError(sessionId, metrics.stt.error);
    }
  };

  session.on(voice.AgentSessionEventTypes.MetricsCollected, metricsHandler);

  // Return cleanup function
  return () => {
    cleanupQualitySession(sessionId);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const qualityMonitor = {
  // Gemini
  recordGeminiLatency,
  recordGeminiError,
  recordGeminiEmptyResponse,
  // Cartesia
  recordCartesiaLatency,
  recordCartesiaError,
  // Response
  recordAgentResponse,
  recordToolRequest,
  recordToolCall,
  checkToolMissRate,
  // STT
  recordSTTLatency,
  recordSTTError,
  // Stats
  getQualityStats,
  printQualityStatsSummary,
  getRecentAlerts,
  // Config
  setQualityThresholds,
  getQualityThresholds,
  // Session
  setup: setupQualityMonitoring,
  cleanup: cleanupQualitySession,
};

export default qualityMonitor;
