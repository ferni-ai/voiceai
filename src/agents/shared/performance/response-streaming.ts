/**
 * Response Streaming Service
 *
 * Enables early TTS generation before the full LLM response is ready.
 * Reduces perceived latency by starting speech synthesis on partial responses.
 *
 * Key Features:
 * - Sentence boundary detection for natural chunking
 * - Lookahead buffering for smoother playback
 * - Cancellation support for interruptions
 * - Latency metrics tracking
 *
 * @module ResponseStreaming
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ResponseStreaming' });

// ============================================================================
// TYPES
// ============================================================================

export interface StreamingConfig {
  /** Minimum characters before flushing to TTS (default: 50) */
  minChunkSize?: number;
  /** Maximum characters before forced flush (default: 200) */
  maxChunkSize?: number;
  /** Wait time for more tokens before flushing (default: 100ms) */
  flushDelayMs?: number;
  /** Enable lookahead buffering (default: true) */
  enableLookahead?: boolean;
  /** Lookahead buffer size in chunks (default: 2) */
  lookaheadSize?: number;
}

export interface StreamChunk {
  text: string;
  index: number;
  isFinal: boolean;
  timestamp: number;
  /** Time from first token to this chunk being ready */
  latencyMs: number;
}

export interface StreamMetrics {
  totalChunks: number;
  avgChunkLatencyMs: number;
  firstChunkLatencyMs: number;
  totalDurationMs: number;
  tokensProcessed: number;
  interruptionCount: number;
}

export type ChunkCallback = (chunk: StreamChunk) => void | Promise<void>;

// ============================================================================
// SENTENCE BOUNDARY DETECTION
// ============================================================================

/**
 * Sentence-ending patterns for natural chunking
 */
const SENTENCE_ENDINGS = /[.!?]+[\s]|[.!?]+$/;

/**
 * Phrase boundaries for mid-sentence breaks
 */
const PHRASE_BREAKS = /[,;:][\s]|—[\s]|\.{3}[\s]/;

/**
 * Check if text ends at a natural boundary
 */
function endsAtNaturalBoundary(text: string): boolean {
  return SENTENCE_ENDINGS.test(text) || PHRASE_BREAKS.test(text);
}

/**
 * Find the best split point in text
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

  // Fall back to max length
  if (text.length >= maxLength) {
    // Find last space before max
    const lastSpace = text.lastIndexOf(' ', maxLength);
    return lastSpace > minLength ? lastSpace + 1 : maxLength;
  }

  return -1; // Don't split yet
}

// ============================================================================
// RESPONSE STREAM PROCESSOR
// ============================================================================

/**
 * Process streaming LLM responses for early TTS synthesis
 *
 * @example
 * ```ts
 * const processor = new ResponseStreamProcessor({
 *   onChunk: async (chunk) => {
 *     await tts.synthesize(chunk.text);
 *   }
 * });
 *
 * // Feed tokens from LLM stream
 * for await (const token of llmStream) {
 *   processor.push(token);
 * }
 *
 * // Finalize
 * await processor.flush();
 * ```
 */
export class ResponseStreamProcessor {
  private buffer = '';
  private config: Required<StreamingConfig>;
  private onChunk: ChunkCallback;
  private chunkIndex = 0;
  private startTime = 0;
  private firstChunkTime = 0;
  private flushTimeout: NodeJS.Timeout | null = null;
  private isCancelled = false;
  private tokensProcessed = 0;
  private interruptionCount = 0;
  private chunkLatencies: number[] = [];

  constructor(
    onChunk: ChunkCallback,
    config: StreamingConfig = {}
  ) {
    this.onChunk = onChunk;
    this.config = {
      minChunkSize: config.minChunkSize ?? 50,
      maxChunkSize: config.maxChunkSize ?? 200,
      flushDelayMs: config.flushDelayMs ?? 100,
      enableLookahead: config.enableLookahead ?? true,
      lookaheadSize: config.lookaheadSize ?? 2,
    };
  }

