/**
 * One Cartesia TTS WebSocket shared by every synthesis in the process.
 *
 * The gateway synthesizes each reply chunk separately. Opening a new socket per
 * chunk cost a TLS + upgrade handshake before any audio (400-900ms measured,
 * vs ~210ms first audio on an open socket). Cartesia multiplexes requests on
 * one socket by context_id, so this keeps one open and routes messages to the
 * synthesis that owns each context.
 *
 * Nothing reopened the socket after it dropped (a Cartesia idle close, a
 * network blip): the next reply paid the whole handshake inline, after the
 * LLM's first sentence was ready. Every reply that has to open the socket logs
 * TTS_SOCKET_COLD with the wait and why the socket was gone, so the 600-1,060 ms
 * first-byte outliers (#1546) can be matched to it. With `warmth` (TTS_SOCKET_WARM=on)
 * the socket is pinged while in use, a socket that stops answering pings is
 * dropped, and a dropped socket is reopened in the background while the
 * socket has been used recently.
 *
 * @module speech/tts-gateway/providers/cartesia-socket
 */

import { WebSocket } from 'ws';

import { registerInterval } from '../../../utils/interval-manager.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'CartesiaSocket' });

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
  on(event: 'close', listener: (code?: number) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'pong', listener: () => void): unknown;
  /** ws sockets have these; a socket without them is never pinged. */
  ping?(): void;
  terminate?(): void;
}

/** How the socket is kept open between replies (TTS_SOCKET_WARM). */
export interface SocketWarmth {
  /** Keep the socket warm only while it was used within this window. */
  idleWindowMs: number;
  /** Ping this often; a ping still unanswered at the next one drops the socket. */
  pingEveryMs: number;
  /** First wait before reopening a dropped socket; doubles per failed attempt. */
  reopenDelayMs: number;
  /** The longest wait between reopen attempts, however many have failed. */
  maxReopenDelayMs: number;
  /** Stop after this many reopen failures in a row (the next reply connects inline). */
  maxReopenAttempts: number;
}

export const DEFAULT_SOCKET_WARMTH: SocketWarmth = {
  idleWindowMs: 10 * 60_000,
  pingEveryMs: 20_000,
  reopenDelayMs: 250,
  maxReopenDelayMs: 5_000,
  maxReopenAttempts: 5,
};

/** Why a reply found no open socket: never opened, or opened and since dropped. */
interface DropRecord {
  at: number;
  idleMs: number;
  code?: number;
  reason: 'close' | 'error' | 'ping-timeout';
}

