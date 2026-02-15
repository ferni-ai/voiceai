/**
 * E2E Latency Tracker
 *
 * Tracks the complete timeline from user speech to agent response.
 * Helps diagnose whether latency issues are from:
 * - OpenAI/LLM (TTFB - time to first token)
 * - TTS (Cartesia)
 * - Our code (processing time)
 *
 * Timeline tracked:
 * 1. userSpeechEnded - When user stops speaking
 * 2. processingStarted - When we start processing the transcript
 * 3. llmRequestSent - When we call generateReply
 * 4. llmFirstToken - When we receive first LLM output (TTFB)
 * 5. llmComplete - When LLM finishes
 * 6. ttsFirstAudio - When TTS starts sending audio
 * 7. audioStarted - When audio actually starts playing
 *
 * @module agents/shared/e2e-latency-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getAllFlagStatuses } from './performance/latency-feature-flags.js';

const log = createLogger({ module: 'E2ELatency' });

// ============================================================================
// TYPES
// ============================================================================

export interface LatencyTimeline {
  turnId: string;
  sessionId: string;
  userTranscript?: string;

  // Timestamps
  userSpeechEnded?: number;
  processingStarted?: number;
  llmRequestSent?: number;
  llmFirstToken?: number;
  llmComplete?: number;
  ttsFirstAudio?: number;
  audioStarted?: number;

  // Computed latencies (ms)
  processingLatency?: number; // processingStarted - userSpeechEnded
  llmTTFB?: number; // llmFirstToken - llmRequestSent (OpenAI's time to first token)
  llmTotal?: number; // llmComplete - llmRequestSent
  ttsLatency?: number; // ttsFirstAudio - llmComplete
  e2eTotal?: number; // audioStarted - userSpeechEnded

  // Optimization metrics (WS1-WS4)
  speculativeContextBuiltAt?: number; // When speculative context finished (WS1)
  vadThresholdMs?: number; // VAD endpointing threshold used (WS2)
  promptTokenCount?: number; // Token count sent to LLM (WS3)
  promptCompressionRatio?: number; // Compression ratio achieved (WS3)
  contextBuilderTimings?: Record<string, number>; // Per-builder duration in ms

  // Active latency optimizations (WS1-WS4 flag names that were enabled for this turn)
  activeOptimizations: string[];

  // Diagnostics
  context?: string;
  isOpenAISlow?: boolean; // TTFB > 2000ms
  isTTSSlow?: boolean; // TTS latency > 500ms
  isProcessingSlow?: boolean; // Processing > 500ms
}

// ============================================================================
// STORAGE
// ============================================================================

// Active timelines by turnId
const activeTimelines = new Map<string, LatencyTimeline>();

// Completed timelines (keep last 100 for analysis)
const completedTimelines: LatencyTimeline[] = [];
const MAX_COMPLETED = 100;

// Session to current turnId mapping
const sessionTurnMap = new Map<string, string>();

// ============================================================================
// THRESHOLDS (ms)
// ============================================================================

const THRESHOLDS = {
  OPENAI_TTFB_SLOW: 2000, // OpenAI taking > 2s to first token is slow
  OPENAI_TTFB_CRITICAL: 5000, // > 5s is critical
  TTS_SLOW: 500, // TTS > 500ms is slow
  PROCESSING_SLOW: 500, // Our processing > 500ms is slow
  E2E_SLOW: 3000, // Total E2E > 3s is slow
  E2E_CRITICAL: 6000, // > 6s is critical
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start tracking a new turn.
 * Call this when user speech ends or transcript is received.
 */
export function startTurn(sessionId: string, userTranscript?: string): string {
  const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Capture which latency optimizations are active for this turn
  const flagStatuses = getAllFlagStatuses();
  const activeOptimizations = Object.entries(flagStatuses)
    .filter(([, s]) => s.enabled)
    .map(([name]) => name);

  const timeline: LatencyTimeline = {
    turnId,
    sessionId,
    userTranscript: userTranscript?.slice(0, 100),
    userSpeechEnded: Date.now(),
    activeOptimizations,
  };

  activeTimelines.set(turnId, timeline);
  sessionTurnMap.set(sessionId, turnId);

  log.debug({ turnId, sessionId, transcript: userTranscript?.slice(0, 50) }, '📊 Turn started');

  return turnId;
}

