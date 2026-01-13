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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'stream-state-machine' });
// ============================================================================
// TYPES
// ============================================================================
/** Stream processing states */
export var StreamState;
(function (StreamState) {
    /** Normal streaming - pass through text */
    StreamState["NORMAL"] = "normal";
    /** Detected possible JSON start - buffering */
    StreamState["BUFFERING_JSON"] = "buffering_json";
    /** JSON detected, tool executing - suppress output */
    StreamState["EXECUTING_TOOL"] = "executing_tool";
    /** Tool complete, waiting for sentence boundary before resuming */
    StreamState["AWAITING_BOUNDARY"] = "awaiting_boundary";
    /** Detected leakage pattern - suppressing until boundary */
    StreamState["SUPPRESSING_LEAKAGE"] = "suppressing_leakage";
})(StreamState || (StreamState = {}));
/** Events that trigger state transitions */
export var StreamEvent;
(function (StreamEvent) {
    /** Regular text chunk received */
    StreamEvent["TEXT_CHUNK"] = "text_chunk";
    /** JSON start pattern detected */
    StreamEvent["JSON_START"] = "json_start";
    /** Complete JSON detected */
    StreamEvent["JSON_COMPLETE"] = "json_complete";
    /** JSON accumulation failed (not valid JSON) */
    StreamEvent["JSON_INVALID"] = "json_invalid";
    /** Tool execution started */
    StreamEvent["TOOL_STARTED"] = "tool_started";
    /** Tool execution completed */
    StreamEvent["TOOL_COMPLETED"] = "tool_completed";
    /** Sentence boundary detected (.!?) */
    StreamEvent["SENTENCE_BOUNDARY"] = "sentence_boundary";
    /** Leakage pattern detected */
    StreamEvent["LEAKAGE_DETECTED"] = "leakage_detected";
    /** Buffer size limit reached */
    StreamEvent["BUFFER_LIMIT"] = "buffer_limit";
    /** Stream flush requested */
    StreamEvent["FLUSH"] = "flush";
})(StreamEvent || (StreamEvent = {}));
// ============================================================================
// DEFAULT CONFIG
// ============================================================================
const DEFAULT_CONFIG = {
    maxBufferSize: 500,
    jsonBufferTimeoutMs: 2000,
    jsonStartPatterns: [
        /^\s*\{?\s*["']?\s*$/, // Just opening brace
        /^\s*```json/i, // Markdown code fence
        /^\s*\{\s*"fn"/i, // Our JSON format start
    ],
    leakagePatterns: [
        /\[INTERNAL[:\s]/i,
        /\[SITUATION:/i,
        /\[DO:/i,
        /\[TOOL RESULT:/i,
        /\[TOPIC SHIFT:/i,
        /\[TASK GUIDANCE\]/i,
        /do not read this/i,
        /respond naturally/i,
    ],
};
// ============================================================================
// STATE MACHINE
// ============================================================================
/**
 * Stream processing state machine.
 * Manages state transitions and buffer handling intelligently.
 */
export class StreamStateMachine {
    state = StreamState.NORMAL;
    context;
    config;
    transitionCount = 0;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.context = this.createEmptyContext();
    }
    /**
     * Process incoming chunk and return action
     */
    processChunk(chunk) {
        // Append to buffer
        this.context.buffer += chunk;
        // Determine event based on current state and content
        const event = this.detectEvent(chunk);
        // Execute transition
        const result = this.transition(event, chunk);
        log.debug({
            state: this.state,
            event,
            bufferLen: this.context.buffer.length,
            emit: result.emit?.substring(0, 30),
            suppress: result.suppress,
        }, 'State machine processed chunk');
        return result;
    }
    /**
     * Signal tool execution started
     */
    toolStarted(toolId, promise) {
        this.context.toolId = toolId;
        this.context.toolPromise = promise;
        this.transition(StreamEvent.TOOL_STARTED);
    }
    /**
     * Signal tool execution completed
     */
    toolCompleted() {
        this.context.toolId = null;
        this.context.toolPromise = null;
        this.transition(StreamEvent.TOOL_COMPLETED);
    }
    /**
     * Flush remaining buffer (end of stream)
     */
    flush() {
        const result = this.transition(StreamEvent.FLUSH);
        // Emit any remaining buffer if in normal state
        if (this.state === StreamState.NORMAL && this.context.buffer) {
            return {
                ...result,
                emit: this.context.buffer,
            };
        }
        return result;
    }
    /**
     * Get current state
     */
    getState() {
        return this.state;
    }
    /**
     * Get current context (for debugging)
     */
    getContext() {
        return { ...this.context };
    }
    /**
     * Reset state machine
     */
    reset() {
        this.state = StreamState.NORMAL;
        this.context = this.createEmptyContext();
        this.transitionCount = 0;
    }
    // ============================================================================
    // PRIVATE: Event Detection
    // ============================================================================
    detectEvent(chunk) {
        const buffer = this.context.buffer;
        const trimmed = buffer.trim();
        // Check for sentence boundary
        if (this.hasSentenceBoundary(chunk)) {
            return StreamEvent.SENTENCE_BOUNDARY;
        }
        // State-specific event detection
        switch (this.state) {
            case StreamState.NORMAL:
                // Check for JSON - could be start or complete in one chunk
                if (this.looksLikeJsonStart(trimmed)) {
                    // Check if it's COMPLETE JSON in one chunk
                    const jsonResult = this.tryParseJson(buffer);
                    if (jsonResult) {
                        // Store parsed result for transition to use
                        this.context.pendingJson = jsonResult;
                        return StreamEvent.JSON_COMPLETE;
                    }
                    return StreamEvent.JSON_START;
                }
                // Check for leakage
                if (this.isLeakagePattern(buffer)) {
                    return StreamEvent.LEAKAGE_DETECTED;
                }
                return StreamEvent.TEXT_CHUNK;
            case StreamState.BUFFERING_JSON:
                // Check if we have complete JSON
                const jsonResult = this.tryParseJson(buffer);
                if (jsonResult) {
                    this.context.pendingJson = jsonResult;
                    return StreamEvent.JSON_COMPLETE;
                }
                // Check if buffer too large (probably not JSON)
                if (buffer.length > this.config.maxBufferSize) {
                    return StreamEvent.BUFFER_LIMIT;
                }
                // Check for timeout
                if (Date.now() - this.context.stateEnteredAt > this.config.jsonBufferTimeoutMs) {
                    return StreamEvent.JSON_INVALID;
                }
                return StreamEvent.TEXT_CHUNK;
            case StreamState.EXECUTING_TOOL:
                // Just accumulate while tool runs
                return StreamEvent.TEXT_CHUNK;
            case StreamState.AWAITING_BOUNDARY:
            case StreamState.SUPPRESSING_LEAKAGE:
                // Wait for sentence boundary
                return StreamEvent.TEXT_CHUNK;
            default:
                return StreamEvent.TEXT_CHUNK;
        }
    }
    // ============================================================================
    // PRIVATE: State Transitions
    // ============================================================================
    transition(event, chunk) {
        this.transitionCount++;
        const oldState = this.state;
        // State transition table
        const result = this.executeTransition(event, chunk);
        if (this.state !== oldState) {
            log.debug({
                from: oldState,
                to: this.state,
                event,
                transitionCount: this.transitionCount,
            }, 'State transition');
            this.context.stateEnteredAt = Date.now();
        }
        return result;
    }
    executeTransition(event, chunk) {
        switch (this.state) {
            case StreamState.NORMAL:
                return this.transitionFromNormal(event);
            case StreamState.BUFFERING_JSON:
                return this.transitionFromBufferingJson(event);
            case StreamState.EXECUTING_TOOL:
                return this.transitionFromExecutingTool(event, chunk);
            case StreamState.AWAITING_BOUNDARY:
                return this.transitionFromAwaitingBoundary(event);
            case StreamState.SUPPRESSING_LEAKAGE:
                return this.transitionFromSuppressingLeakage(event);
            default:
                return { newState: this.state, emit: null, suppress: false, executeTool: null };
        }
    }
    transitionFromNormal(event) {
        switch (event) {
            case StreamEvent.JSON_COMPLETE:
                // Complete JSON detected in a single chunk - skip buffering
                const parsed = this.context.pendingJson;
                if (parsed) {
                    this.state = StreamState.EXECUTING_TOOL;
                    this.context.buffer = '';
                    this.context.pendingJson = null;
                    return {
                        newState: this.state,
                        emit: null,
                        suppress: true,
                        executeTool: parsed,
                    };
                }
                // Fall back to buffering if somehow no pending JSON
                this.state = StreamState.BUFFERING_JSON;
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            case StreamEvent.JSON_START:
                this.state = StreamState.BUFFERING_JSON;
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            case StreamEvent.LEAKAGE_DETECTED:
                this.state = StreamState.SUPPRESSING_LEAKAGE;
                this.context.buffer = '';
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            case StreamEvent.TEXT_CHUNK:
                // Emit buffer if large enough
                if (this.context.buffer.length > 100) {
                    const toEmit = this.context.buffer;
                    this.context.buffer = '';
                    return { newState: this.state, emit: toEmit, suppress: false, executeTool: null };
                }
                return { newState: this.state, emit: null, suppress: false, executeTool: null };
            default:
                return { newState: this.state, emit: null, suppress: false, executeTool: null };
        }
    }
    transitionFromBufferingJson(event) {
        switch (event) {
            case StreamEvent.JSON_COMPLETE:
                // Use pre-parsed JSON from detectEvent
                const parsed = this.context.pendingJson;
                if (parsed) {
                    this.state = StreamState.EXECUTING_TOOL;
                    this.context.buffer = '';
                    this.context.pendingJson = null;
                    return {
                        newState: this.state,
                        emit: null,
                        suppress: true,
                        executeTool: parsed,
                    };
                }
                // Fall through to invalid if no pending JSON
                return this.handleInvalidJson();
            case StreamEvent.JSON_INVALID:
            case StreamEvent.BUFFER_LIMIT:
                return this.handleInvalidJson();
            case StreamEvent.TEXT_CHUNK:
                // Keep buffering
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            default:
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
        }
    }
    handleInvalidJson() {
        // Not valid JSON - check if it's leakage
        if (this.isLeakagePattern(this.context.buffer)) {
            this.state = StreamState.SUPPRESSING_LEAKAGE;
            this.context.buffer = '';
            return { newState: this.state, emit: null, suppress: true, executeTool: null };
        }
        // Not JSON, not leakage - emit the buffer
        const toEmit = this.context.buffer;
        this.context.buffer = '';
        this.state = StreamState.NORMAL;
        return { newState: this.state, emit: toEmit, suppress: false, executeTool: null };
    }
    transitionFromExecutingTool(event, chunk) {
        switch (event) {
            case StreamEvent.TOOL_COMPLETED:
                this.state = StreamState.AWAITING_BOUNDARY;
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            case StreamEvent.TEXT_CHUNK:
                // Accumulate chunks while tool runs
                if (chunk) {
                    this.context.pendingChunks.push(chunk);
                }
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
            default:
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
        }
    }
    transitionFromAwaitingBoundary(event) {
        switch (event) {
            case StreamEvent.SENTENCE_BOUNDARY:
                // Clear pending chunks and return to normal
                this.context.pendingChunks = [];
                this.context.buffer = '';
                this.state = StreamState.NORMAL;
                return { newState: this.state, emit: null, suppress: false, executeTool: null };
            default:
                // Keep suppressing
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
        }
    }
    transitionFromSuppressingLeakage(event) {
        switch (event) {
            case StreamEvent.SENTENCE_BOUNDARY:
                this.context.buffer = '';
                this.state = StreamState.NORMAL;
                return { newState: this.state, emit: null, suppress: false, executeTool: null };
            default:
                return { newState: this.state, emit: null, suppress: true, executeTool: null };
        }
    }
    // ============================================================================
    // PRIVATE: Helpers
    // ============================================================================
    createEmptyContext() {
        return {
            buffer: '',
            toolPromise: null,
            toolId: null,
            pendingChunks: [],
            stateEnteredAt: Date.now(),
            pendingJson: null,
        };
    }
    looksLikeJsonStart(text) {
        return this.config.jsonStartPatterns.some((p) => p.test(text));
    }
    isLeakagePattern(text) {
        return this.config.leakagePatterns.some((p) => p.test(text));
    }
    hasSentenceBoundary(chunk) {
        return /[.!?]/.test(chunk);
    }
    tryParseJson(text) {
        // Strip markdown code fences
        let clean = text;
        const markdownMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/i);
        if (markdownMatch) {
            clean = markdownMatch[1];
        }
        // Try to parse the full JSON directly
        // Our format: {"fn":"name","args":{...}}
        try {
            // Find first complete JSON object in the text
            const jsonStart = clean.indexOf('{');
            if (jsonStart === -1)
                return null;
            // Find matching closing brace (accounting for nesting)
            let depth = 0;
            let jsonEnd = -1;
            for (let i = jsonStart; i < clean.length; i++) {
                if (clean[i] === '{')
                    depth++;
                if (clean[i] === '}')
                    depth--;
                if (depth === 0) {
                    jsonEnd = i;
                    break;
                }
            }
            if (jsonEnd === -1)
                return null;
            const jsonStr = clean.slice(jsonStart, jsonEnd + 1);
            const parsed = JSON.parse(jsonStr);
            // Validate it's our expected format
            if (typeof parsed.fn === 'string' &&
                typeof parsed.args === 'object' &&
                parsed.args !== null) {
                return { fn: parsed.fn, args: parsed.args };
            }
            return null;
        }
        catch {
            return null;
        }
    }
}
// ============================================================================
// FACTORY
// ============================================================================
/**
 * Create a new stream state machine
 */
export function createStreamStateMachine(config) {
    return new StreamStateMachine(config);
}
//# sourceMappingURL=stream-state-machine.js.map