/**
 * Performance Optimization Integration
 *
 * Central integration point for all performance optimizations.
 * Import this in your voice agent to enable all optimizations.
 *
 * Usage:
 * ```typescript
 * import { initializePerformanceOptimizations } from './shared/performance/integration.js';
 *
 * // At agent startup
 * await initializePerformanceOptimizations({
 *   userId: 'user123',
 *   personaId: 'ferni',
 *   sessionId: 'session456',
 *   enablePubSub: true,
 * });
 * ```
 *
 * @module agents/shared/performance/integration
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PerformanceIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface PerformanceConfig {
  /** User ID for personalization */
  userId?: string;
  /** Current persona ID */
  personaId?: string;
  /** Session ID */
  sessionId?: string;
  /** Enable Pub/Sub for background tasks */
  enablePubSub?: boolean;
  /** Enable speculative TTS */
  enableSpeculativeTTS?: boolean;
  /** Enable batched LLM analysis */
  enableBatchedAnalysis?: boolean;
  /** Enable parallel memory search */
  enableParallelMemory?: boolean;
  /** Enable context caching */
  enableContextCache?: boolean;
  /** Enable turn profiling */
  enableProfiling?: boolean;
}

export interface PerformanceMetrics {
  initialized: boolean;
  pubsubEnabled: boolean;
  speculativeTTSEnabled: boolean;
  batchedAnalysisEnabled: boolean;
  parallelMemoryEnabled: boolean;
  contextCacheEnabled: boolean;
  profilingEnabled: boolean;
  warmupComplete: boolean;
  initDurationMs: number;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;
let metrics: PerformanceMetrics = {
  initialized: false,
  pubsubEnabled: false,
  speculativeTTSEnabled: false,
  batchedAnalysisEnabled: false,
  parallelMemoryEnabled: false,
  contextCacheEnabled: false,
  profilingEnabled: false,
  warmupComplete: false,
  initDurationMs: 0,
};

/**
 * Initialize all performance optimizations
 */
export async function initializePerformanceOptimizations(
  config: PerformanceConfig = {}
): Promise<PerformanceMetrics> {
  if (initialized) {
    log.debug('Performance optimizations already initialized');
    return metrics;
  }

  const startTime = Date.now();
  log.info({ config }, 'Initializing performance optimizations...');

  const {
    userId,
    personaId,
    sessionId,
    enablePubSub = process.env.PUBSUB_ENABLED === 'true',
    enableSpeculativeTTS = true,
    enableBatchedAnalysis = true,
    enableParallelMemory = true,
    enableContextCache = true,
    enableProfiling = process.env.NODE_ENV !== 'production' ||
      process.env.ENABLE_PROFILING === 'true',
  } = config;

  // Initialize in parallel where possible
  const initTasks: Array<Promise<void>> = [];

  // 1. Initialize Pub/Sub
  if (enablePubSub) {
    initTasks.push(
      (async () => {
        try {
          const { initializePubSub } = await import('../../../services/pubsub/index.js');
          await initializePubSub();
          metrics.pubsubEnabled = true;
          log.info('Pub/Sub initialized');
        } catch (error) {
          log.warn({ error: String(error) }, 'Pub/Sub initialization failed, using local fallback');
        }
      })()
    );
  }

  // 2. Warm up speculative TTS with emotion variants
  if (enableSpeculativeTTS && personaId) {
    initTasks.push(
      (async () => {
        try {
          const { warmupTTSVoice } =
            await import('../../../services/performance/speculative-tts.js');
          // Warm up with common emotions for faster first-audio with emotion caching
          const commonEmotions = ['neutral', 'warm', 'concerned', 'supportive', 'curious'];
          await warmupTTSVoice(personaId, commonEmotions);
          metrics.speculativeTTSEnabled = true;
          log.info('Speculative TTS warmed up with emotion variants');
        } catch (error) {
          log.debug({ error: String(error) }, 'Speculative TTS warmup skipped');
        }
      })()
    );
  }

  // 3. Pre-warm context cache
  if (enableContextCache && userId && personaId) {
    initTasks.push(
      (async () => {
        try {
          const { prewarmContextCache } = await import('../../../intelligence/context-service.js');
          await prewarmContextCache(userId, personaId);
          metrics.contextCacheEnabled = true;
          log.info('Context cache warmed up');
        } catch (error) {
          log.debug({ error: String(error) }, 'Context cache warmup skipped');
        }
      })()
    );
  }

  // 4. Initialize speculative embeddings
  // speculative-embeddings removed during DDD cleanup
  if (enableParallelMemory) {
    metrics.parallelMemoryEnabled = false;
  }

  // Wait for all initialization
  await Promise.all(initTasks);

  // Set remaining flags
  metrics.batchedAnalysisEnabled = enableBatchedAnalysis;
  metrics.profilingEnabled = enableProfiling;
  metrics.warmupComplete = true;
  metrics.initDurationMs = Date.now() - startTime;
  metrics.initialized = true;
  initialized = true;

  log.info(
    { metrics, durationMs: metrics.initDurationMs },
    'Performance optimizations initialized'
  );

  return metrics;
}

// ============================================================================
// TURN PROCESSING HELPERS
// ============================================================================

/**
 * Process a turn with all optimizations enabled
 */
export async function processOptimizedTurn(input: {
  userId: string;
  sessionId: string;
  personaId: string;
  userMessage: string;
  turnNumber: number;
  voiceEmotion?: {
    emotion: string;
    confidence: number;
    prosody?: Record<string, number>;
  };
}): Promise<{
  context: string;
  analysis: Record<string, unknown>;
  memories: Array<{ content: string; relevance: number }>;
  metrics: {
    contextBuildMs: number;
    analysisMs: number;
    memoryMs: number;
    totalMs: number;
  };
}> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // Start profiling if enabled
  if (metrics.profilingEnabled) {
    const { startTurnProfiling } = await import('../../../services/performance/turn-profiler.js');
    startTurnProfiling(input.sessionId, input.turnNumber);
  }

