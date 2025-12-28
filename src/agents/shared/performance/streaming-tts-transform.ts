/**
 * Streaming TTS Transform
 *
 * Transforms LLM output stream into optimally-chunked text for TTS.
 * Uses aggressive first-chunk behavior to minimize time-to-first-audio.
 *
 * Key Optimizations:
 * - First chunk is sent after just 20 chars or 20ms (vs ~100+ in default behavior)
 * - Sentence boundary detection for natural speech pauses
 * - Lookahead buffering for smoother playback
 *
 * Target: First audio at ~300ms (vs ~2.5s without optimization)
 *
 * @module agents/shared/performance/streaming-tts-transform
 */

import { TransformStream as NodeTransformStream } from 'node:stream/web';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'StreamingTTS' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface StreamingTTSConfig {
  /**
   * Minimum chars for first chunk (aggressive for fast startup)
   * @default 15
   */
  firstChunkMinSize?: number;

  /**
   * Minimum chars for subsequent chunks
   * @default 30
   */
  minChunkSize?: number;

  /**
   * Maximum chars before forced flush
   * @default 150
   */
  maxChunkSize?: number;

  /**
   * Delay before flushing first chunk (ms)
   * @default 20
   */
  firstChunkDelayMs?: number;

  /**
   * Delay before flushing subsequent chunks (ms)
   * @default 50
   */
  chunkDelayMs?: number;

  /**
   * Enable metrics tracking
   * @default true
   */
  enableMetrics?: boolean;

  /**
   * Session ID for metrics
   */
  sessionId?: string;
}

export interface StreamingTTSMetrics {
  sessionId?: string;
  firstChunkLatencyMs: number;
  totalChunks: number;
  avgChunkLatencyMs: number;
  tokensProcessed: number;
  totalDurationMs: number;
}

// ============================================================================
// SENTENCE BOUNDARY DETECTION
// ============================================================================

/**
 * Sentence-ending patterns for natural chunking
 */
const SENTENCE_ENDINGS = /[.!?]+[\s]|[.!?]+$/;

/**
 * Phrase boundaries for mid-sentence breaks (commas, semicolons, etc.)
 */
const PHRASE_BREAKS = /[,;:][\s]|—[\s]|\.{3}[\s]/;

/**
 * Check if text ends at a natural boundary
 */
function endsAtNaturalBoundary(text: string): boolean {
  return SENTENCE_ENDINGS.test(text) || PHRASE_BREAKS.test(text);
}

/**
 * Find optimal split point in text
 */
function findSplitPoint(text: string, minLength: number, maxLength: number): number {
  // Look for sentence ending first
  const sentenceMatch = text.slice(minLength).match(SENTENCE_ENDINGS);
  if (sentenceMatch && sentenceMatch.index !== undefined) {
    const splitAt = minLength + sentenceMatch.index + sentenceMatch[0].length;
    if (splitAt <= maxLength) {
      return splitAt;
    }
  }

  // Look for phrase break
  const phraseMatch = text.slice(minLength).match(PHRASE_BREAKS);
  if (phraseMatch && phraseMatch.index !== undefined) {
    const splitAt = minLength + phraseMatch.index + phraseMatch[0].length;
    if (splitAt <= maxLength) {
      return splitAt;
    }
  }

  // Fall back to max length, trying to break at word boundary
  if (text.length >= maxLength) {
    const lastSpace = text.lastIndexOf(' ', maxLength);
    return lastSpace > minLength ? lastSpace + 1 : maxLength;
  }

  return -1; // Don't split yet
}

// ============================================================================
// STREAMING TRANSFORM
// ============================================================================

/**
 * Create a TransformStream that chunks text for optimal TTS latency.
 *
 * This transform applies aggressive first-chunk behavior to minimize
 * time-to-first-audio, while using sentence boundaries for natural chunking.
 *
 * @example
 * ```typescript
 * const transform = createStreamingTTSTransform({ sessionId: 'abc123' });
 * const chunkedStream = inputStream.pipeThrough(transform);
 * // First chunk arrives ~20ms after first token (if text is long enough)
 * ```
 */
