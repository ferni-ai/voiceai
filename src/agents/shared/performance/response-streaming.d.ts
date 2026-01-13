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
export interface StreamingConfig {
    /**
     * Minimum characters before flushing to TTS
     * PERFORMANCE: Reduced from 50 to 20 for faster first audio
     * @default 20
     */
    minChunkSize?: number;
    /**
     * Maximum characters before forced flush
     * @default 150
     */
    maxChunkSize?: number;
    /**
     * Wait time for more tokens before flushing
     * PERFORMANCE: Reduced from 100ms to 40ms for snappier responses
     * @default 40
     */
    flushDelayMs?: number;
    /** Enable lookahead buffering (default: true) */
    enableLookahead?: boolean;
    /** Lookahead buffer size in chunks (default: 3) */
    lookaheadSize?: number;
    /**
     * Enable speculative TTS synthesis on partial sentences
     * @default true
     */
    enableSpeculativeSynthesis?: boolean;
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
export declare class ResponseStreamProcessor {
    private buffer;
    private config;
    private onChunk;
    private chunkIndex;
    private startTime;
    private firstChunkTime;
    private flushTimeout;
    private isCancelled;
    private tokensProcessed;
    private interruptionCount;
    private chunkLatencies;
    /** Track if we've sent at least one chunk (for aggressive first-chunk behavior) */
    private hasSentFirstChunk;
    constructor(onChunk: ChunkCallback, config?: StreamingConfig);
    /**
     * Push a token to the buffer
     */
    push(token: string): void;
    /**
     * Check if buffer should be flushed
     */
    private shouldFlush;
    /**
     * Flush current buffer as a chunk
     */
    private flushChunk;
    /**
     * Flush any remaining buffer and finalize
     */
    flush(): Promise<StreamMetrics>;
    /**
     * Cancel processing (user interruption)
     */
    cancel(): void;
    /**
     * Reset for a new response
     */
    reset(): void;
}
/**
 * Lookahead buffer for smoother TTS playback
 *
 * Pre-synthesizes upcoming chunks while current chunk is playing.
 */
export declare class LookaheadBuffer<T> {
    private buffer;
    private synthesizeFn;
    private maxSize;
    constructor(synthesizeFn: (text: string) => Promise<T>, maxSize?: number);
    /**
     * Add a chunk to the buffer
     */
    add(chunk: StreamChunk): void;
    /**
     * Get the next synthesized chunk (waits if still synthesizing)
     */
    getNext(): Promise<{
        chunk: StreamChunk;
        data: T;
    } | null>;
    /**
     * Check if buffer has items
     */
    hasNext(): boolean;
    /**
     * Clear the buffer
     */
    clear(): void;
}
/**
 * Create a streaming session for a conversation
 */
export declare function createStreamingSession(sessionId: string, onChunk: ChunkCallback, config?: StreamingConfig): ResponseStreamProcessor;
/**
 * Get an active streaming session
 */
export declare function getStreamingSession(sessionId: string): ResponseStreamProcessor | null;
/**
 * End a streaming session and get metrics
 */
export declare function endStreamingSession(sessionId: string): Promise<StreamMetrics | null>;
/**
 * Cancel a streaming session (user interruption)
 */
export declare function cancelStreamingSession(sessionId: string): void;
//# sourceMappingURL=response-streaming.d.ts.map