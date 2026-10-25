import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CartesiaSocket,
  type ContextHandler,
  type SocketLike,
  type SocketWarmth,
} from '../providers/cartesia-socket.js';

const WARMTH: SocketWarmth = {
  idleWindowMs: 60_000,
  pingEveryMs: 1_000,
  reopenDelayMs: 100,
  maxReopenDelayMs: 1_000,
  maxReopenAttempts: 2,
};

class FakeSocket extends EventEmitter {
  readyState = 0;
  pings = 0;
  terminated = false;
  send() {}
  close(code?: number) {
    this.readyState = 3;
    this.emit('close', code);
  }
  ping() {
    this.pings += 1;
  }
  terminate() {
    this.terminated = true;
    this.close(1006);
  }
  accept() {
    this.readyState = 1;
    this.emit('open');
  }
}

const noop: ContextHandler = { onChunk() {}, onDone() {}, onError() {} };

/** What Cartesia does with the next socket opened; tests change it mid-run. */
type OpenOutcome = 'accept' | 'refuse' | 'accept-then-close';

function harness(warmth?: SocketWarmth) {
  const sockets: FakeSocket[] = [];
  const server: { outcome: OpenOutcome } = { outcome: 'accept' };
  const createSocket = (): SocketLike => {
    const s = new FakeSocket();
    sockets.push(s);
    const { outcome } = server;
    void Promise.resolve().then(() => {
      if (outcome === 'refuse') {
        s.emit('error', new Error('refused'));
        return;
      }
      s.accept();
      if (outcome === 'accept-then-close') s.close(1008);
    });
    return s as unknown as SocketLike;
  };
  const cartesia = new CartesiaSocket(
    () => 'wss://test',
    1000,
    createSocket,
    warmth,
    () => Date.now()
  );
  return { cartesia, sockets, server };
}

/** Cartesia answered on this socket, so it is known to work. */
const answered = (s: FakeSocket): void => {
  s.emit('message', Buffer.from(JSON.stringify({ context_id: 'none', type: 'done' })));
};

