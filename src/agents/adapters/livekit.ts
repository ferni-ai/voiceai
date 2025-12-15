/**
 * LiveKit Room Adapter
 *
 * Wraps LiveKit Room with clean interface for the agent architecture.
 * Provides abstraction over room connection, data channels, and events.
 *
 * @module agents/adapters/livekit
 */

import type { JobContext } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { RoomConnectionError } from '../core/errors.js';
import { type Result, err, ok, tryAsync } from '../core/result.js';
import type { Logger, ParticipantAdapter, RoomAdapter } from '../core/types.js';

// ============================================================================
// LIVEKIT ROOM ADAPTER
// ============================================================================

/**
 * LiveKit room adapter implementation.
 */
export class LiveKitRoomAdapter implements RoomAdapter {
  private readonly room: Room;
  private readonly ctx: JobContext;
  private connectionAttempt = 0;

  constructor(ctx: JobContext) {
    this.ctx = ctx;
    this.room = ctx.room;
  }

  get name(): string {
    return this.room.name || 'unknown';
  }

  get isConnected(): boolean {
    return this.room.isConnected;
  }

  get localParticipant(): ParticipantAdapter | null {
    const lp = this.room.localParticipant;
    if (!lp) return null;

    return {
      identity: lp.identity,
      name: lp.name || lp.identity,
      metadata: lp.metadata || '',
    };
  }

  /**
   * Connect to the room with retry logic.
   */
  async connect(): Promise<void> {
    this.connectionAttempt++;
    await this.ctx.connect();
  }

  /**
   * Disconnect from the room.
   */
  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }

  /**
   * Publish data to all participants via data channel.
   */
  async publishData(data: Uint8Array, options: { reliable: boolean }): Promise<void> {
    const lp = this.room.localParticipant;
    if (!lp) {
      throw new Error('Cannot publish data: not connected');
    }
    await lp.publishData(data, { reliable: options.reliable });
  }

  /**
   * Subscribe to room events.
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    // LiveKit uses camelCase for event names
    this.room.on(event as never, handler as never);
  }

  /**
   * Unsubscribe from room events.
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.room.off(event as never, handler as never);
  }

  // ============================================================================
  // EXTENDED METHODS
  // ============================================================================

  /**
   * Wait for first participant to join.
   */
  async waitForParticipant(timeoutMs: number = 30000): Promise<ParticipantAdapter | null> {
    const participant = await Promise.race([
      this.ctx.waitForParticipant(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!participant) return null;

    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      metadata: participant.metadata || '',
    };
  }

  /**
   * Get remote participants.
   */
  getRemoteParticipants(): ParticipantAdapter[] {
    const participants: ParticipantAdapter[] = [];

    for (const [, participant] of this.room.remoteParticipants) {
      participants.push({
        identity: participant.identity,
        name: participant.name || participant.identity,
        metadata: participant.metadata || '',
      });
    }

    return participants;
  }

  /**
   * Send JSON data to frontend.
   */
  async sendJson(type: string, payload: Record<string, unknown>): Promise<void> {
    const data = JSON.stringify({ type, ...payload });
    await this.publishData(new TextEncoder().encode(data), { reliable: true });
  }

  /**
   * Get underlying room for advanced operations.
   * Use sparingly - prefer adapter methods.
   */
  getUnderlyingRoom(): Room {
    return this.room;
  }

  /**
   * Get job context for advanced operations.
   */
  getJobContext(): JobContext {
    return this.ctx;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a LiveKit room adapter from job context.
 */
export function createLiveKitAdapter(ctx: JobContext): LiveKitRoomAdapter {
  return new LiveKitRoomAdapter(ctx);
}

/**
 * Connect to room with Result type error handling.
 */
export async function connectToRoom(
  adapter: LiveKitRoomAdapter,
  logger: Logger,
  options: { maxAttempts?: number; timeoutMs?: number } = {}
): Promise<Result<void, RoomConnectionError>> {
  const { maxAttempts = 3, timeoutMs = 30000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.debug(`Connecting to room (attempt ${attempt}/${maxAttempts})`);

    const result = await tryAsync(
      async () => {
        await Promise.race([
          adapter.connect(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Connection timeout after ${timeoutMs}ms`)),
              timeoutMs
            )
          ),
        ]);
      },
      (e) => new RoomConnectionError(adapter.name, attempt, e instanceof Error ? e : undefined)
    );

    if (result.ok) {
      logger.info(`Connected to room "${adapter.name}"`);
      return ok(undefined);
    }

    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.warn(`Connection failed, retrying in ${delay}ms`, { error: result.error.message });
      await sleep(delay);
    } else {
      return err(result.error);
    }
  }

  return err(new RoomConnectionError(adapter.name, maxAttempts));
}

// ============================================================================
// MOCK ADAPTER (Testing)
// ============================================================================

/**
 * Mock room adapter for testing.
 */
export class MockRoomAdapter implements RoomAdapter {
  private connected = false;
  private eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();

  name = 'mock-room';
  localParticipant: ParticipantAdapter | null = {
    identity: 'mock-agent',
    name: 'Mock Agent',
    metadata: '{}',
  };

  public publishedData: Array<{ data: Uint8Array; reliable: boolean }> = [];
  public sentJson: Array<{ type: string; payload: Record<string, unknown> }> = [];

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
  }

  async publishData(data: Uint8Array, options: { reliable: boolean }): Promise<void> {
    this.publishedData.push({ data, reliable: options.reliable });
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // Test helpers
  emit(event: string, ...args: unknown[]): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(...args));
  }

  simulateDisconnect(reason: string = 'test'): void {
    this.connected = false;
    this.emit('disconnected', reason);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
