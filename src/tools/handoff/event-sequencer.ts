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

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handoff event types in order.
 */
export type HandoffEventType =
  | 'handoff_acknowledged'
  | 'handoff_started'
  | 'soft_open_complete'
  | 'handoff_progress'
  | 'handoff_complete'
  | 'handoff_failed'
  | 'handoff_cancelled';

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

// ============================================================================
// EVENT ORDER DEFINITION
// ============================================================================

/**
 * Expected event order for a successful handoff.
 */
export const EVENT_ORDER: readonly HandoffEventType[] = [
  'handoff_acknowledged',
  'handoff_started',
  'soft_open_complete',
  'handoff_complete',
] as const;

/**
 * Terminal events that end a handoff.
 */
export const TERMINAL_EVENTS: readonly HandoffEventType[] = [
  'handoff_complete',
  'handoff_failed',
  'handoff_cancelled',
] as const;

/**
 * Get expected previous event for a given event type.
 */
export function getExpectedPreviousEvent(eventType: HandoffEventType): HandoffEventType | null {
  const index = EVENT_ORDER.indexOf(eventType);
  if (index <= 0) return null;
  return EVENT_ORDER[index - 1];
}

/**
 * Check if an event is terminal (ends the handoff).
 */
export function isTerminalEvent(eventType: HandoffEventType): boolean {
  return TERMINAL_EVENTS.includes(eventType);
}

// ============================================================================
// EVENT SEQUENCER CLASS
// ============================================================================

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
export class EventSequencer {
  private sessionId: string;
  private lastProcessedSeq: number = -1;
  private buffer: Map<number, SequencedEvent> = new Map();
  private currentHandoffId: string | null = null;
  private handlers: Map<HandoffEventType, EventHandler[]> = new Map();
  private maxBufferSize: number = 20;
  private bufferTimeoutMs: number = 5000;
  private bufferTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();

  constructor(sessionId: string, options?: { maxBufferSize?: number; bufferTimeoutMs?: number }) {
    this.sessionId = sessionId;
    if (options?.maxBufferSize) this.maxBufferSize = options.maxBufferSize;
    if (options?.bufferTimeoutMs) this.bufferTimeoutMs = options.bufferTimeoutMs;

    log.debug(
      { sessionId, maxBufferSize: this.maxBufferSize, bufferTimeoutMs: this.bufferTimeoutMs },
      '📬 Created event sequencer'
    );
  }

  /**
   * Register a handler for an event type.
   */
  on(eventType: HandoffEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Receive an event and process it (or buffer if out of order).
   */
  async receive(event: SequencedEvent): Promise<void> {
    log.debug(
      {
        sessionId: this.sessionId,
        type: event.type,
        seq: event.seq,
        lastProcessed: this.lastProcessedSeq,
        handoffId: event.handoffId,
      },
      '📥 Received event'
    );

    // New handoff starting - reset state
    if (event.type === 'handoff_acknowledged' || event.type === 'handoff_started') {
      if (this.currentHandoffId !== event.handoffId) {
        this.reset(event.handoffId);
      }
    }

    // Check if this is the next expected event
    if (event.seq === this.lastProcessedSeq + 1) {
      await this.processEvent(event);
      await this.drainBuffer();
    } else if (event.seq > this.lastProcessedSeq + 1) {
      // Future event - buffer it
      this.bufferEvent(event);
    } else {
      // Old event - ignore (already processed or duplicate)
      log.warn(
        {
          sessionId: this.sessionId,
          type: event.type,
          seq: event.seq,
          lastProcessed: this.lastProcessedSeq,
        },
        '⚠️ Ignoring old/duplicate event'
      );
    }
  }

  /**
   * Process an event and call handlers.
   */
  private async processEvent(event: SequencedEvent): Promise<void> {
    log.debug(
      { sessionId: this.sessionId, type: event.type, seq: event.seq },
      '⚡ Processing event'
    );

    this.lastProcessedSeq = event.seq;

    // Call handlers
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        log.error(
          { sessionId: this.sessionId, type: event.type, error: String(err) },
          '❌ Event handler error'
        );
      }
    }

