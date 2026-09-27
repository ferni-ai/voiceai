import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  CartesiaSocket,
  type ContextHandler,
  type SocketLike,
} from '../providers/cartesia-socket.js';

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  accept() {
    this.readyState = 1;
    this.emit('open');
  }
  reply(message: object) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const cartesia = new CartesiaSocket(
    () => 'wss://test',
    1000,
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      queueMicrotask(() => s.accept());
      return s as unknown as SocketLike;
    }
  );
  return { cartesia, sockets };
}

const handler = () => {
  const chunks: number[] = [];
  const h: ContextHandler & { chunks: number[]; done: boolean; error: Error | null } = {
    chunks,
    done: false,
    error: null,
    onChunk: (pcm) => chunks.push(pcm.byteLength),
    onDone: () => (h.done = true),
    onError: (e) => (h.error = e),
  };
  return h;
};

const pcm = (bytes: number) => Buffer.alloc(bytes).toString('base64');

describe('CartesiaSocket', () => {
  it('reuses one open socket for sequential requests', async () => {
    const { cartesia, sockets } = harness();
    const a = handler();
    await cartesia.send('ctx-a', { transcript: 'one' }, a);
    sockets[0].reply({ context_id: 'ctx-a', type: 'chunk', data: pcm(8) });
    sockets[0].reply({ context_id: 'ctx-a', type: 'done' });

    const b = handler();
    await cartesia.send('ctx-b', { transcript: 'two' }, b);
    sockets[0].reply({ context_id: 'ctx-b', type: 'chunk', data: pcm(4) });
    sockets[0].reply({ context_id: 'ctx-b', type: 'done' });

    expect(sockets).toHaveLength(1);
    expect(a).toMatchObject({ chunks: [8], done: true });
    expect(b).toMatchObject({ chunks: [4], done: true });
  });

  it('routes interleaved chunks to the context that asked for them', async () => {
    const { cartesia, sockets } = harness();
    const a = handler();
    const b = handler();
    await Promise.all([cartesia.send('ctx-a', {}, a), cartesia.send('ctx-b', {}, b)]);
    sockets[0].reply({ context_id: 'ctx-b', type: 'chunk', data: pcm(2) });
    sockets[0].reply({ context_id: 'ctx-a', type: 'chunk', data: pcm(6) });
    expect(sockets).toHaveLength(1);
    expect(a.chunks).toEqual([6]);
    expect(b.chunks).toEqual([2]);
  });

  it('cancels an abandoned context without closing the socket', async () => {
    const { cartesia, sockets } = harness();
    await cartesia.send('ctx-a', {}, handler());
    cartesia.cancel('ctx-a');
    expect(sockets[0].sent.at(-1)).toEqual({ context_id: 'ctx-a', cancel: true });
    expect(sockets[0].readyState).toBe(1);
  });

  it('fails in-flight contexts when the socket drops, then reconnects', async () => {
    const { cartesia, sockets } = harness();
    const a = handler();
    await cartesia.send('ctx-a', {}, a);
    sockets[0].close();
    expect(a.error?.message).toMatch(/closed/);

    await cartesia.send('ctx-b', {}, handler());
    expect(sockets).toHaveLength(2);
  });

  it('delivers a context error only to that context', async () => {
    const { cartesia, sockets } = harness();
    const a = handler();
    const b = handler();
    await cartesia.send('ctx-a', {}, a);
    await cartesia.send('ctx-b', {}, b);
    sockets[0].reply({ context_id: 'ctx-a', type: 'error', error: 'bad voice' });
    expect(a.error?.message).toBe('bad voice');
    expect(b.error).toBeNull();
  });

  it('shares a single open attempt between concurrent callers', async () => {
    const { cartesia, sockets } = harness();
    await Promise.all([cartesia.connect(), cartesia.connect(), cartesia.connect()]);
    expect(sockets).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
