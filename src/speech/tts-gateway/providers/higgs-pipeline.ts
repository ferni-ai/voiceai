/**
 * Higgs Pipeline TTS Provider
 *
 * ITTSProvider implementation for the Rust Higgs audio pipeline server.
 * Communicates over WebSocket with a binary+JSON protocol:
 *   - Binary frames = PCM audio (i16 LE, 24kHz mono)
 *   - Text frames = JSON control messages
 *
 * Supports both TTS (synthesize text → audio) and STT (stream audio → transcript).
 *
 * Env:
 *   TTS_PROVIDER=higgs-pipeline
 *   HIGGS_PIPELINE_URL=ws://localhost:8600/ws  (default)
 *
 * @module speech/tts-gateway/providers/higgs-pipeline
 */

import { WebSocket } from 'ws';
import type { ITTSProviderWithSTT, SSMLProsodyConfig, VoiceBiomarkers, TranscriptResult } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'HiggsPipelineProvider' });

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_WS_URL = 'ws://localhost:8600/ws';
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;
const SYNTHESIZE_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const WORDS_PER_MINUTE = 150;
const CHARS_PER_WORD = 5;

// ============================================================================
// TYPES
// ============================================================================

export interface HiggsPipelineConfig {
  /** WebSocket URL for the Rust pipeline server */
  serverUrl?: string;
  /** Delay before reconnection attempts in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Connection timeout in ms (default: 5000) */
  connectionTimeoutMs?: number;
  /** Persona name sent in start_session (default: 'ferni') */
  persona?: string;
}

// Re-export for consumers that import directly from this module
export type { TranscriptResult, VoiceBiomarkers } from '../types.js';

/** Messages sent to the Rust server */
type ClientMessage =
  | { type: 'start_session'; session_id: string; persona?: string }
  | { type: 'transcribe' }
  | { type: 'synthesize'; text: string; emotion?: string; intensity?: number; request_id?: number }
  | { type: 'synthesize_streaming'; text: string; emotion?: string; intensity?: number; chunk_steps?: number; request_id?: number }
  | { type: 'end_session' };

/** Messages received from the Rust server */
type ServerMessage =
  | { type: 'transcript'; text: string; biomarkers?: VoiceBiomarkers; latency_ms: number }
  | { type: 'audio_start'; sample_rate: number; request_id?: number }
  | { type: 'audio_done'; duration_ms: number; humanization?: Record<string, unknown>; request_id?: number }
  | { type: 'error'; code: string; message: string; request_id?: number };

/** Pending synthesize request awaiting audio_done */
interface PendingSynthesis {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (error: Error) => void;
  chunks: ArrayBuffer[];
  startMs: number;
  /** Called when a new audio chunk arrives (used by streaming mode) */
  onChunk?: () => void;
}

/** Pending transcription request */
interface PendingTranscription {
  resolve: (result: TranscriptResult) => void;
  reject: (error: Error) => void;
  startMs: number;
}

// ============================================================================
// PROVIDER
// ============================================================================

export class HiggsPipelineProvider implements ITTSProviderWithSTT {
  readonly name = 'higgs-pipeline';

  private readonly serverUrl: string;
  readonly reconnectDelayMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly config: HiggsPipelineConfig;

  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private sessionId: string | null = null;
  private requestCounter = 0;
  private reconnectAttempt = 0;

  private static readonly BASE_DELAY = 1000;       // 1s
  private static readonly MAX_DELAY = 30000;        // 30s
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;

  private readonly pendingSyntheses = new Map<number, PendingSynthesis>();
  private pendingTranscription: PendingTranscription | null = null;
  private transcriptCallbacks: Array<(result: TranscriptResult) => void> = [];
  private audioSendLock = false;
  private audioQueue: Int16Array[] = [];

  /** Track which request_id is currently receiving binary audio chunks */
  private activeAudioRequestId: number | null = null;