export function createStreamingTTSTransform(
  config: StreamingTTSConfig = {}
): NodeTransformStream<string, string> {
  const {
    // AGGRESSIVE DEFAULTS for low latency (optimized Dec 2024)
    firstChunkMinSize = 8, // Was 15 - send "I hear..." faster
    minChunkSize = 20, // Was 30 - smaller chunks = faster audio
    maxChunkSize = 120, // Was 150 - prevents long waits
    firstChunkDelayMs = 10, // Was 20 - faster first audio
    chunkDelayMs = 40, // Was 50 - tighter timing
    enableMetrics = true,
    sessionId,
  } = config;

  // State
  let buffer = '';
  let hasSentFirstChunk = false;
  let startTime = 0;
  let firstChunkTime = 0;
  let chunkCount = 0;
  let tokenCount = 0;
  const chunkLatencies: number[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  // Helper to flush buffer as a chunk
  const flushChunk = (
    controller: TransformStreamDefaultController<string>,
    isFinal: boolean
  ): void => {
    if (buffer.length === 0) return;

    const now = Date.now();

    // Find optimal split point
    let chunkText: string;
    if (isFinal || buffer.length <= maxChunkSize) {
      chunkText = buffer;
      buffer = '';
    } else {
      const currentMinSize = hasSentFirstChunk ? minChunkSize : firstChunkMinSize;
      const splitAt = findSplitPoint(buffer, currentMinSize, maxChunkSize);

      if (splitAt > 0) {
        chunkText = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt);
      } else {
        chunkText = buffer.slice(0, maxChunkSize);
        buffer = buffer.slice(maxChunkSize);
      }
    }

    const trimmed = chunkText.trim();
    if (trimmed.length === 0) return;

    // Track metrics
    if (!hasSentFirstChunk) {
      firstChunkTime = now;
      hasSentFirstChunk = true;
      log.debug(
        { sessionId, firstChunkLatencyMs: now - startTime, chunkLength: trimmed.length },
        '🚀 First TTS chunk sent'
      );
    }

    chunkLatencies.push(now - startTime);
    chunkCount++;

    // Send chunk to TTS
    controller.enqueue(trimmed);

    // If there's remaining buffer and we're finalizing, recurse
    if (isFinal && buffer.length > 0) {
      flushChunk(controller, true);
    }
  };

  // Helper to check if we should flush
  const shouldFlush = (): boolean => {
    const currentMinSize = hasSentFirstChunk ? minChunkSize : firstChunkMinSize;

    // Force flush if over max size
    if (buffer.length >= maxChunkSize) {
      return true;
    }

    // Flush if at natural boundary and over min size
    if (buffer.length >= currentMinSize && endsAtNaturalBoundary(buffer)) {
      return true;
    }

    return false;
  };

  return new NodeTransformStream<string, string>({
    start() {
      startTime = Date.now();
    },

    transform(token, controller) {
      // Record start time on first token
      if (tokenCount === 0) {
        startTime = Date.now();
      }

      buffer += token;
      tokenCount++;

      // Clear pending flush timeout
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }

      // Check if we should flush immediately
      if (shouldFlush()) {
        flushChunk(controller, false);
      } else {
        // Set delayed flush with aggressive timing for first chunk
        const delay = hasSentFirstChunk ? chunkDelayMs : firstChunkDelayMs;
        const currentMinSize = hasSentFirstChunk ? minChunkSize : firstChunkMinSize;

        flushTimeout = setTimeout(() => {
          if (buffer.length >= currentMinSize / 2) {
            flushChunk(controller, false);
          }
        }, delay);
      }
    },

    flush(controller) {
      // Clear any pending timeout
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }

      // Send remaining buffer
      if (buffer.length > 0) {
        flushChunk(controller, true);
      }

      // Log final metrics
      if (enableMetrics) {
        const totalDurationMs = Date.now() - startTime;
        const avgChunkLatencyMs =
          chunkLatencies.length > 0
            ? Math.round(chunkLatencies.reduce((a, b) => a + b, 0) / chunkLatencies.length)
            : 0;

        const metrics: StreamingTTSMetrics = {
          sessionId,
          firstChunkLatencyMs: firstChunkTime ? firstChunkTime - startTime : 0,
          totalChunks: chunkCount,
          avgChunkLatencyMs,
          tokensProcessed: tokenCount,
          totalDurationMs,
        };

        log.info(metrics, '📊 Streaming TTS metrics');

        // Record to global metrics
        recordStreamingMetrics(metrics);
      }
    },
  });
}

