/**
 * Latency Dashboard API Routes
 *
 * Exposes sub-300ms optimization metrics for the latency dashboard.
 *
 * Endpoints:
 * - GET /api/observability/latency           — P50/P95/P99 per stage, bottleneck ID
 * - GET /api/observability/latency/detailed  — Per-turn breakdown with builder timings
 * - GET /api/observability/latency/workstreams — Workstream-specific metrics
 *
 * @module LatencyDashboardRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from './helpers.js';
import {
  getLatencyStats,
  getCompletedTimelines,
  type LatencyTimeline,
} from '../agents/shared/e2e-latency-tracker.js';
import { getAllFlagStatuses } from '../agents/shared/performance/latency-feature-flags.js';

const log = createLogger({ module: 'LatencyDashboard' });

const BASE_PATH = '/api/observability/latency';

// ============================================================================
// PERCENTILE MATH
// ============================================================================

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computePercentiles(values: number[]): { p50: number; p95: number; p99: number; min: number; max: number } {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

// ============================================================================
// RESPONSE BUILDERS
// ============================================================================

function buildSummaryResponse() {
  const stats = getLatencyStats();
  const timelines = getCompletedTimelines();

  const e2es = timelines.filter((t) => t.e2eTotal != null).map((t) => t.e2eTotal!);
  const ttfbs = timelines.filter((t) => t.llmTTFB != null).map((t) => t.llmTTFB!);
  const ttss = timelines.filter((t) => t.ttsLatency != null).map((t) => t.ttsLatency!);
  const procs = timelines.filter((t) => t.processingLatency != null).map((t) => t.processingLatency!);

  // Bottleneck distribution
  const bottlenecks = { openai: 0, tts: 0, processing: 0, unknown: 0 };
  for (const t of timelines) {
    if (t.isOpenAISlow) bottlenecks.openai++;
    else if (t.isTTSSlow) bottlenecks.tts++;
    else if (t.isProcessingSlow) bottlenecks.processing++;
    else bottlenecks.unknown++;
  }

  const sub300 = e2es.filter((v) => v < 300).length;
  const sub500 = e2es.filter((v) => v < 500).length;

  return {
    totalTurns: timelines.length,
    stages: {
      e2e: computePercentiles(e2es),
      llmTTFB: computePercentiles(ttfbs),
      tts: computePercentiles(ttss),
      processing: computePercentiles(procs),
    },
    averages: {
      e2e: stats.avgE2E,
      llmTTFB: stats.avgLLMTTFB,
      tts: stats.avgTTS,
      processing: stats.avgProcessing,
    },
    bottleneckDistribution: bottlenecks,
    targets: {
      sub300ms: timelines.length > 0 ? Math.round((sub300 / timelines.length) * 100) : 0,
      sub500ms: timelines.length > 0 ? Math.round((sub500 / timelines.length) * 100) : 0,
    },
    slowRates: {
      openai: stats.slowOpenAIPercent,
      tts: stats.slowTTSPercent,
    },
    collectedAt: new Date().toISOString(),
  };
}

function buildDetailedResponse(limit: number) {
  const timelines = getCompletedTimelines();
  const recent = timelines.slice(-limit);

  const detailed = recent.map((t: LatencyTimeline) => ({
    turnId: t.turnId,
    sessionId: t.sessionId,
    transcript: t.userTranscript,
    timestamps: {
      userSpeechEnded: t.userSpeechEnded,
      processingStarted: t.processingStarted,
      llmRequestSent: t.llmRequestSent,
      llmFirstToken: t.llmFirstToken,
      llmComplete: t.llmComplete,
      ttsFirstAudio: t.ttsFirstAudio,
      audioStarted: t.audioStarted,
      speculativeContextBuiltAt: t.speculativeContextBuiltAt,
    },
    latencies: {
      processing: t.processingLatency,
      llmTTFB: t.llmTTFB,
      llmTotal: t.llmTotal,
      tts: t.ttsLatency,
      e2e: t.e2eTotal,
    },
    optimizations: {
      vadThresholdMs: t.vadThresholdMs,
      promptTokenCount: t.promptTokenCount,
      compressionRatio: t.promptCompressionRatio,
      contextBuilderTimings: t.contextBuilderTimings,
    },
    flags: {
      isOpenAISlow: t.isOpenAISlow,
      isTTSSlow: t.isTTSSlow,
      isProcessingSlow: t.isProcessingSlow,
    },
    context: t.context,
  }));

  return {
    count: detailed.length,
    turns: detailed,
    collectedAt: new Date().toISOString(),
  };
}

function buildWorkstreamResponse() {
  const timelines = getCompletedTimelines();
  const flags = getAllFlagStatuses();

  // WS1: Speculative context metrics
  const speculativeTimelines = timelines.filter((t) => t.speculativeContextBuiltAt != null);
  const speculativeHitRate = timelines.length > 0
    ? Math.round((speculativeTimelines.length / timelines.length) * 100)
    : 0;

  // WS2: VAD threshold distribution
  const vadValues = timelines.filter((t) => t.vadThresholdMs != null).map((t) => t.vadThresholdMs!);
  const vadBuckets: Record<string, number> = { '<200ms': 0, '200-400ms': 0, '400-600ms': 0, '>600ms': 0 };
  for (const v of vadValues) {
    if (v < 200) vadBuckets['<200ms']++;
    else if (v < 400) vadBuckets['200-400ms']++;
    else if (v < 600) vadBuckets['400-600ms']++;
    else vadBuckets['>600ms']++;
  }

  // WS3: Compression metrics
  const tokenCounts = timelines.filter((t) => t.promptTokenCount != null).map((t) => t.promptTokenCount!);
  const compressionRatios = timelines.filter((t) => t.promptCompressionRatio != null).map((t) => t.promptCompressionRatio!);
  const avgTokens = tokenCounts.length > 0 ? Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length) : 0;
  const avgCompression = compressionRatios.length > 0
    ? Number((compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length).toFixed(3))
    : 0;

  // WS4: Cache warming (tracked via speculative TTS; proxy via timelines with low TTS latency)
  const ttsValues = timelines.filter((t) => t.ttsLatency != null).map((t) => t.ttsLatency!);
  const cacheWarmHits = ttsValues.filter((v) => v < 50).length; // <50ms indicates cache hit
  const cacheWarmRate = ttsValues.length > 0
    ? Math.round((cacheWarmHits / ttsValues.length) * 100)
    : 0;

  // Context builder timings aggregate
  const builderTotals: Record<string, { sum: number; count: number }> = {};
  for (const t of timelines) {
    if (!t.contextBuilderTimings) continue;
    for (const [name, duration] of Object.entries(t.contextBuilderTimings)) {
      if (!builderTotals[name]) builderTotals[name] = { sum: 0, count: 0 };
      builderTotals[name].sum += duration;
      builderTotals[name].count += 1;
    }
  }
  const builderAvgs: Record<string, number> = {};
  for (const [name, { sum, count }] of Object.entries(builderTotals)) {
    builderAvgs[name] = Math.round(sum / count);
  }

  return {
    flags,
    workstreams: {
      ws1_speculative_context: {
        hitRate: speculativeHitRate,
        totalHits: speculativeTimelines.length,
        totalTurns: timelines.length,
        contextBuilderAvgTimings: builderAvgs,
      },
      ws2_semantic_vad: {
        thresholdDistribution: vadBuckets,
        avgThresholdMs: computePercentiles(vadValues).p50,
        percentiles: computePercentiles(vadValues),
        totalTracked: vadValues.length,
      },
      ws3_prompt_compression: {
        avgTokenCount: avgTokens,
        avgCompressionRatio: avgCompression,
        tokenPercentiles: computePercentiles(tokenCounts),
        totalTracked: tokenCounts.length,
      },
      ws4_cache_warming: {
        cacheWarmRate,
        cacheWarmHits,
        totalTTSRequests: ttsValues.length,
        ttsPercentiles: computePercentiles(ttsValues),
      },
    },
    collectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle latency dashboard routes under /api/observability/latency.
 * @returns true if the request was handled
 */
export async function handleLatencyDashboardRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // GET /api/observability/latency — Summary with percentiles
    if ((subPath === '/' || subPath === '') && req.method === 'GET') {
      sendJSON(res, buildSummaryResponse());
      return true;
    }

    // GET /api/observability/latency/detailed — Per-turn breakdown
    if (subPath === '/detailed' && req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;
      sendJSON(res, buildDetailedResponse(limit));
      return true;
    }

    // GET /api/observability/latency/workstreams — WS1-WS4 metrics
    if (subPath === '/workstreams' && req.method === 'GET') {
      sendJSON(res, buildWorkstreamResponse());
      return true;
    }

    sendError(res, 'Unknown latency dashboard endpoint', 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err }, 'Latency dashboard API error');
    sendError(res, message, 500);
    return true;
  }
}

export default { handleLatencyDashboardRoutes };