const OPEN = 1;
let socketCount = 0;

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
  private lastUse = 0;
  private lastDrop: DropRecord | null = null;
  private stopPing: (() => void) | null = null;
  private readonly pingName = `cartesia-tts-socket-ping-${++socketCount}`;
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Reopens in a row that did not give a healthy socket. Reset only once the
   * socket proves itself (a pong or a message from Cartesia), so a socket that
   * opens and is closed at once (a 1008 policy close) still backs off and stops.
   */
  private reopenFailures = 0;
  private healthy = false;
  private closed = false;

  constructor(
    private readonly url: () => string,
    private readonly openTimeoutMs: number,
    private readonly createSocket: (url: string) => SocketLike = (url) =>
      new WebSocket(url) as unknown as SocketLike,
    private readonly warmth?: SocketWarmth,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Open the socket if it isn't open (a prewarm). Concurrent callers share one
   * attempt. Counts as use, so a call that has started stays warm.
   */
  connect(): Promise<SocketLike> {
    this.lastUse = this.now();
    return this.ensureOpen();
  }

  private ensureOpen(): Promise<SocketLike> {
    if (this.socket && this.socket.readyState === OPEN) return Promise.resolve(this.socket);
    this.opening ??= this.open().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  /** Send a request for `contextId`; its messages go to `handler`. */
  async send(contextId: string, request: object, handler: ContextHandler): Promise<void> {
    this.lastUse = this.now();
    const socket = this.isOpen() ? this.socket! : await this.coldConnect();
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

  /**
   * Stop keeping the socket warm and close it: no ping or reopen timer
   * outlives the socket's owner (resetCartesiaProvider).
   */
  close(): void {
    this.closed = true;
    this.stopPinging();
    if (this.reopenTimer) clearTimeout(this.reopenTimer);
    this.reopenTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.failAll(new Error('Cartesia socket closed by its owner'));
    socket?.close();
  }

  private isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === OPEN;
  }

  /** Open the socket for a reply that is waiting on it, and say why it had to. */
  private async coldConnect(): Promise<SocketLike> {
    const started = this.now();
    const drop = this.lastDrop;
    const socket = await this.ensureOpen();
    log.info(
      {
        waitMs: this.now() - started,
        cause: drop ? 'dropped' : 'first',
        ...(drop && {
          dropReason: drop.reason,
          closeCode: drop.code,
          sinceDropMs: started - drop.at,
          idleBeforeDropMs: drop.idleMs,
        }),
        warm: this.warmth !== undefined,
      },
      'TTS_SOCKET_COLD'
    );
    return socket;
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
        if (this.closed) {
          socket.close();
          reject(new Error('Cartesia socket closed by its owner'));
          return;
        }
        this.socket = socket;
        this.healthy = false;
        this.startPinging(socket);
        resolve(socket);
      });
      socket.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => {
        if (this.socket === socket) this.provedHealthy();
        this.route(raw);
      });
      socket.on('close', (code?: number) =>
        this.dropped(socket, new Error('Cartesia WebSocket closed'), 'close', code)
      );
      socket.on('error', (error: Error) => this.dropped(socket, error, 'error'));
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

  private dropped(
    socket: SocketLike,
    error: Error,
    reason: DropRecord['reason'],
    code?: number
  ): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.stopPinging();
    const at = this.now();
    this.lastDrop = { at, idleMs: this.lastUse ? at - this.lastUse : 0, code, reason };
    this.failAll(error);
    // Dropped before it ever answered: count it as a failed reopen.
    if (!this.healthy) this.reopenFailures += 1;
    this.scheduleReopen();
  }

  private provedHealthy(): void {
    this.healthy = true;
    this.reopenFailures = 0;
  }

  private recentlyUsed(): boolean {
    return (
      this.warmth !== undefined &&
      this.lastUse > 0 &&
      this.now() - this.lastUse < this.warmth.idleWindowMs
    );
  }

  /** Ping while the socket is in use; a missed pong means the socket is dead. */
  private startPinging(socket: SocketLike): void {
    const warmth = this.warmth;
    if (!warmth || !socket.ping) return;
    this.stopPinging();
    let awaitingPong = false;
    socket.on('pong', () => {
      awaitingPong = false;
      if (this.socket === socket) this.provedHealthy();
    });
    this.stopPing = registerInterval(
      this.pingName,
      () => {
        if (this.socket !== socket || !this.recentlyUsed()) {
          this.stopPinging();
          return;
        }
        if (awaitingPong) {
          log.warn({ pingEveryMs: warmth.pingEveryMs }, 'Cartesia socket missed a pong; reopening');
          this.dropped(socket, new Error('Cartesia WebSocket stopped answering'), 'ping-timeout');
          (socket.terminate ?? socket.close).call(socket);
          return;
        }
        awaitingPong = true;
        try {
          socket.ping?.();
        } catch (error: unknown) {
          log.warn({ error: String(error) }, 'Cartesia socket ping failed');
        }
      },
      warmth.pingEveryMs
    );
  }

  private stopPinging(): void {
    this.stopPing?.();
    this.stopPing = null;
  }

  /** Reopen a dropped socket in the background, so the next reply finds it open. */
  private scheduleReopen(): void {
    const warmth = this.warmth;
    if (!warmth || this.closed || this.reopenTimer || !this.recentlyUsed()) return;
    if (this.reopenFailures >= warmth.maxReopenAttempts) return;
    const delay = Math.min(
      warmth.maxReopenDelayMs,
      warmth.reopenDelayMs * 2 ** this.reopenFailures
    );
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      if (this.closed || this.isOpen() || !this.recentlyUsed()) return;
      this.ensureOpen().catch((error: unknown) => {
        this.reopenFailures += 1;
        log.warn(
          { error: String(error), attempt: this.reopenFailures },
          'Cartesia socket reopen failed'
        );
        this.scheduleReopen();
      });
    }, delay);
    this.reopenTimer.unref?.();
  }

  private failAll(error: Error): void {
    const handlers = [...this.handlers.values()];
    this.handlers.clear();
    for (const handler of handlers) handler.onError(error);
  }
}