  // Run context, analysis, and memory in parallel
  const [contextResult, analysisResult, memoryResult] = await Promise.all([
    // Context building
    (async () => {
      const ctxStart = Date.now();
      try {
        const { buildTurnContext } = await import('../../../intelligence/context-service.js');
        const result = await buildTurnContext({
          userId: input.userId,
          sessionId: input.sessionId,
          personaId: input.personaId,
          userMessage: input.userMessage,
          turnNumber: input.turnNumber,
          voiceEmotion: input.voiceEmotion,
          priority: 'real-time',
        });
        timings.contextBuildMs = Date.now() - ctxStart;
        return result.context;
      } catch (error) {
        timings.contextBuildMs = Date.now() - ctxStart;
        log.debug({ error: String(error) }, 'Context build failed');
        return '';
      }
    })(),

    // Batched analysis
    (async () => {
      const analysisStart = Date.now();
      try {
        if (!metrics.batchedAnalysisEnabled) {
          timings.analysisMs = 0;
          return {};
        }
        const { batchedAnalyze } = await import('../../../intelligence/batched-llm-analysis.js');
        const result = await batchedAnalyze({
          message: input.userMessage,
          personaId: input.personaId,
          userId: input.userId,
          analyses: ['intent', 'emotion', 'entities', 'topics', 'distress'],
        });
        timings.analysisMs = Date.now() - analysisStart;
        return result;
      } catch (error) {
        timings.analysisMs = Date.now() - analysisStart;
        log.debug({ error: String(error) }, 'Batched analysis failed');
        return {};
      }
    })(),

    // Parallel memory search
    (async () => {
      const memStart = Date.now();
      try {
        if (!metrics.parallelMemoryEnabled) {
          timings.memoryMs = 0;
          return [];
        }
        // parallel-memory-search removed during DDD cleanup
        timings.memoryMs = 0;
        return [] as Array<{ content: string; relevance: number }>;
      } catch (error) {
        timings.memoryMs = Date.now() - memStart;
        log.debug({ error: String(error) }, 'Memory search failed');
        return [];
      }
    })(),
  ]);

  // Complete profiling
  if (metrics.profilingEnabled) {
    const { completeTurnProfiling } =
      await import('../../../services/performance/turn-profiler.js');
    completeTurnProfiling(input.sessionId, input.turnNumber);
  }

  const totalMs = Date.now() - startTime;

  return {
    context: contextResult,
    analysis: analysisResult,
    memories: memoryResult,
    metrics: {
      contextBuildMs: timings.contextBuildMs || 0,
      analysisMs: timings.analysisMs || 0,
      memoryMs: timings.memoryMs || 0,
      totalMs,
    },
  };
}

/**
 * Queue background tasks after turn completes
 */