  /**
   * Push a token to the buffer
   */
  push(token: string): void {
    if (this.isCancelled) return;

    // Record start time on first token
    if (this.startTime === 0) {
      this.startTime = Date.now();
    }

    this.buffer += token;
    this.tokensProcessed++;

    // Clear any pending flush timeout
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    // Check if we should flush
    if (this.shouldFlush()) {
      void this.flushChunk(false);
    } else {
      // Set a delayed flush in case no more tokens arrive
      this.flushTimeout = setTimeout(() => {
        if (this.buffer.length >= this.config.minChunkSize / 2) {
          void this.flushChunk(false);
        }
      }, this.config.flushDelayMs);
    }
  }

  /**
   * Check if buffer should be flushed
   */
  private shouldFlush(): boolean {
    // Force flush if over max size
    if (this.buffer.length >= this.config.maxChunkSize) {
      return true;
    }

    // Flush if at natural boundary and over min size
    if (
      this.buffer.length >= this.config.minChunkSize &&
      endsAtNaturalBoundary(this.buffer)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Flush current buffer as a chunk
   */
  private async flushChunk(isFinal: boolean): Promise<void> {
    if (this.isCancelled) return;
    if (this.buffer.length === 0 && !isFinal) return;

    const now = Date.now();

    // Find optimal split point
    let chunkText: string;
    if (isFinal || this.buffer.length <= this.config.maxChunkSize) {
      chunkText = this.buffer;
      this.buffer = '';
    } else {
      const splitAt = findSplitPoint(
        this.buffer,
        this.config.minChunkSize,
        this.config.maxChunkSize
      );

      if (splitAt > 0) {
        chunkText = this.buffer.slice(0, splitAt);
        this.buffer = this.buffer.slice(splitAt);
      } else {
        chunkText = this.buffer.slice(0, this.config.maxChunkSize);
        this.buffer = this.buffer.slice(this.config.maxChunkSize);
      }
    }

    if (chunkText.trim().length === 0) return;

    // Track first chunk latency
    if (this.chunkIndex === 0) {
      this.firstChunkTime = now;
    }

    const latencyMs = now - this.startTime;
    this.chunkLatencies.push(latencyMs);

    const chunk: StreamChunk = {
      text: chunkText.trim(),
      index: this.chunkIndex++,
      isFinal: isFinal && this.buffer.length === 0,
      timestamp: now,
      latencyMs,
    };

    try {
      await this.onChunk(chunk);
    } catch (error) {
      log.warn({ error: String(error), chunkIndex: chunk.index }, 'Chunk callback failed');
    }

    // If there's remaining buffer and we're finalizing, flush it too
    if (isFinal && this.buffer.length > 0) {
      await this.flushChunk(true);
    }
  }

  /**
   * Flush any remaining buffer and finalize
   */
  async flush(): Promise<StreamMetrics> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length > 0) {
      await this.flushChunk(true);
    }

    const totalDurationMs = this.startTime ? Date.now() - this.startTime : 0;
    const avgChunkLatencyMs =
      this.chunkLatencies.length > 0
        ? Math.round(
            this.chunkLatencies.reduce((a, b) => a + b, 0) / this.chunkLatencies.length
          )
        : 0;

    return {
      totalChunks: this.chunkIndex,
      avgChunkLatencyMs,
      firstChunkLatencyMs: this.firstChunkTime ? this.firstChunkTime - this.startTime : 0,
      totalDurationMs,
      tokensProcessed: this.tokensProcessed,
      interruptionCount: this.interruptionCount,
    };
  }

  /**
   * Cancel processing (user interruption)
   */
  cancel(): void {
    this.isCancelled = true;
    this.interruptionCount++;

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    this.buffer = '';
    log.debug({ chunkIndex: this.chunkIndex }, 'Stream processing cancelled');
  }