describe('CartesiaSocket warmth (TTS_SOCKET_WARM)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('off: a dropped socket stays closed until the next reply opens it', async () => {
    const { cartesia, sockets } = harness(undefined);
    await cartesia.send('a', {}, noop);
    sockets[0].close(1000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].pings).toBe(0);
  });

  it('on: reopens a dropped socket in the background so the next reply finds it open', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    answered(sockets[0]);
    sockets[0].close(1000);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].readyState).toBe(1);

    await cartesia.send('b', {}, noop);
    expect(sockets).toHaveLength(2);
  });

  it('on: does not reopen once the socket has gone unused past the idle window', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    vi.setSystemTime(Date.now() + WARMTH.idleWindowMs + 1);
    sockets[0].close(1000);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs * 10);
    expect(sockets).toHaveLength(1);
  });

  it('on: pings while in use and drops a socket that misses a pong', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs);
    expect(sockets[0].pings).toBe(1);
    sockets[0].emit('pong');
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs);
    expect(sockets[0].pings).toBe(2);
    expect(sockets[0].terminated).toBe(false);

    // No pong this time: the next tick treats the socket as dead.
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs);
    expect(sockets[0].terminated).toBe(true);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].readyState).toBe(1);
  });

  it('on: fails the in-flight reply when a dead socket is dropped', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    const errors: Error[] = [];
    await cartesia.send('a', {}, { ...noop, onError: (e) => errors.push(e) });
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs * 2);
    expect(sockets[0].terminated).toBe(true);
    expect(errors[0]?.message).toMatch(/stopped answering/);
  });

  it('on: gives up after maxReopenAttempts failures, backing off between them', async () => {
    const { cartesia, sockets, server } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    answered(sockets[0]);
    server.outcome = 'refuse'; // from now on every open is refused
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // attempt 1
    expect(sockets).toHaveLength(1 + 1);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // still backing off (200 ms)
    expect(sockets).toHaveLength(1 + 1);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // attempt 2
    expect(sockets).toHaveLength(1 + 2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1 + 2);
  });

  it('on: caps the wait between reopen attempts at maxReopenDelayMs', async () => {
    const warmth = { ...WARMTH, maxReopenAttempts: 10, maxReopenDelayMs: 300 };
    const { cartesia, sockets, server } = harness(warmth);
    await cartesia.send('a', {}, noop);
    answered(sockets[0]);
    server.outcome = 'refuse';
    sockets[0].close(1006);
    // Uncapped, attempts 1-5 would land at 100, 300, 700, 1500 and 3100 ms.
    await vi.advanceTimersByTimeAsync(100 + 200 + 300 + 300 + 300);
    expect(sockets).toHaveLength(1 + 5);
  });

  it('on: a socket that opens and is closed at once backs off and stops (no reconnect storm)', async () => {
    const warmth = { ...WARMTH, maxReopenAttempts: 5, maxReopenDelayMs: 1_000 };
    const { cartesia, sockets, server } = harness(warmth);
    await cartesia.send('a', {}, noop);
    answered(sockets[0]);
    server.outcome = 'accept-then-close'; // e.g. a 1008 policy close right after the upgrade
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(warmth.idleWindowMs - 1);
    // One reopen per allowed attempt, not one every reopenDelayMs for the whole window.
    expect(sockets).toHaveLength(1 + warmth.maxReopenAttempts);
  });

  it('on: a reopened socket that proves healthy resets the failure count', async () => {
    const { cartesia, sockets, server } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    answered(sockets[0]);
    server.outcome = 'accept-then-close';
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // attempt 1 opens, then closes
    expect(sockets).toHaveLength(2);
    server.outcome = 'accept';
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs * 2); // attempt 2 holds
    expect(sockets).toHaveLength(3);
    sockets[2].emit('pong');
    // Healthy again: its next drop reopens after the base delay, not a backed-off one.
    sockets[2].close(1006);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs);
    expect(sockets).toHaveLength(4);
  });

  it('close() stops the ping and reopen timers and fails in-flight replies', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    const errors: Error[] = [];
    await cartesia.send('a', {}, { ...noop, onError: (e) => errors.push(e) });
    cartesia.close();
    expect(errors[0]?.message).toMatch(/closed by its owner/);
    expect(sockets[0].readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs * 5);
    expect(sockets[0].pings).toBe(0);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close() during a pending reopen cancels it', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    sockets[0].close(1006);
    cartesia.close();
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs * 10);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a refused background reopen is handled, not an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { cartesia, sockets, server } = harness(WARMTH);
      await cartesia.send('a', {}, noop);
      answered(sockets[0]);
      server.outcome = 'refuse';
      sockets[0].close(1006);
      await vi.advanceTimersByTimeAsync(5_000);
      vi.useRealTimers();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(sockets).toHaveLength(1 + WARMTH.maxReopenAttempts);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('stops pinging once the socket has gone unused past the idle window', async () => {
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    vi.setSystemTime(Date.now() + WARMTH.idleWindowMs + 1);
    await vi.advanceTimersByTimeAsync(WARMTH.pingEveryMs * 3);
    expect(sockets[0].pings).toBe(0);
    expect(sockets[0].terminated).toBe(false);
  });
});

describe('CartesiaTTSProvider reads TTS_SOCKET_WARM', () => {
  afterEach(() => vi.unstubAllEnvs());

  const warmthOf = async (): Promise<unknown> => {
    const { createCartesiaProvider } = await import('../providers/cartesia.js');
    const provider = createCartesiaProvider() as unknown as { socket: { warmth?: unknown } };
    return provider.socket.warmth;
  };

  it('keeps the socket cold-on-demand when the flag is off (the default)', async () => {
    vi.stubEnv('TTS_SOCKET_WARM', '');
    expect(await warmthOf()).toBeUndefined();
  });

  it('keeps the socket warm when the flag is on', async () => {
    vi.stubEnv('TTS_SOCKET_WARM', 'on');
    expect(await warmthOf()).toMatchObject({ pingEveryMs: 20_000, idleWindowMs: 600_000 });
  });
});
