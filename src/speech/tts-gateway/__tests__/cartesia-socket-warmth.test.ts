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

function harness(warmth?: SocketWarmth, { refuse = false } = {}) {
  const sockets: FakeSocket[] = [];
  const cartesia = new CartesiaSocket(
    () => 'wss://test',
    1000,
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      void Promise.resolve().then(() =>
        refuse ? s.emit('error', new Error('refused')) : s.accept()
      );
      return s as unknown as SocketLike;
    },
    warmth,
    () => Date.now()
  );
  return { cartesia, sockets };
}

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
    const { cartesia, sockets } = harness(WARMTH);
    await cartesia.send('a', {}, noop);
    // From now on every open is refused.
    const refusing = harness(WARMTH, { refuse: true });
    Object.assign(cartesia, {
      createSocket: (refusing.cartesia as unknown as { createSocket: unknown }).createSocket,
    });
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // attempt 1
    expect(refusing.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // still backing off (200 ms)
    expect(refusing.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(WARMTH.reopenDelayMs); // attempt 2
    expect(refusing.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refusing.sockets).toHaveLength(2);
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