  /**
   * Reset for a new response
   */
  reset(): void {
    this.buffer = '';
    this.chunkIndex = 0;
    this.startTime = 0;
    this.firstChunkTime = 0;
    this.isCancelled = false;
    this.tokensProcessed = 0;
    this.chunkLatencies = [];

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }
}

// ============================================================================
// LOOKAHEAD BUFFER
// ============================================================================

/**
 * Lookahead buffer entry for tracking synthesis state
 */
interface LookaheadEntry<T> {
  chunk: StreamChunk;
  synthesized: T | null;
  synthesizing: Promise<T> | null;
  completed: boolean;
}

/**
 * Lookahead buffer for smoother TTS playback
 *
 * Pre-synthesizes upcoming chunks while current chunk is playing.
 */
export class LookaheadBuffer<T> {
  private buffer: Array<LookaheadEntry<T>> = [];
  private synthesizeFn: (text: string) => Promise<T>;
  private maxSize: number;

  constructor(
    synthesizeFn: (text: string) => Promise<T>,
    maxSize = 2
  ) {
    this.synthesizeFn = synthesizeFn;
    this.maxSize = maxSize;
  }

  /**
   * Add a chunk to the buffer
   */
  add(chunk: StreamChunk): void {
    // Start synthesizing immediately
    const synthesizingPromise = this.synthesizeFn(chunk.text);
    
    const entry: LookaheadEntry<T> = {
      chunk,
      synthesized: null,
      synthesizing: synthesizingPromise,
      completed: false,
    };

    synthesizingPromise
      .then((result) => {
        entry.synthesized = result;
        entry.completed = true;
      })
      .catch((error) => {
        log.warn({ error: String(error), chunkIndex: chunk.index }, 'Lookahead synthesis failed');
        entry.completed = true;
      });

    this.buffer.push(entry);

    // Trim if over max size
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get the next synthesized chunk (waits if still synthesizing)
   */
  async getNext(): Promise<{ chunk: StreamChunk; data: T } | null> {
    if (this.buffer.length === 0) return null;

    const entry = this.buffer.shift();
    if (!entry) return null;

    if (entry.synthesized !== null) {
      return { chunk: entry.chunk, data: entry.synthesized };
    }

    if (entry.synthesizing && !entry.completed) {
      try {
        const synthesizing = entry.synthesizing;
        const data = await synthesizing;
        return { chunk: entry.chunk, data };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Check if buffer has items
   */
  hasNext(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }
}

// ============================================================================
// STREAMING SESSION MANAGER
// ============================================================================

interface StreamingSession {
  processor: ResponseStreamProcessor;
  startTime: number;
  metrics: StreamMetrics | null;
}

const activeSessions = new Map<string, StreamingSession>();

/**
 * Create a streaming session for a conversation
 */
export function createStreamingSession(
  sessionId: string,
  onChunk: ChunkCallback,
  config?: StreamingConfig
): ResponseStreamProcessor {
  const processor = new ResponseStreamProcessor(onChunk, config);

  activeSessions.set(sessionId, {
    processor,
    startTime: Date.now(),
    metrics: null,
  });

  return processor;
}

/**
 * Get an active streaming session
 */
export function getStreamingSession(sessionId: string): ResponseStreamProcessor | null {
  return activeSessions.get(sessionId)?.processor ?? null;
}

/**
 * End a streaming session and get metrics
 */
export async function endStreamingSession(sessionId: string): Promise<StreamMetrics | null> {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  const metrics = await session.processor.flush();
  session.metrics = metrics;
  activeSessions.delete(sessionId);

  log.debug({
    sessionId,
    totalChunks: metrics.totalChunks,
    firstChunkLatencyMs: metrics.firstChunkLatencyMs,
    avgChunkLatencyMs: metrics.avgChunkLatencyMs,
  }, '🎤 Streaming session ended');

  return metrics;
}

/**
 * Cancel a streaming session (user interruption)
 */
export function cancelStreamingSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.processor.cancel();
    activeSessions.delete(sessionId);
    log.debug({ sessionId }, 'Streaming session cancelled');
  }
}