export async function queueBackgroundTasks(input: {
  userId: string;
  sessionId: string;
  personaId: string;
  userMessage: string;
  assistantResponse: string;
  turnNumber: number;
  analysis?: Record<string, unknown>;
}): Promise<void> {
  // Queue to Pub/Sub if enabled, otherwise use local async events
  if (metrics.pubsubEnabled) {
    try {
      const { publishEmbeddingTask, publishTrustUpdate, publishAnalyticsEvent } =
        await import('../../../services/pubsub/index.js');

      // Queue embedding for new content
      await publishEmbeddingTask('embedding:generate', {
        text: input.userMessage,
        userId: input.userId,
        sessionId: input.sessionId,
      });

      // Queue analytics
      await publishAnalyticsEvent('analytics:track', {
        userId: input.userId,
        sessionId: input.sessionId,
        personaId: input.personaId,
        turnNumber: input.turnNumber,
        intent: (input.analysis as { intent?: { primary?: string } })?.intent?.primary,
        emotion: (input.analysis as { emotion?: { primary?: string } })?.emotion?.primary,
      });

      // Queue trust update
      await publishTrustUpdate(input.userId, {
        conversationCount: input.turnNumber,
        lastInteraction: new Date().toISOString(),
      });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to queue to Pub/Sub');
    }
  } else {
    // Use local async events
    try {
      const { queueEmbeddingGeneration, emitAnalyticsInteraction, emitTrustUpdate } =
        await import('../../../services/async-events/index.js');

      queueEmbeddingGeneration(input.userMessage, {
        userId: input.userId,
        sessionId: input.sessionId,
      });

      emitAnalyticsInteraction({
        userId: input.userId,
        sessionId: input.sessionId,
        personaId: input.personaId,
        interactionType: 'turn',
        metadata: {
          turnNumber: input.turnNumber,
          intent: (input.analysis as { intent?: { primary?: string } })?.intent?.primary,
        },
      });

      emitTrustUpdate({
        userId: input.userId,
        personaId: input.personaId,
        trustDelta: 0.01,
        reason: 'conversation_turn',
      });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to emit local events');
    }
  }
}

/**
 * Start speculative TTS based on analysis
 */
export async function startSpeculativeTTS(input: {
  sessionId: string;
  personaId: string;
  analysis?: {
    emotion?: { primary?: string };
    intent?: { primary?: string };
    distress?: { level?: number };
  };
}): Promise<void> {
  if (!metrics.speculativeTTSEnabled) return;

  try {
    const { speculateTTS } = await import('../../../services/performance/speculative-tts.js');
    await speculateTTS(input.sessionId, input.personaId, {
      emotion: input.analysis?.emotion?.primary,
      intent: input.analysis?.intent?.primary,
      distressLevel: input.analysis?.distress?.level,
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to start speculative TTS');
  }
}

// ============================================================================
// METRICS & STATUS
// ============================================================================

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Get comprehensive performance summary
 */
export async function getPerformanceSummary(): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {
    integration: metrics,
  };

  // Gather metrics from all subsystems
  try {
    const { getContextServiceMetrics } = await import('../../../intelligence/context-service.js');
    summary.contextService = getContextServiceMetrics();
  } catch {
    /* ignore */
  }

  try {
    const { getBatchedAnalysisMetrics } =
      await import('../../../intelligence/batched-llm-analysis.js');
    summary.batchedAnalysis = getBatchedAnalysisMetrics();
  } catch {
    /* ignore */
  }

  // parallel-memory-search removed during DDD cleanup
  summary.parallelMemory = null;

  try {
    const { getSpeculativeTTSMetrics } =
      await import('../../../services/performance/speculative-tts.js');
    summary.speculativeTTS = getSpeculativeTTSMetrics();
  } catch {
    /* ignore */
  }

  try {
    const { getGlobalPerformanceSummary } =
      await import('../../../services/performance/turn-profiler.js');
    summary.turnProfiling = getGlobalPerformanceSummary();
  } catch {
    /* ignore */
  }

  try {
    const { getPubSubMetrics } = await import('../../../services/pubsub/index.js');
    summary.pubsub = getPubSubMetrics();
  } catch {
    /* ignore */
  }

  return summary;
}

/**
 * Reset all performance optimizations (useful for testing)
 */
export function resetPerformanceOptimizations(): void {
  initialized = false;
  metrics = {
    initialized: false,
    pubsubEnabled: false,
    speculativeTTSEnabled: false,
    batchedAnalysisEnabled: false,
    parallelMemoryEnabled: false,
    contextCacheEnabled: false,
    profilingEnabled: false,
    warmupComplete: false,
    initDurationMs: 0,
  };
  log.info('Performance optimizations reset');
}

export default {
  initializePerformanceOptimizations,
  processOptimizedTurn,
  queueBackgroundTasks,
  startSpeculativeTTS,
  getPerformanceMetrics,
  getPerformanceSummary,
  resetPerformanceOptimizations,
};