    // If terminal event, reset for next handoff
    if (isTerminalEvent(event.type)) {
      log.debug(
        { sessionId: this.sessionId, type: event.type },
        '🏁 Terminal event - handoff complete'
      );
    }
  }

  /**
   * Buffer an out-of-order event.
   */
  private bufferEvent(event: SequencedEvent): void {
    // Check buffer size limit
    if (this.buffer.size >= this.maxBufferSize) {
      log.warn(
        { sessionId: this.sessionId, bufferSize: this.buffer.size },
        '⚠️ Event buffer full - dropping oldest'
      );
      // Remove oldest buffered event
      const oldestSeq = Math.min(...this.buffer.keys());
      this.clearBufferTimeout(oldestSeq);
      this.buffer.delete(oldestSeq);
    }

    this.buffer.set(event.seq, event);

    // Set timeout to process buffered event even if gap not filled
    const timeout = setTimeout(() => {
      if (this.buffer.has(event.seq)) {
        log.warn(
          { sessionId: this.sessionId, type: event.type, seq: event.seq },
          '⏰ Buffer timeout - processing despite gap'
        );
        this.forceProcessBuffered(event.seq);
      }
    }, this.bufferTimeoutMs);

    this.bufferTimeouts.set(event.seq, timeout);

    log.debug(
      {
        sessionId: this.sessionId,
        type: event.type,
        seq: event.seq,
        bufferSize: this.buffer.size,
        gap: event.seq - this.lastProcessedSeq - 1,
      },
      '📦 Buffered out-of-order event'
    );
  }

  /**
   * Drain buffer - process any events that are now in order.
   */
  private async drainBuffer(): Promise<void> {
    let nextSeq = this.lastProcessedSeq + 1;

    while (this.buffer.has(nextSeq)) {
      const event = this.buffer.get(nextSeq)!;
      this.clearBufferTimeout(nextSeq);
      this.buffer.delete(nextSeq);
      await this.processEvent(event);
      nextSeq = this.lastProcessedSeq + 1;
    }

    if (this.buffer.size > 0) {
      log.debug(
        {
          sessionId: this.sessionId,
          remainingBuffered: this.buffer.size,
          nextExpected: nextSeq,
          bufferedSeqs: Array.from(this.buffer.keys()),
        },
        '📦 Buffer partially drained'
      );
    }
  }

  /**
   * Force process a buffered event (on timeout).
   */
  private async forceProcessBuffered(seq: number): Promise<void> {
    const event = this.buffer.get(seq);
    if (!event) return;

    this.clearBufferTimeout(seq);
    this.buffer.delete(seq);

    // Skip sequence numbers up to this event
    log.warn(
      {
        sessionId: this.sessionId,
        skippedFrom: this.lastProcessedSeq + 1,
        skippedTo: seq - 1,
      },
      '⚠️ Skipping missing events due to timeout'
    );

    this.lastProcessedSeq = seq - 1;
    await this.processEvent(event);
    await this.drainBuffer();
  }

  /**
   * Clear buffer timeout for a sequence number.
   */
  private clearBufferTimeout(seq: number): void {
    const timeout = this.bufferTimeouts.get(seq);
    if (timeout) {
      clearTimeout(timeout);
      this.bufferTimeouts.delete(seq);
    }
  }

  /**
   * Reset sequencer for a new handoff.
   */
  reset(handoffId?: string): void {
    // Clear all timeouts
    for (const timeout of this.bufferTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.bufferTimeouts.clear();

    // Clear buffer
    this.buffer.clear();

    // Reset sequence counter
    this.lastProcessedSeq = -1;

    // Update handoff ID
    if (handoffId) {
      this.currentHandoffId = handoffId;
    }

    log.debug({ sessionId: this.sessionId, handoffId }, '🔄 Sequencer reset');
  }

  /**
   * Get current state for debugging.
   */
  getState(): SequencerState {
    return {
      lastProcessedSeq: this.lastProcessedSeq,
      bufferedEvents: new Map(this.buffer),
      currentHandoffId: this.currentHandoffId,
      handlers: new Map(
        Array.from(this.handlers.entries()).map(([type, handlers]) => [type, [...handlers]])
      ),
    };
  }

  /**
   * Dispose sequencer and clean up resources.
   */
  dispose(): void {
    // Clear all timeouts
    for (const timeout of this.bufferTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.bufferTimeouts.clear();
    this.buffer.clear();
    this.handlers.clear();

    log.debug({ sessionId: this.sessionId }, '🗑️ Sequencer disposed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new event sequencer for a session.
 */
export function createEventSequencer(
  sessionId: string,
  options?: { maxBufferSize?: number; bufferTimeoutMs?: number }
): EventSequencer {
  return new EventSequencer(sessionId, options);
}

// ============================================================================
// SEQUENCE NUMBER GENERATOR
// ============================================================================

/**
 * Generate monotonically increasing sequence numbers per session.
 */
export class SequenceGenerator {
  private sequences: Map<string, number> = new Map();

  /**
   * Get next sequence number for a session.
   */
  next(sessionId: string): number {
    const current = this.sequences.get(sessionId) || 0;
    const next = current + 1;
    this.sequences.set(sessionId, next);
    return next;
  }

  /**
   * Get current sequence number for a session (without incrementing).
   */
  current(sessionId: string): number {
    return this.sequences.get(sessionId) || 0;
  }

  /**
   * Reset sequence for a session.
   */
  reset(sessionId: string): void {
    this.sequences.delete(sessionId);
  }
}

/**
 * Global sequence generator instance.
 */
export const sequenceGenerator = new SequenceGenerator();

// ============================================================================
// EXPORTS
// ============================================================================

export default EventSequencer;
