/**
 * One Cartesia context for a whole spoken reply.
 *
 * The gateway used to synthesize each sentence as its own request. Every
 * sentence then started from a blank slate: the reply's emotion applied only to
 * the first one, the pitch and pace reset at each boundary, and each request
 * added its own leading and trailing silence (300-560ms gaps measured on a live
 * call). Cartesia's continuations keep one context open per utterance: text is
 * pushed with `continue: true` as the LLM produces it and closed with
 * `continue: false`, and the audio comes back as one continuous performance.
 *
 * @module speech/tts-gateway/providers/cartesia-reply-stream
 */

import { randomUUID } from 'node:crypto';

import type { ContextHandler } from './cartesia-socket.js';

/** The slice of CartesiaSocket a reply stream needs (tests pass a fake). */
export interface ReplySocket {
  send(contextId: string, request: object, handler: ContextHandler): Promise<void>;
  cancel(contextId: string): void;
  release(contextId: string): void;
}

/** A reply being voiced: push text as it arrives, read audio as it is generated. */
export interface ReplyStream extends AsyncIterable<ArrayBuffer> {
  /** Queue the next piece of the reply. Pieces are joined verbatim. */
  push(text: string): void;
  /** No more text is coming; audio ends once Cartesia finishes the reply. */
  end(): void;
  /** Stop generating (the user interrupted). Ends the audio immediately. */
  cancel(): void;
}

export class CartesiaReplyStream implements ReplyStream {
  readonly contextId = randomUUID();

  private readonly queue: ArrayBuffer[] = [];
  private sending: Promise<void> = Promise.resolve();
  private wake: (() => void) | null = null;
  private done = false;
  private ended = false;
  private error: Error | null = null;
  private lastActivity = Date.now();

  private readonly handler: ContextHandler = {
    onChunk: (pcm) => {
      this.queue.push(pcm);
      this.touch();
    },
    onDone: () => this.finish(),
    onError: (error) => this.finish(error),
  };

  /**
   * @param request - Builds the request body for one piece of text; must keep
   *   model, voice and output format identical across pieces of a context.
   * @param idleTimeoutMs - Fail if neither text nor audio moves for this long.
   */
  constructor(
    private readonly socket: ReplySocket,
    private readonly request: (transcript: string, more: boolean, contextId: string) => object,
    private readonly idleTimeoutMs = 30_000
  ) {}

  push(text: string): void {
    if (this.ended || this.done || !text) return;
    this.enqueueSend(text, true);
  }

  end(): void {
    if (this.ended || this.done) return;
    this.ended = true;
    this.enqueueSend('', false);
  }

  cancel(): void {
    if (this.done) return;
    this.ended = true;
    this.socket.cancel(this.contextId);
    this.finish();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ArrayBuffer> {
    try {
      while (true) {
        if (this.queue.length > 0) {
          yield this.queue.shift()!;
          continue;
        }
        if (this.error) throw this.error;
        if (this.done) return;
        const waited = await this.waitForActivity();
        if (!waited && Date.now() - this.lastActivity >= this.idleTimeoutMs) {
          throw new Error(`Cartesia reply stalled for ${this.idleTimeoutMs}ms`);
        }
      }
    } finally {
      // Consumer stopped early (interrupted or failed): stop Cartesia too.
      if (!this.done) this.cancel();
      else this.socket.release(this.contextId);
    }
  }

  private enqueueSend(transcript: string, more: boolean): void {
    this.touch();
    this.sending = this.sending
      .then(() =>
        this.socket.send(
          this.contextId,
          this.request(transcript, more, this.contextId),
          this.handler
        )
      )
      .catch((error: unknown) =>
        this.finish(error instanceof Error ? error : new Error(String(error)))
      );
  }

  private finish(error?: Error): void {
    if (this.done) return;
    this.done = true;
    if (error) this.error = error;
    this.touch();
  }

  private touch(): void {
    this.lastActivity = Date.now();
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  /** Resolves true when something happened, false after the idle timeout. */
  private waitForActivity(): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve(false);
      }, this.idleTimeoutMs);
      this.wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
  }
}