  constructor(config: HiggsPipelineConfig = {}) {
    this.config = config;
    this.serverUrl =
      config.serverUrl ||
      process.env.HIGGS_PIPELINE_URL ||
      DEFAULT_WS_URL;

    this.reconnectDelayMs = config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.connectionTimeoutMs = config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;

    log.info(
      { serverUrl: this.serverUrl },
      'HiggsPipelineProvider initialized'
    );
  }

  // --------------------------------------------------------------------------
  // ITTSProvider implementation
  // --------------------------------------------------------------------------

  /**
   * Synthesize text to s16le PCM audio via the Rust pipeline WebSocket.
   *
   * Sends a synthesize message, collects binary audio chunks until audio_done,
   * then returns the concatenated buffer.
   */
  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    if (!text.trim()) {
      return new ArrayBuffer(0);
    }

    await this.ensureConnected();

    const requestId = ++this.requestCounter;

    const msg: ClientMessage = {
      type: 'synthesize',
      text: text.trim(),
      request_id: requestId,
      ...(prosody?.emotion ? { emotion: prosody.emotion } : {}),
      ...(prosody?.emotionIntensity !== undefined ? { intensity: prosody.emotionIntensity } : {}),
    };

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSyntheses.delete(requestId);
        reject(new Error(`Synthesize timeout after ${SYNTHESIZE_TIMEOUT_MS}ms`));
      }, SYNTHESIZE_TIMEOUT_MS);

      this.pendingSyntheses.set(requestId, {
        resolve: (buffer: ArrayBuffer) => {
          clearTimeout(timer);
          resolve(buffer);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
        chunks: [],
        startMs: Date.now(),
      });

      this.sendJson(msg);

      log.debug(
        { requestId, textLen: text.length, voiceId },
        'Sent synthesize request'
      );
    });
  }

  /**
   * Stream audio generation — yields PCM chunks as they arrive from the server.
   */
  async *synthesizeStreaming(
    text: string,
    _voiceId: string,
    prosody?: SSMLProsodyConfig
  ): AsyncGenerator<ArrayBuffer> {
    if (!text.trim()) return;

    await this.ensureConnected();

    const requestId = ++this.requestCounter;

    const msg: ClientMessage = {
      type: 'synthesize_streaming',
      text: text.trim(),
      request_id: requestId,
      ...(prosody?.emotion ? { emotion: prosody.emotion } : {}),
      ...(prosody?.emotionIntensity !== undefined ? { intensity: prosody.emotionIntensity } : {}),
    };

    // Use a queue-based approach for streaming chunks
    const chunkQueue: ArrayBuffer[] = [];
    let done = false;
    let error: Error | null = null;
    let notifyChunk: (() => void) | null = null;

    const pending: PendingSynthesis = {
      resolve: () => {
        done = true;
        notifyChunk?.();
      },
      reject: (err: Error) => {
        error = err;
        done = true;
        notifyChunk?.();
      },
      chunks: chunkQueue,
      startMs: Date.now(),
      onChunk: () => notifyChunk?.(),
    };
    this.pendingSyntheses.set(requestId, pending);

    this.sendJson(msg);

    const startMs = Date.now();
    let firstChunk = true;

    try {
      while (!done || chunkQueue.length > 0) {
        if (chunkQueue.length > 0) {
          const chunk = chunkQueue.shift()!;
          if (firstChunk) {
            log.info(
              { ttfaMs: Date.now() - startMs, requestId },
              'Higgs pipeline stream TTFA'
            );
            firstChunk = false;
          }
          yield chunk;
        } else if (!done) {
          // Wait for the next chunk notification
          await new Promise<void>((r) => { notifyChunk = r; });
          notifyChunk = null;
        }
      }

      if (error) {
        throw error;
      }

      log.debug(
        { totalMs: Date.now() - startMs, requestId },
        'Higgs pipeline stream complete'
      );
    } finally {
      this.pendingSyntheses.delete(requestId);
    }
  }

  /**
   * Check if the Rust pipeline server is reachable via its HTTP health endpoint.
   */
  async isAvailable(): Promise<boolean> {
    const healthUrl = this.serverUrl
      .replace(/^ws:/, 'http:')
      .replace(/^wss:/, 'https:')
      .replace(/\/ws\/?$/, '/health');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(healthUrl, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Estimate audio duration from text length (~150 WPM).
   */
  estimateDuration(text: string): number {
    const words = Math.ceil(text.length / CHARS_PER_WORD);
    const minutes = words / WORDS_PER_MINUTE;
    return Math.round(minutes * 60 * 1000);
  }

  // --------------------------------------------------------------------------
  // STT / Transcription methods (beyond ITTSProvider)
  // --------------------------------------------------------------------------

  /**
   * Send raw user audio (i16 LE PCM) to the server for STT buffering.
   * Uses a queue to prevent interleaved writes on the WebSocket.
   */
  private static readonly MAX_AUDIO_QUEUE_SIZE = 100;

  async sendUserAudio(frames: Int16Array): Promise<void> {
    await this.ensureConnected();

    if (this.audioQueue.length >= HiggsPipelineProvider.MAX_AUDIO_QUEUE_SIZE) {
      this.audioQueue.shift();
      log.warn({}, 'Audio queue full, dropped oldest frame');
    }
    this.audioQueue.push(frames);
    if (this.audioSendLock) return;
    this.audioSendLock = true;
    try {
      while (this.audioQueue.length > 0) {
        const f = this.audioQueue.shift()!;
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(Buffer.from(f.buffer, f.byteOffset, f.byteLength));
        }
      }
    } finally {
      this.audioSendLock = false;
    }
  }

  /**
   * Trigger server-side transcription of buffered audio.
   * Returns the transcript result with optional voice biomarkers.
   */
  async triggerTranscription(): Promise<TranscriptResult> {
    await this.ensureConnected();

    return new Promise<TranscriptResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTranscription = null;
        reject(new Error('Transcription timeout'));
      }, SYNTHESIZE_TIMEOUT_MS);

      this.pendingTranscription = {
        resolve: (result: TranscriptResult) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
        startMs: Date.now(),
      };

      this.sendJson({ type: 'transcribe' });
    });
  }

  /**
   * Register a callback for transcript events (push-based).
   */
  onTranscript(cb: (result: TranscriptResult) => void): void {
    this.transcriptCallbacks.push(cb);
  }

  // --------------------------------------------------------------------------
  // Connection lifecycle
  // --------------------------------------------------------------------------

  /**
   * Disconnect from the server and clean up.
   */
  async disconnect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendJson({ type: 'end_session' });

      // Give the server a moment to process end_session
      await new Promise<void>((resolve) => {
        const onClose = () => {
          this.ws?.removeListener('close', onClose);
          resolve();
        };
        this.ws!.on('close', onClose);
        setTimeout(() => {
          resolve();
          try {
            this.ws?.close();
          } catch {
            // WebSocket already closing or closed
          }
        }, 500);
      });
    }

    this.cleanup();
    log.info({}, 'Disconnected from Higgs pipeline');
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private getReconnectDelay(): number {
    const delay = Math.min(
      HiggsPipelineProvider.BASE_DELAY * Math.pow(2, this.reconnectAttempt),
      HiggsPipelineProvider.MAX_DELAY
    );
    return delay + Math.random() * 1000;
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // If a connection attempt is already in flight, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connectWithRetry();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async connectWithRetry(): Promise<void> {
    while (this.reconnectAttempt < HiggsPipelineProvider.MAX_RECONNECT_ATTEMPTS) {
      try {
        await this.connect();
        this.reconnectAttempt = 0;
        return;
      } catch (err) {
        this.reconnectAttempt++;
        if (this.reconnectAttempt >= HiggsPipelineProvider.MAX_RECONNECT_ATTEMPTS) {
          log.error(
            { attempts: this.reconnectAttempt },
            'Circuit breaker open: max reconnection attempts exceeded'
          );
          throw err;
        }
        const delay = this.getReconnectDelay();
        log.warn(
          { attempt: this.reconnectAttempt, delayMs: Math.round(delay), error: String(err) },
          `Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt}/${HiggsPipelineProvider.MAX_RECONNECT_ATTEMPTS})`
        );
        await new Promise<void>(r => setTimeout(r, delay));
      }
    }
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.serverUrl);
      ws.binaryType = 'nodebuffer';

      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.connectionTimeoutMs}ms`));
        ws.close();
      }, this.connectionTimeoutMs);

      ws.on('open', () => {
        clearTimeout(timer);
        this.ws = ws;

        // Start a session
        this.sessionId = `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.sendJson({
          type: 'start_session',
          session_id: this.sessionId,
          persona: this.config.persona ?? 'ferni',
        });

        log.info(
          { sessionId: this.sessionId, serverUrl: this.serverUrl },
          'Connected to Higgs pipeline'
        );

        resolve();
      });

      ws.on('message', (data: Buffer | string) => {
        this.handleMessage(data);
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timer);
        log.warn({ error: String(err) }, 'Higgs pipeline WebSocket error');
        reject(err);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(timer);
        log.info(
          { code, reason: reason.toString() },
          'Higgs pipeline WebSocket closed'
        );
        this.rejectAllPending(new Error(`WebSocket closed (code=${code})`));
        this.ws = null;
      });
    });
  }

  private handleMessage(data: Buffer | string): void {
    // Binary frame = audio chunk for the active synthesis request
    if (Buffer.isBuffer(data)) {
      this.handleAudioChunk(data);
      return;
    }

    // Text frame = JSON control message
    let parsed: unknown;
    try {
      parsed = JSON.parse(data as string);
    } catch {
      log.warn({ data: String(data).slice(0, 100) }, 'Malformed JSON from server');
      return;
    }

    // Validate parsed object has a known type field
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      log.warn({ data: String(data).slice(0, 100) }, 'Server message missing "type" field');
      return;
    }

    const msg = parsed as ServerMessage;

    switch (msg.type) {
      case 'transcript':
        this.handleTranscript(msg);
        break;

      case 'audio_start':
        this.activeAudioRequestId = msg.request_id ?? null;
        break;

      case 'audio_done':
        this.handleAudioDone(msg);
        break;

      case 'error':
        this.handleError(msg);
        break;

      default:
        log.warn({ type: (parsed as Record<string, unknown>).type }, 'Unknown server message type');
    }
  }

  private handleAudioChunk(data: Buffer): void {
    // Copy to a fresh ArrayBuffer to avoid SharedArrayBuffer issues with Node.js Buffer pooling
    const chunk = new ArrayBuffer(data.byteLength);
    new Uint8Array(chunk).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

    const requestId = this.activeAudioRequestId;

    if (requestId !== null) {
      const pending = this.pendingSyntheses.get(requestId);
      if (pending) {
        pending.chunks.push(chunk);
        pending.onChunk?.();
        return;
      }
    }

    // No matching request — drop to prevent cross-contamination with parallel requests
    log.warn(
      { activeRequestId: requestId, pendingCount: this.pendingSyntheses.size },
      'Audio chunk with no matching request — dropping'
    );
  }

  private handleAudioDone(msg: ServerMessage & { type: 'audio_done' }): void {
    const requestId = msg.request_id ?? this.activeAudioRequestId;
    this.activeAudioRequestId = null;

    if (requestId === null || requestId === undefined) {
      log.debug({}, 'audio_done with no request_id — dropping');
      return;
    }

    const pending = this.pendingSyntheses.get(requestId);
    if (!pending) {
      log.warn({ requestId }, 'audio_done for unknown request');
      return;
    }

    this.completeSynthesis(requestId, pending, msg.duration_ms);
  }

  private completeSynthesis(requestId: number, pending: PendingSynthesis, durationMs: number): void {
    const latencyMs = Date.now() - pending.startMs;
    const totalBytes = pending.chunks.reduce((sum, c) => sum + c.byteLength, 0);

    // Concatenate all chunks into a single buffer
    const result = new ArrayBuffer(totalBytes);
    const view = new Uint8Array(result);
    let offset = 0;
    for (const chunk of pending.chunks) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    log.debug(
      { requestId, latencyMs, audioBytes: totalBytes, durationMs },
      `Higgs synthesis complete in ${latencyMs}ms`
    );

    this.pendingSyntheses.delete(requestId);
    pending.resolve(result);
  }

  private handleTranscript(msg: ServerMessage & { type: 'transcript' }): void {
    const result: TranscriptResult = {
      text: msg.text,
      biomarkers: msg.biomarkers,
      latencyMs: msg.latency_ms,
    };

    // Resolve pending transcription promise
    if (this.pendingTranscription) {
      this.pendingTranscription.resolve(result);
      this.pendingTranscription = null;
    }

    // Notify push-based listeners
    for (const cb of this.transcriptCallbacks) {
      try {
        cb(result);
      } catch (err) {
        log.warn({ error: String(err) }, 'Transcript callback error');
      }
    }
  }

  private handleError(msg: ServerMessage & { type: 'error' }): void {
    log.warn(
      { code: msg.code, message: msg.message, requestId: msg.request_id },
      'Higgs pipeline server error'
    );

    const errorMessage = `Server error: ${msg.code} — ${msg.message}`;
    const targetRequestId = msg.request_id ?? this.activeAudioRequestId;

    // Always clear activeAudioRequestId on error to prevent stale routing
    this.activeAudioRequestId = null;

    if (targetRequestId !== undefined && targetRequestId !== null) {
      const pending = this.pendingSyntheses.get(targetRequestId);
      if (pending) {
        this.pendingSyntheses.delete(targetRequestId);
        pending.reject(new Error(errorMessage));
        return;
      }
      // request_id present but no matching pending — don't fall through to transcription
      log.warn({ requestId: targetRequestId }, 'Error for unknown request');
      return;
    }

    // No request_id at all — reject the pending transcription
    if (this.pendingTranscription) {
      this.pendingTranscription.reject(new Error(errorMessage));
      this.pendingTranscription = null;
    }
  }

  private sendJson(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn({ msgType: msg.type }, 'Cannot send — WebSocket not open');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private rejectAllPending(error: Error): void {
    const entries = Array.from(this.pendingSyntheses.entries());
    for (const [id, pending] of entries) {
      pending.reject(error);
      this.pendingSyntheses.delete(id);
    }

    if (this.pendingTranscription) {
      this.pendingTranscription.reject(error);
      this.pendingTranscription = null;
    }
  }

  private cleanup(): void {
    this.rejectAllPending(new Error('Provider disconnected'));

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.sessionId = null;
    this.connectionPromise = null;
    this.activeAudioRequestId = null;
    this.reconnectAttempt = 0;
    this.transcriptCallbacks = [];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let providerInstance: HiggsPipelineProvider | null = null;

export function getHiggsPipelineProvider(config?: HiggsPipelineConfig): HiggsPipelineProvider {
  if (!providerInstance) {
    providerInstance = new HiggsPipelineProvider(config);
  }
  return providerInstance;
}

export function resetHiggsPipelineProvider(): void {
  if (providerInstance) {
    providerInstance.disconnect().catch((err) => {
      log.warn({ error: String(err) }, 'Higgs disconnect failed during reset');
    });
    providerInstance = null;
  }
}

export function createHiggsPipelineProvider(config?: HiggsPipelineConfig): HiggsPipelineProvider {
  return new HiggsPipelineProvider(config);
}
