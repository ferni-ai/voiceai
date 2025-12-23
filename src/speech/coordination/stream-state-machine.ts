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
export enum StreamState {
  /** Normal streaming - pass through text */
  NORMAL = 'normal',
  /** Detected possible JSON start - buffering */
  BUFFERING_JSON = 'buffering_json',
  /** JSON detected, tool executing - suppress output */
  EXECUTING_TOOL = 'executing_tool',
  /** Tool complete, waiting for sentence boundary before resuming */
  AWAITING_BOUNDARY = 'awaiting_boundary',
  /** Detected leakage pattern - suppressing until boundary */
  SUPPRESSING_LEAKAGE = 'suppressing_leakage',
}

/** Events that trigger state transitions */
export enum StreamEvent {
  /** Regular text chunk received */
  TEXT_CHUNK = 'text_chunk',
  /** JSON start pattern detected */
  JSON_START = 'json_start',
  /** Complete JSON detected */
  JSON_COMPLETE = 'json_complete',
  /** JSON accumulation failed (not valid JSON) */
  JSON_INVALID = 'json_invalid',
  /** Tool execution started */
  TOOL_STARTED = 'tool_started',
  /** Tool execution completed */
  TOOL_COMPLETED = 'tool_completed',
  /** Sentence boundary detected (.!?) */
  SENTENCE_BOUNDARY = 'sentence_boundary',
  /** Leakage pattern detected */
  LEAKAGE_DETECTED = 'leakage_detected',
  /** Buffer size limit reached */
  BUFFER_LIMIT = 'buffer_limit',
  /** Stream flush requested */
  FLUSH = 'flush',
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
  pendingJson: { fn: string; args: Record<string, unknown> } | null;
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
  executeTool: { fn: string; args: Record<string, unknown> } | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: StateMachineConfig = {
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
  private state: StreamState = StreamState.NORMAL;
  private context: StreamContext;
  private config: StateMachineConfig;
  private transitionCount = 0;

  constructor(config?: Partial<StateMachineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = this.createEmptyContext();
  }

  /**
   * Process incoming chunk and return action
   */
  processChunk(chunk: string): TransitionResult {
    // Append to buffer
    this.context.buffer += chunk;

    // Determine event based on current state and content
    const event = this.detectEvent(chunk);

    // Execute transition
    const result = this.transition(event, chunk);

    log.debug(
      {
        state: this.state,
        event,
        bufferLen: this.context.buffer.length,
        emit: result.emit?.substring(0, 30),
        suppress: result.suppress,
      },
      'State machine processed chunk'
    );

    return result;
  }

  /**
   * Signal tool execution started
   */
  toolStarted(toolId: string, promise: Promise<unknown>): void {
    this.context.toolId = toolId;
    this.context.toolPromise = promise;
    this.transition(StreamEvent.TOOL_STARTED);
  }

  /**
   * Signal tool execution completed
   */
  toolCompleted(): void {
    this.context.toolId = null;
    this.context.toolPromise = null;
    this.transition(StreamEvent.TOOL_COMPLETED);
  }

  /**
   * Flush remaining buffer (end of stream)
   */
  flush(): TransitionResult {
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
  getState(): StreamState {
    return this.state;
  }

  /**
   * Get current context (for debugging)
   */
  getContext(): Readonly<StreamContext> {
    return { ...this.context };
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = StreamState.NORMAL;
    this.context = this.createEmptyContext();
    this.transitionCount = 0;
  }

  // ============================================================================
  // PRIVATE: Event Detection
  // ============================================================================

  private detectEvent(chunk: string): StreamEvent {
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

  private transition(event: StreamEvent, chunk?: string): TransitionResult {
    this.transitionCount++;
    const oldState = this.state;

    // State transition table
    const result = this.executeTransition(event, chunk);

    if (this.state !== oldState) {
      log.debug(
        {
          from: oldState,
          to: this.state,
          event,
          transitionCount: this.transitionCount,
        },
        'State transition'
      );
      this.context.stateEnteredAt = Date.now();
    }

    return result;
  }

  private executeTransition(event: StreamEvent, chunk?: string): TransitionResult {
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

  private transitionFromNormal(event: StreamEvent): TransitionResult {
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

  private transitionFromBufferingJson(event: StreamEvent): TransitionResult {
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

  private handleInvalidJson(): TransitionResult {
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

  private transitionFromExecutingTool(event: StreamEvent, chunk?: string): TransitionResult {
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

  private transitionFromAwaitingBoundary(event: StreamEvent): TransitionResult {
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

  private transitionFromSuppressingLeakage(event: StreamEvent): TransitionResult {
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

  private createEmptyContext(): StreamContext {
    return {
      buffer: '',
      toolPromise: null,
      toolId: null,
      pendingChunks: [],
      stateEnteredAt: Date.now(),
      pendingJson: null,
    };
  }

  private looksLikeJsonStart(text: string): boolean {
    return this.config.jsonStartPatterns.some((p) => p.test(text));
  }

  private isLeakagePattern(text: string): boolean {
    return this.config.leakagePatterns.some((p) => p.test(text));
  }

  private hasSentenceBoundary(chunk: string): boolean {
    return /[.!?]/.test(chunk);
  }

  private tryParseJson(text: string): { fn: string; args: Record<string, unknown> } | null {
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
      if (jsonStart === -1) return null;

      // Find matching closing brace (accounting for nesting)
      let depth = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < clean.length; i++) {
        if (clean[i] === '{') depth++;
        if (clean[i] === '}') depth--;
        if (depth === 0) {
          jsonEnd = i;
          break;
        }
      }
      if (jsonEnd === -1) return null;

      const jsonStr = clean.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr) as { fn?: string; args?: Record<string, unknown> };

      // Validate it's our expected format
      if (
        typeof parsed.fn === 'string' &&
        typeof parsed.args === 'object' &&
        parsed.args !== null
      ) {
        return { fn: parsed.fn, args: parsed.args };
      }
      return null;
    } catch {
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
export function createStreamStateMachine(config?: Partial<StateMachineConfig>): StreamStateMachine {
  return new StreamStateMachine(config);
}
