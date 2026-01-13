/**
 * Stream Processing State Machine
 *
 * Replaces boolean flags and chunk counting with proper state machine.
 * Handles JSON detection, tool execution, and output coordination.
 *
 * DESIGN PRINCIPLES:
 * 1. Explicit states - no ambiguous boolean combinations
 * 2. Clean transitions - each state knows what triggers exit
 * 3. Buffer management - intelligent, not time-based
 * 4. Coordination with SpeechCoordinator
 *
 * @module speech/coordination/stream-state-machine
 */
/** Stream processing states */
export declare enum StreamState {
    /** Normal streaming - pass through text */
    NORMAL = "normal",
    /** Detected possible JSON start - buffering */
    BUFFERING_JSON = "buffering_json",
    /** JSON detected, tool executing - suppress output */
    EXECUTING_TOOL = "executing_tool",
    /** Tool complete, waiting for sentence boundary before resuming */
    AWAITING_BOUNDARY = "awaiting_boundary",
    /** Detected leakage pattern - suppressing until boundary */
    SUPPRESSING_LEAKAGE = "suppressing_leakage"
}
/** Events that trigger state transitions */
export declare enum StreamEvent {
    /** Regular text chunk received */
    TEXT_CHUNK = "text_chunk",
    /** JSON start pattern detected */
    JSON_START = "json_start",
    /** Complete JSON detected */
    JSON_COMPLETE = "json_complete",
    /** JSON accumulation failed (not valid JSON) */
    JSON_INVALID = "json_invalid",
    /** Tool execution started */
    TOOL_STARTED = "tool_started",
    /** Tool execution completed */
    TOOL_COMPLETED = "tool_completed",
    /** Sentence boundary detected (.!?) */
    SENTENCE_BOUNDARY = "sentence_boundary",
    /** Leakage pattern detected */
    LEAKAGE_DETECTED = "leakage_detected",
    /** Buffer size limit reached */
    BUFFER_LIMIT = "buffer_limit",
    /** Stream flush requested */
    FLUSH = "flush"
}
/** Context for state transitions */
export interface StreamContext {
    /** Current buffer contents */
    buffer: string;
    /** Pending tool execution promise */
    toolPromise: Promise<unknown> | null;
    /** Tool ID if executing */
    toolId: string | null;
    /** Chunks accumulated while executing */
    pendingChunks: string[];
    /** Timestamp when entered current state */
    stateEnteredAt: number;
    /** Parsed JSON waiting for transition */
    pendingJson: {
        fn: string;
        args: Record<string, unknown>;
    } | null;
}
/** State machine configuration */
export interface StateMachineConfig {
    /** Maximum buffer size before forcing emit/decision */
    maxBufferSize: number;
    /** Maximum time in BUFFERING_JSON before giving up (ms) */
    jsonBufferTimeoutMs: number;
    /** Patterns that indicate JSON start */
    jsonStartPatterns: RegExp[];
    /** Patterns that indicate leakage */
    leakagePatterns: RegExp[];
}
/** Transition result */
export interface TransitionResult {
    /** New state after transition */
    newState: StreamState;
    /** Text to emit (if any) */
    emit: string | null;
    /** Whether to suppress this chunk */
    suppress: boolean;
    /** Whether tool execution should start */
    executeTool: {
        fn: string;
        args: Record<string, unknown>;
    } | null;
}
/**
 * Stream processing state machine.
 * Manages state transitions and buffer handling intelligently.
 */
export declare class StreamStateMachine {
    private state;
    private context;
    private config;
    private transitionCount;
    constructor(config?: Partial<StateMachineConfig>);
    /**
     * Process incoming chunk and return action
     */
    processChunk(chunk: string): TransitionResult;
    /**
     * Signal tool execution started
     */
    toolStarted(toolId: string, promise: Promise<unknown>): void;
    /**
     * Signal tool execution completed
     */
    toolCompleted(): void;
    /**
     * Flush remaining buffer (end of stream)
     */
    flush(): TransitionResult;
    /**
     * Get current state
     */
    getState(): StreamState;
    /**
     * Get current context (for debugging)
     */
    getContext(): Readonly<StreamContext>;
    /**
     * Reset state machine
     */
    reset(): void;
    private detectEvent;
    private transition;
    private executeTransition;
    private transitionFromNormal;
    private transitionFromBufferingJson;
    private handleInvalidJson;
    private transitionFromExecutingTool;
    private transitionFromAwaitingBoundary;
    private transitionFromSuppressingLeakage;
    private createEmptyContext;
    private looksLikeJsonStart;
    private isLeakagePattern;
    private hasSentenceBoundary;
    private tryParseJson;
}
/**
 * Create a new stream state machine
 */
export declare function createStreamStateMachine(config?: Partial<StateMachineConfig>): StreamStateMachine;
//# sourceMappingURL=stream-state-machine.d.ts.map