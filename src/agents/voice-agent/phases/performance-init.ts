/**
 * Performance Optimizations Initialization
 *
 * Initializes session-level performance systems including:
 * - Pub/Sub offloading
 * - Batched LLM analysis
 * - Parallel memory search
 * - Context caching
 * - Speculative TTS
 * - Turn profiling
 *
 * @module agents/voice-agent/phases/performance-init
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'performance-init' });

// ============================================================================
// TYPES
// ============================================================================

export interface PerformanceConfig {
  userId: string;
  personaId: string;
  sessionId: string;
  enablePubSub?: boolean;
  enableSpeculativeTTS?: boolean;
  enableBatchedAnalysis?: boolean;
  enableParallelMemory?: boolean;
  enableContextCache?: boolean;
  enableProfiling?: boolean;
}

export interface PerformanceResult {
  success: boolean;
  cleanup: () => Promise<void>;
  getSummary: () => Promise<Record<string, unknown> | null>;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize performance optimizations for a session.
 *
 * This enables various scaling systems:
 * - Pub/Sub offloading for async work
 * - Batched LLM analysis (DISABLED by default - causes duplicate API calls)
 * - Parallel memory search for faster retrieval
 * - Context caching to reduce redundant work
 * - Speculative TTS for faster first response
 * - Turn profiling for latency tracking
 *
 * @param config - Performance configuration
 * @returns Result with cleanup function and summary getter
 */
export async function initializePerformance(config: PerformanceConfig): Promise<PerformanceResult> {
  const {
    userId,
    personaId,
    sessionId,
    enablePubSub = process.env.PUBSUB_ENABLED === 'true',
    enableSpeculativeTTS = true,
    // 🚨 DISABLED by default: batchedAnalysis makes redundant LLM calls per turn
    // The turn processor already does emotion/intent detection
    // Re-enable only if you need it for specific analytics.
    enableBatchedAnalysis = false,
    enableParallelMemory = true,
    enableContextCache = true,
    enableProfiling = true,
  } = config;

  let perfModule: typeof import('../../shared/performance/index.js') | null = null;
  let initialized = false;

  try {
    perfModule = await import('../../shared/performance/index.js');
    await perfModule.initializePerformanceOptimizations({
      userId,
      personaId,
      sessionId,
      enablePubSub,
      enableSpeculativeTTS,
      enableBatchedAnalysis,
      enableParallelMemory,
      enableContextCache,
      enableProfiling,
    });
    initialized = true;

    log.info(
      { sessionId: sessionId.slice(0, 8), pubsub: enablePubSub },
      'Performance optimizations initialized'
    );

    return {
      success: true,
      cleanup: async () => {
        if (!initialized || !perfModule) return;
        try {
          const summary = await perfModule.getPerformanceSummary();
          if (summary?.turnProfiling) {
            log.debug({ summary: summary.turnProfiling }, 'Performance summary');
          }
          perfModule.resetPerformanceOptimizations();
        } catch {
          // Ignore cleanup errors
        }
      },
      getSummary: async () => {
        if (!initialized || !perfModule) return null;
        try {
          return await perfModule.getPerformanceSummary();
        } catch {
          return null;
        }
      },
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Performance optimizations failed (non-fatal)');
    return {
      success: false,
      cleanup: async () => {},
      getSummary: async () => null,
    };
  }
}