/**
 * Mark when we start processing the transcript.
 */
export function markProcessingStarted(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.processingStarted = Date.now();

  if (timeline.userSpeechEnded) {
    timeline.processingLatency = timeline.processingStarted - timeline.userSpeechEnded;
  }
}

/**
 * Mark when we send the LLM request.
 */
export function markLLMRequestSent(sessionIdOrTurnId: string, context?: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.llmRequestSent = Date.now();
  timeline.context = context;

  log.debug(
    {
      turnId: timeline.turnId,
      context,
      timeSinceUserSpeech: timeline.userSpeechEnded
        ? Date.now() - timeline.userSpeechEnded
        : undefined,
    },
    '📊 LLM request sent'
  );
}

/**
 * Mark when we receive the first token from LLM.
 * This is the critical TTFB (Time To First Byte) metric.
 */
export function markLLMFirstToken(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.llmFirstToken = Date.now();

  if (timeline.llmRequestSent) {
    timeline.llmTTFB = timeline.llmFirstToken - timeline.llmRequestSent;
    timeline.isOpenAISlow = timeline.llmTTFB > THRESHOLDS.OPENAI_TTFB_SLOW;

    // Log prominently if OpenAI is slow
    if (timeline.llmTTFB > THRESHOLDS.OPENAI_TTFB_CRITICAL) {
      log.warn(
        { turnId: timeline.turnId, llmTTFB: timeline.llmTTFB, context: timeline.context },
        '🐌 CRITICAL: OpenAI TTFB > 5s - OpenAI is very slow!'
      );
    } else if (timeline.isOpenAISlow) {
      log.warn(
        { turnId: timeline.turnId, llmTTFB: timeline.llmTTFB, context: timeline.context },
        '⚠️ OpenAI TTFB > 2s - OpenAI is slow'
      );
    } else {
      log.debug(
        { turnId: timeline.turnId, llmTTFB: timeline.llmTTFB },
        '📊 LLM first token received'
      );
    }
  }
}

/**
 * Mark when LLM completes.
 */
export function markLLMComplete(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.llmComplete = Date.now();

  if (timeline.llmRequestSent) {
    timeline.llmTotal = timeline.llmComplete - timeline.llmRequestSent;
  }
}

/**
 * Mark when TTS starts sending audio.
 */
export function markTTSFirstAudio(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.ttsFirstAudio = Date.now();

  if (timeline.llmComplete) {
    timeline.ttsLatency = timeline.ttsFirstAudio - timeline.llmComplete;
    timeline.isTTSSlow = timeline.ttsLatency > THRESHOLDS.TTS_SLOW;

    if (timeline.isTTSSlow) {
      log.warn(
        { turnId: timeline.turnId, ttsLatency: timeline.ttsLatency },
        '⚠️ TTS latency > 500ms - Cartesia is slow'
      );
    }
  }
}

/**
 * Mark when audio actually starts playing.
 * This completes the E2E timeline.
 */
export function markAudioStarted(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.audioStarted = Date.now();

  if (timeline.userSpeechEnded) {
    timeline.e2eTotal = timeline.audioStarted - timeline.userSpeechEnded;
  }

  // Calculate processing time (our code) vs external services
  timeline.isProcessingSlow =
    timeline.processingLatency !== undefined &&
    timeline.processingLatency > THRESHOLDS.PROCESSING_SLOW;

  // Complete and log the timeline
  completeTurn(timeline);
}

// ============================================================================
// OPTIMIZATION TRACKING (WS1-WS4)
// ============================================================================

/**
 * Mark when speculative context building completes (WS1).
 */
export function markSpeculativeContextBuilt(sessionIdOrTurnId: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.speculativeContextBuiltAt = Date.now();
  log.debug({ turnId: timeline.turnId }, '📊 Speculative context built');
}

