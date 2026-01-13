/**
 * Event Sequencer
 *
 * Ensures handoff events are processed in the correct order.
 * Handles out-of-order delivery by buffering and reordering.
 *
 * Event sequence:
 * 1. handoff_acknowledged (seq: N)
 * 2. handoff_started (seq: N+1)
 * 3. soft_open_complete (seq: N+2)
 * 4. handoff_complete OR handoff_failed (seq: N+3)
 *
 * @module handoff/event-sequencer
 */
/**
 * Handoff event types in order.
 */
export type HandoffEventType = 'handoff_acknowledged' | 'handoff_started' | 'soft_open_complete' | 'handoff_progress' | 'handoff_complete' | 'handoff_failed' | 'handoff_cancelled';
/**
 * Sequenced handoff event.
 */
export interface SequencedEvent {
    type: HandoffEventType;
    seq: number;
    handoffId: string;
    timestamp: number;
    data: Record<string, unknown>;
}
/**
 * Event handler callback.
 */
export type EventHandler = (event: SequencedEvent) => void | Promise<void>;
/**
 * Sequencer state.
 */
export interface SequencerState {
    lastProcessedSeq: number;
    bufferedEvents: Map<number, SequencedEvent>;
    currentHandoffId: string | null;
    handlers: Map<HandoffEventType, EventHandler[]>;
}
/**
 * Expected event order for a successful handoff.
 */
export declare const EVENT_ORDER: readonly HandoffEventType[];
/**
 * Terminal events that end a handoff.
 */
export declare const TERMINAL_EVENTS: readonly HandoffEventType[];
/**
 * Get expected previous event for a given event type.
 */
export declare function getExpectedPreviousEvent(eventType: HandoffEventType): HandoffEventType | null;
/**
 * Check if an event is terminal (ends the handoff).
 */
export declare function isTerminalEvent(eventType: HandoffEventType): boolean;
/**
 * Event Sequencer
 *
 * Buffers and reorders handoff events to ensure correct processing order.
 *
 * @example
 * ```typescript
 * const sequencer = new EventSequencer('session-123');
 *
 * sequencer.on('handoff_started', (event) => {
 *   console.log('Handoff started:', event.data);
 * });
 *
 * sequencer.on('handoff_complete', (event) => {
 *   console.log('Handoff complete:', event.data);
 * });
 *
 * // Events can arrive out of order - sequencer handles it
 * sequencer.receive(completeEvent);  // Buffered
 * sequencer.receive(startedEvent);   // Processed, then complete is processed
 * ```
 */
export declare class EventSequencer {
    private sessionId;
    private lastProcessedSeq;
    private buffer;
    private currentHandoffId;
    private handlers;
    private maxBufferSize;
    private bufferTimeoutMs;
    private bufferTimeouts;
    constructor(sessionId: string, options?: {
        maxBufferSize?: number;
        bufferTimeoutMs?: number;
    });
    /**
     * Register a handler for an event type.
     */
    on(eventType: HandoffEventType, handler: EventHandler): () => void;
    /**
     * Receive an event and process it (or buffer if out of order).
     */
    receive(event: SequencedEvent): Promise<void>;
    /**
     * Process an event and call handlers.
     */
    private processEvent;
    /**
     * Buffer an out-of-order event.
     */
    private bufferEvent;
    /**
     * Drain buffer - process any events that are now in order.
     */
    private drainBuffer;
    /**
     * Force process a buffered event (on timeout).
     */
    private forceProcessBuffered;
    /**
     * Clear buffer timeout for a sequence number.
     */
    private clearBufferTimeout;
    /**
     * Reset sequencer for a new handoff.
     */
    reset(handoffId?: string): void;
    /**
     * Get current state for debugging.
     */
    getState(): SequencerState;
    /**
     * Dispose sequencer and clean up resources.
     */
    dispose(): void;
}
/**
 * Create a new event sequencer for a session.
 */
export declare function createEventSequencer(sessionId: string, options?: {
    maxBufferSize?: number;
    bufferTimeoutMs?: number;
}): EventSequencer;
/**
 * Generate monotonically increasing sequence numbers per session.
 */
export declare class SequenceGenerator {
    private sequences;
    /**
     * Get next sequence number for a session.
     */
    next(sessionId: string): number;
    /**
     * Get current sequence number for a session (without incrementing).
     */
    current(sessionId: string): number;
    /**
     * Reset sequence for a session.
     */
    reset(sessionId: string): void;
}
/**
 * Global sequence generator instance.
 */
export declare const sequenceGenerator: SequenceGenerator;
export default EventSequencer;
//# sourceMappingURL=event-sequencer.d.ts.map