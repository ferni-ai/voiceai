import { describe, expect, it } from 'vitest';
import type { ContextHandler } from '../providers/cartesia-socket.js';
import { CartesiaReplyStream, type ReplySocket } from '../providers/cartesia-reply-stream.js';

class FakeSocket implements ReplySocket {
  sent: Array<Record<string, unknown>> = [];
  handler: ContextHandler | null = null;
  cancelled: string[] = [];
  released: string[] = [];
  async send(_contextId: string, request: object, handler: ContextHandler) {
    this.sent.push(request as Record<string, unknown>);
    this.handler = handler;
  }
  cancel(contextId: string) {
    this.cancelled.push(contextId);
  }
  release(contextId: string) {
    this.released.push(contextId);
  }
}

const request = (transcript: string, more: boolean) => ({
  transcript,
  continue: more,
  model_id: 'm',
});
const tick = () => new Promise((r) => setTimeout(r, 0));

async function collect(stream: CartesiaReplyStream): Promise<number[]> {
  const sizes: number[] = [];
  for await (const pcm of stream) sizes.push(pcm.byteLength);
  return sizes;
}

describe('CartesiaReplyStream', () => {
  it('sends every piece of a reply on one context, then closes it', async () => {
    const socket = new FakeSocket();
    const reply = new CartesiaReplyStream(socket, request);
    reply.push('You caught me. ');
    reply.push('Guilty as charged.');
    reply.end();
    await tick();

    expect(socket.sent).toEqual([
      { transcript: 'You caught me. ', continue: true, model_id: 'm' },
      { transcript: 'Guilty as charged.', continue: true, model_id: 'm' },
      { transcript: '', continue: false, model_id: 'm' },
    ]);
  });

  it('yields audio as it arrives and ends when Cartesia is done', async () => {
    const socket = new FakeSocket();
    const reply = new CartesiaReplyStream(socket, request);
    reply.push('Hello there.');
    reply.end();
    const audio = collect(reply);
    await tick();
    socket.handler!.onChunk(new ArrayBuffer(8));
    socket.handler!.onChunk(new ArrayBuffer(4));
    socket.handler!.onDone();

    expect(await audio).toEqual([8, 4]);
    expect(socket.released).toEqual([reply.contextId]);
    expect(socket.cancelled).toEqual([]);
  });

  it('cancels the context when the listener stops reading (interruption)', async () => {
    const socket = new FakeSocket();
    const reply = new CartesiaReplyStream(socket, request);
    reply.push('A long answer that the user talks over.');
    await tick();
    socket.handler!.onChunk(new ArrayBuffer(8));
    socket.handler!.onChunk(new ArrayBuffer(8));

    for await (const _ of reply) break;

    expect(socket.cancelled).toEqual([reply.contextId]);
    reply.push('more text');
    await tick();
    expect(socket.sent).toHaveLength(1);
  });

  it('surfaces a context error to the reader', async () => {
    const socket = new FakeSocket();
    const reply = new CartesiaReplyStream(socket, request);
    reply.push('Hi.');
    const audio = collect(reply);
    await tick();
    socket.handler!.onError(new Error('invalid voice'));
    await expect(audio).rejects.toThrow('invalid voice');
  });

  it('fails a reply that stalls instead of hanging the turn', async () => {
    const socket = new FakeSocket();
    const reply = new CartesiaReplyStream(socket, request, 30);
    reply.push('Hi.');
    await expect(collect(reply)).rejects.toThrow(/stalled/);
    expect(socket.cancelled).toEqual([reply.contextId]);
  });
});
