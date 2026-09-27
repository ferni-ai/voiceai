/**
 * One Cartesia TTS WebSocket shared by every synthesis in the process.
 *
 * The gateway synthesizes each reply chunk separately. Opening a new socket per
 * chunk cost a TLS + upgrade handshake before any audio (400-900ms measured,
 * vs ~210ms first audio on an open socket). Cartesia multiplexes requests on
 * one socket by context_id, so this keeps one open and routes messages to the
 * synthesis that owns each context.
 *
 * @module speech/tts-gateway/providers/cartesia-socket
 */

import { WebSocket } from 'ws';

export interface ContextHandler {
  onChunk(pcm: ArrayBuffer): void;
  onDone(): void;
  onError(error: Error): void;
}

interface CartesiaMessage {
  type?: string;
  context_id?: string;
  data?: string;
  done?: boolean;
  error?: string;
  message?: string;
}

/** The slice of a ws WebSocket this class uses (tests pass a fake). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  once(event: 'open', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'message', listener: (raw: unknown) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

const OPEN = 1;

function decode(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  return Buffer.from(raw as ArrayBuffer).toString('utf8');
}

export class CartesiaSocket {
  private socket: SocketLike | null = null;
  private opening: Promise<SocketLike> | null = null;
  private readonly handlers = new Map<string, ContextHandler>();

  constructor(
    private readonly url: () => string,
    private readonly openTimeoutMs: number,
    private readonly createSocket: (url: string) => SocketLike = (url) =>
      new WebSocket(url) as unknown as SocketLike
  ) {}

  /** Open the socket if it isn't open. Concurrent callers share one attempt. */
  connect(): Promise<SocketLike> {
    if (this.socket && this.socket.readyState === OPEN) return Promise.resolve(this.socket);
    this.opening ??= this.open().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  /** Send a request for `contextId`; its messages go to `handler`. */
  async send(contextId: string, request: object, handler: ContextHandler): Promise<void> {
    const socket = await this.connect();
    this.handlers.set(contextId, handler);
    socket.send(JSON.stringify(request));
  }

  /** Stop generating for a context the caller no longer wants (e.g. interrupted). */
  cancel(contextId: string): void {
    if (!this.handlers.delete(contextId)) return;
    if (this.socket?.readyState === OPEN) {
      this.socket.send(JSON.stringify({ context_id: contextId, cancel: true }));
    }
  }

  release(contextId: string): void {
    this.handlers.delete(contextId);
  }

  private open(): Promise<SocketLike> {
    return new Promise<SocketLike>((resolve, reject) => {
      const socket = this.createSocket(this.url());
      const timer = setTimeout(() => {
        reject(new Error(`Cartesia WebSocket open timed out after ${this.openTimeoutMs}ms`));
        socket.close();
      }, this.openTimeoutMs);
      socket.once('open', () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve(socket);
      });
      socket.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => this.route(raw));
      socket.on('close', () => this.dropped(socket, new Error('Cartesia WebSocket closed')));
      socket.on('error', (error: Error) => this.dropped(socket, error));
    });
  }

  private route(raw: unknown): void {
    let message: CartesiaMessage;
    try {
      message = JSON.parse(decode(raw)) as CartesiaMessage;
    } catch {
      return;
    }
    const isError = message.type === 'error' || Boolean(message.error);
    const error = new Error(message.error || message.message || 'Cartesia WebSocket TTS error');
    const handler = message.context_id ? this.handlers.get(message.context_id) : undefined;

    if (!handler) {
      // An error that names no context is about the connection: fail everyone.
      if (isError && !message.context_id) this.failAll(error);
      return;
    }
    if (isError) {
      this.handlers.delete(message.context_id!);
      handler.onError(error);
      return;
    }
    if (message.type === 'chunk' && message.data) {
      const pcm = Buffer.from(message.data, 'base64');
      if (pcm.byteLength > 0) {
        handler.onChunk(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      }
    }
    if (message.type === 'done' || message.done === true) {
      this.handlers.delete(message.context_id!);
      handler.onDone();
    }
  }

  private dropped(socket: SocketLike, error: Error): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.failAll(error);
  }

  private failAll(error: Error): void {
    const handlers = [...this.handlers.values()];
    this.handlers.clear();
    for (const handler of handlers) handler.onError(error);
  }
}