/**
 * Record the VAD endpointing threshold used for this turn (WS2).
 */
export function recordVADThreshold(sessionIdOrTurnId: string, ms: number): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.vadThresholdMs = ms;
}

/**
 * Record prompt metrics after compression (WS3).
 */
export function recordPromptMetrics(
  sessionIdOrTurnId: string,
  metrics: { tokenCount: number; compressionRatio?: number }
): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.promptTokenCount = metrics.tokenCount;
  if (metrics.compressionRatio !== undefined) {
    timeline.promptCompressionRatio = metrics.compressionRatio;
  }
}

/**
 * Record how long an individual context builder took (WS1/WS5).
 */
export function recordContextBuilderTiming(
  sessionIdOrTurnId: string,
  builderName: string,
  durationMs: number
): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  if (!timeline.contextBuilderTimings) {
    timeline.contextBuilderTimings = {};
  }
  timeline.contextBuilderTimings[builderName] = durationMs;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Force complete a turn (for timeout or error cases).
 */
export function completeTurnWithError(sessionIdOrTurnId: string, error: string): void {
  const timeline = getTimeline(sessionIdOrTurnId);
  if (!timeline) return;

  timeline.context = `${timeline.context || ''} [ERROR: ${error}]`;
  completeTurn(timeline);
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Get recent latency stats for dashboard.
 */
export function getLatencyStats(): {
  avgE2E: number;
  avgLLMTTFB: number;
  avgTTS: number;
  avgProcessing: number;
  slowOpenAIPercent: number;
  slowTTSPercent: number;
  recentTimelines: LatencyTimeline[];
  optimizations: {
    avgPromptTokens: number;
    avgCompressionRatio: number;
    avgVADThreshold: number;
    speculativeContextHitRate: number;
    contextBuilderAvgTimings: Record<string, number>;
  };
} {
  const recent = completedTimelines.slice(-20);

  const emptyOptimizations = {
    avgPromptTokens: 0,
    avgCompressionRatio: 0,
    avgVADThreshold: 0,
    speculativeContextHitRate: 0,
    contextBuilderAvgTimings: {} as Record<string, number>,
  };

  if (recent.length === 0) {
    return {
      avgE2E: 0,
      avgLLMTTFB: 0,
      avgTTS: 0,
      avgProcessing: 0,
      slowOpenAIPercent: 0,
      slowTTSPercent: 0,
      recentTimelines: [],
      optimizations: emptyOptimizations,
    };
  }

  const e2es = recent.filter((t) => t.e2eTotal).map((t) => t.e2eTotal!);
  const ttfbs = recent.filter((t) => t.llmTTFB).map((t) => t.llmTTFB!);
  const ttss = recent.filter((t) => t.ttsLatency).map((t) => t.ttsLatency!);
  const procs = recent.filter((t) => t.processingLatency).map((t) => t.processingLatency!);

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const slowOpenAI = recent.filter((t) => t.isOpenAISlow).length;
  const slowTTS = recent.filter((t) => t.isTTSSlow).length;

  // Optimization metrics
  const tokenCounts = recent.filter((t) => t.promptTokenCount).map((t) => t.promptTokenCount!);
  const compressionRatios = recent.filter((t) => t.promptCompressionRatio).map((t) => t.promptCompressionRatio!);
  const vadThresholds = recent.filter((t) => t.vadThresholdMs).map((t) => t.vadThresholdMs!);
  const speculativeHits = recent.filter((t) => t.speculativeContextBuiltAt).length;

  // Aggregate context builder timings across turns
  const builderTotals: Record<string, { sum: number; count: number }> = {};
  for (const t of recent) {
    if (!t.contextBuilderTimings) continue;
    for (const [name, duration] of Object.entries(t.contextBuilderTimings)) {
      if (!builderTotals[name]) builderTotals[name] = { sum: 0, count: 0 };
      builderTotals[name].sum += duration;
      builderTotals[name].count += 1;
    }
  }
  const contextBuilderAvgTimings: Record<string, number> = {};
  for (const [name, { sum, count }] of Object.entries(builderTotals)) {
    contextBuilderAvgTimings[name] = Math.round(sum / count);
  }

  return {
    avgE2E: Math.round(avg(e2es)),
    avgLLMTTFB: Math.round(avg(ttfbs)),
    avgTTS: Math.round(avg(ttss)),
    avgProcessing: Math.round(avg(procs)),
    slowOpenAIPercent: Math.round((slowOpenAI / recent.length) * 100),
    slowTTSPercent: Math.round((slowTTS / recent.length) * 100),
    recentTimelines: recent.slice(-5),
    optimizations: {
      avgPromptTokens: Math.round(avg(tokenCounts)),
      avgCompressionRatio: Number(avg(compressionRatios).toFixed(3)),
      avgVADThreshold: Math.round(avg(vadThresholds)),
      speculativeContextHitRate: recent.length > 0
        ? Math.round((speculativeHits / recent.length) * 100)
        : 0,
      contextBuilderAvgTimings,
    },
  };
}

/**
 * Get all completed timelines (for detailed dashboard analysis).
 */
export function getCompletedTimelines(): readonly LatencyTimeline[] {
  return completedTimelines;
}

/**
 * Get the current turn's timeline for a session.
 */
export function getCurrentTimeline(sessionId: string): LatencyTimeline | null {
  const turnId = sessionTurnMap.get(sessionId);
  if (!turnId) return null;
  return activeTimelines.get(turnId) || null;
}

// ============================================================================
// INTERNAL
// ============================================================================

function getTimeline(sessionIdOrTurnId: string): LatencyTimeline | null {
  // Try direct turnId lookup first
  if (activeTimelines.has(sessionIdOrTurnId)) {
    return activeTimelines.get(sessionIdOrTurnId)!;
  }

  // Try session lookup
  const turnId = sessionTurnMap.get(sessionIdOrTurnId);
  if (turnId && activeTimelines.has(turnId)) {
    return activeTimelines.get(turnId)!;
  }

  return null;
}

function completeTurn(timeline: LatencyTimeline): void {
  // Remove from active
  activeTimelines.delete(timeline.turnId);

  // Add to completed
  completedTimelines.push(timeline);
  if (completedTimelines.length > MAX_COMPLETED) {
    completedTimelines.shift();
  }

  // Determine what's causing slowness
  const bottleneck = determineBottleneck(timeline);

  // Log comprehensive summary
  const summary = {
    turnId: timeline.turnId,
    transcript: timeline.userTranscript?.slice(0, 30),
    e2eTotal: timeline.e2eTotal,
    llmTTFB: timeline.llmTTFB,
    llmTotal: timeline.llmTotal,
    ttsLatency: timeline.ttsLatency,
    processingLatency: timeline.processingLatency,
    bottleneck,
    isOpenAISlow: timeline.isOpenAISlow,
    isTTSSlow: timeline.isTTSSlow,
    isProcessingSlow: timeline.isProcessingSlow,
  };

  if (timeline.e2eTotal && timeline.e2eTotal > THRESHOLDS.E2E_CRITICAL) {
    log.error(summary, '🚨 CRITICAL E2E LATENCY > 6s');
  } else if (timeline.e2eTotal && timeline.e2eTotal > THRESHOLDS.E2E_SLOW) {
    log.warn(summary, '⚠️ Slow E2E latency > 3s');
  } else {
    log.info(summary, '📊 Turn complete');
  }
}

function determineBottleneck(
  timeline: LatencyTimeline
): 'openai' | 'tts' | 'processing' | 'unknown' {
  if (timeline.isOpenAISlow) return 'openai';
  if (timeline.isTTSSlow) return 'tts';
  if (timeline.isProcessingSlow) return 'processing';
  return 'unknown';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startTurn,
  markProcessingStarted,
  markLLMRequestSent,
  markLLMFirstToken,
  markLLMComplete,
  markTTSFirstAudio,
  markAudioStarted,
  markSpeculativeContextBuilt,
  recordVADThreshold,
  recordPromptMetrics,
  recordContextBuilderTiming,
  completeTurnWithError,
  getLatencyStats,
  getCurrentTimeline,
};
