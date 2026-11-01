/**
 * The single-agent path must close its AgentSession when the call ends.
 * agents-js does not close it on job shutdown, and prod runs jobs in-process,
 * so a leaked session's STT stream reconnected every ~180 s, each time Cartesia
 * idle-closed it, until the pod restarted. A real AgentSession with a fake STT
 * that idle-closes on demand, ended with empty_room.
 */
import { EventEmitter } from 'node:events';
import { APIConnectionError, stt, voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runUntilCallEnds } from '../run-until-call-ends.js';

class IdleClosingStream extends stt.SpeechStream {
  label = 'idle-closing-stream';
  attempts = 0;
  private idleClose: (() => void) | null = null;

  /** What Cartesia does to an open socket that gets no audio. */
  simulateIdleClose(): void {
    this.idleClose?.();
  }

  get aborted(): boolean {
    return this.abortSignal.aborted;
  }

  protected async run(): Promise<void> {
    this.attempts += 1;
    if (this.abortSignal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      this.abortSignal.addEventListener('abort', () => resolve(), { once: true });
      this.idleClose = () => reject(new APIConnectionError({ message: '1001 Idle timeout' }));
    });
  }
}

class FakeSTT extends stt.STT {
  label = 'fake-stt';
  streams: IdleClosingStream[] = [];
  constructor() {
    super({ streaming: true, interimResults: true });
  }
  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('stream only');
  }
  stream(options?: { connOptions?: never }): IdleClosingStream {
    const s = new IdleClosingStream(this, undefined, options?.connOptions);
    this.streams.push(s);
    return s;
  }
}

function emptyRoomJob() {
  const room = Object.assign(new EventEmitter(), { isConnected: true, remoteParticipants: new Map() });
  return { room, shutdown: vi.fn(), addShutdownCallback: vi.fn() };
}

const sessions: voice.AgentSession[] = [];
afterEach(async () => {
  while (sessions.length) await sessions.pop()?.close();
});

describe('runUntilCallEnds (single-agent path)', () => {
  it('closes the session on empty_room, and the STT stream does not reconnect afterwards', async () => {
    const fakeStt = new FakeSTT();
    const session = new voice.AgentSession({
      stt: fakeStt,
      vad: null as never,
      turnHandling: { turnDetection: 'stt', interruption: { enabled: false } },
    } as never);
    sessions.push(session);
    await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
    await vi.waitFor(() => expect(fakeStt.streams[0]?.attempts).toBe(1));
    const stream = fakeStt.streams[0]!;

    const job = emptyRoomJob();
    const onDisconnect = vi.fn();
    const reason = await runUntilCallEnds({
      ctx: job as never,
      session,
      sessionId: 'test-session',
      onDisconnect,
      pollMs: 10,
      emptyRoomGraceMs: 20,
    });

    expect(reason).toBe('empty_room');
    expect(job.shutdown).toHaveBeenCalledWith('empty_room');
    expect(onDisconnect).toHaveBeenCalledWith('empty_room');
    expect(stream.aborted).toBe(true);

    stream.simulateIdleClose();
    await new Promise((r) => setTimeout(r, 400)); // first retry fires after 100 ms
    expect(stream.attempts).toBe(1);
    expect(fakeStt.streams).toHaveLength(1);
  }, 30_000);
});
