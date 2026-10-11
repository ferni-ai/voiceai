/**
 * When the call's entry ends the job with ctx.shutdown (the multi-agent end of
 * call does, after cleanup), the executor leaves the room straight away instead
 * of idling 30 s for a 'close' that fired before anyone listened for it.
 */
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
let entry: (ctx: { shutdown: (reason: string) => void }) => Promise<void> = async () => undefined;

class FakeRoom extends EventEmitter {
  isConnected = true;
  remoteParticipants = new Map<string, unknown>([['caller', {}]]);
  disconnect = vi.fn(async () => {
    order.push('room.disconnect');
    this.isConnected = false;
  });
}

vi.mock('@livekit/rtc-node', () => ({
  Room: FakeRoom,
  RoomEvent: new Proxy({}, { get: (_t, key) => String(key) }),
  TrackKind: { KIND_AUDIO: 1 },
}));
vi.mock('@livekit/agents', () => ({
  JobProcess: class {},
  runWithJobContextAsync: (_ctx: unknown, fn: () => Promise<void>) => fn(),
  JobContext: class {
    constructor(
      _proc: unknown,
      _info: unknown,
      public room: FakeRoom,
      _onConnect: () => void,
      private onShutdown: (reason: string) => void
    ) {}
    shutdown(reason: string): void {
      this.onShutdown(reason);
    }
  },
}));
vi.mock('../../core/inference-executor.js', () => ({ InProcessInferenceExecutor: class {} }));
vi.mock('../../after-call-register.js', () => ({}));
vi.mock('../../voice-agent-entry/index.js', () => ({
  runFullVoiceAgentEntry: (ctx: { shutdown: (reason: string) => void }) => entry(ctx),
}));

const { runJobInProcess } = await import('../job-executor.js');

const info = {
  job: { id: 'job-1', room: { name: 'room-1' } },
  url: 'wss://example',
  token: 't',
  acceptArgs: { name: 'agent', identity: 'agent', metadata: '' },
} as never;

beforeEach(() => {
  vi.useFakeTimers();
  order.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('runJobInProcess after ctx.shutdown', () => {
  it('disconnects as soon as the entry returns, with its cleanup first', async () => {
    entry = async (ctx) => {
      order.push('wait.ended');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });
      order.push('cleanup');
      ctx.shutdown('timeout');
    };
    let done = false;
    const job = runJobInProcess(info, () => undefined).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(done).toBe(true);
    expect(order).toEqual(['wait.ended', 'cleanup', 'room.disconnect']);
    await job;
  });

  it('without a shutdown, still waits for the room to close (up to 30 s)', async () => {
    entry = async () => undefined;
    let done = false;
    const job = runJobInProcess(info, () => undefined).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(done).toBe(true);
    await job;
  });
});