// ============================================================================
// GLOBAL METRICS
// ============================================================================

interface GlobalStreamingMetrics {
  totalSessions: number;
  avgFirstChunkLatencyMs: number;
  avgTotalChunks: number;
  minFirstChunkLatencyMs: number;
  maxFirstChunkLatencyMs: number;
  recentSessions: StreamingTTSMetrics[];
}

const globalMetrics: GlobalStreamingMetrics = {
  totalSessions: 0,
  avgFirstChunkLatencyMs: 0,
  avgTotalChunks: 0,
  minFirstChunkLatencyMs: Infinity,
  maxFirstChunkLatencyMs: 0,
  recentSessions: [],
};

const MAX_RECENT_SESSIONS = 100;

/**
 * Record metrics from a streaming session
 */
function recordStreamingMetrics(metrics: StreamingTTSMetrics): void {
  globalMetrics.totalSessions++;

  // Update averages using rolling average
  const n = globalMetrics.totalSessions;
  globalMetrics.avgFirstChunkLatencyMs =
    ((n - 1) * globalMetrics.avgFirstChunkLatencyMs + metrics.firstChunkLatencyMs) / n;
  globalMetrics.avgTotalChunks =
    ((n - 1) * globalMetrics.avgTotalChunks + metrics.totalChunks) / n;

  // Update min/max
  if (metrics.firstChunkLatencyMs < globalMetrics.minFirstChunkLatencyMs) {
    globalMetrics.minFirstChunkLatencyMs = metrics.firstChunkLatencyMs;
  }
  if (metrics.firstChunkLatencyMs > globalMetrics.maxFirstChunkLatencyMs) {
    globalMetrics.maxFirstChunkLatencyMs = metrics.firstChunkLatencyMs;
  }

  // Keep recent sessions
  globalMetrics.recentSessions.push(metrics);
  if (globalMetrics.recentSessions.length > MAX_RECENT_SESSIONS) {
    globalMetrics.recentSessions.shift();
  }
}

/**
 * Get global streaming metrics
 */
export function getStreamingTTSMetrics(): GlobalStreamingMetrics {
  return { ...globalMetrics };
}

/**
 * Reset global metrics (for testing)
 */
export function resetStreamingTTSMetrics(): void {
  globalMetrics.totalSessions = 0;
  globalMetrics.avgFirstChunkLatencyMs = 0;
  globalMetrics.avgTotalChunks = 0;
  globalMetrics.minFirstChunkLatencyMs = Infinity;
  globalMetrics.maxFirstChunkLatencyMs = 0;
  globalMetrics.recentSessions = [];
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Check if streaming TTS optimization is enabled
 */
export function isStreamingTTSEnabled(): boolean {
  return process.env.STREAMING_TTS_ENABLED !== 'false';
}

/**
 * Get optimized streaming config based on context
 */
export function getOptimizedStreamingConfig(context?: {
  isFirstTurn?: boolean;
  isHighPriority?: boolean;
  personaId?: string;
  sessionId?: string;
}): StreamingTTSConfig {
  const config: StreamingTTSConfig = {
    sessionId: context?.sessionId,
    enableMetrics: true,
  };

  // AGGRESSIVE settings for first turn (user is waiting - first impression matters!)
  if (context?.isFirstTurn) {
    config.firstChunkMinSize = 6; // Was 10 - even faster greeting
    config.firstChunkDelayMs = 8; // Was 15 - minimal delay
    config.minChunkSize = 15; // Was default - smaller chunks
    config.maxChunkSize = 80; // Prevent long waits
  }

  // VERY aggressive for high priority (time-sensitive situations)
  if (context?.isHighPriority) {
    config.firstChunkMinSize = 5; // Was 8 - near-instant
    config.firstChunkDelayMs = 5; // Was 10 - minimal
    config.minChunkSize = 12;
    config.maxChunkSize = 60;
  }

  return config;
}

export default {
  createStreamingTTSTransform,
  getStreamingTTSMetrics,
  resetStreamingTTSMetrics,
  isStreamingTTSEnabled,
  getOptimizedStreamingConfig,
};
