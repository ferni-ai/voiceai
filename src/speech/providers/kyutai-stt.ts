/**
 * Kyutai STT Client
 *
 * WebSocket client for Kyutai's Delayed Streams Modeling STT (Speech-to-Text).
 * Streams audio to the STT server and receives transcript + VAD events.
 *
 * Use when USE_KYUTAI_STT=true; point to KYUTAI_STT_URL (e.g. ws://localhost:8089/api/asr-streaming).
 *
 * @module speech/providers/kyutai-stt
 */

import { createLogger } from '../../utils/safe-logger.js';
import WebSocket from 'ws';

const log = createLogger({ module: 'KyutaiSTTClient' });

// ============================================================================
// TYPES
// ============================================================================

export interface KyutaiSTTTranscriptEvent {
  /** Transcript text */
  text: string;
  /** Whether this is a final (committed) transcript */
  isFinal: boolean;
  /** Word-level timestamps if available */
  words?: Array<{ word: string; startMs?: number; endMs?: number }>;
}

export interface KyutaiSTTVADEvent {
  /** Whether user is currently speaking */
  isSpeaking: boolean;
  /** Confidence or raw value if provided */
  value?: number;
}

export interface KyutaiSTTClientConfig {
  /** WebSocket URL for ASR streaming (default: KYUTAI_STT_URL env) */
  sttUrl?: string;
  /** Auth token (optional; query param or header) */
  authId?: string;
  /** Sample rate of input audio (Kyutai STT expects 8kHz or 16kHz) */
  sampleRate?: number;
}

export type TranscriptCallback = (event: KyutaiSTTTranscriptEvent) => void;
export type VADCallback = (event: KyutaiSTTVADEvent) => void;

// ============================================================================
// CLIENT
// ============================================================================

/**
 * Kyutai STT WebSocket client.
 *
 * Connect, send binary audio chunks (PCM), receive transcript and VAD events
 * via callbacks. Protocol follows Kyutai/moshi-server ASR streaming API.
 */
export class KyutaiSTTClient {
  private readonly sttUrl: string;
  private readonly authId: string;
  private readonly sampleRate: number;
  private ws: WebSocket | null = null;
  private transcriptCb: TranscriptCallback | null = null;
  private vadCb: VADCallback | null = null;

  constructor(config: KyutaiSTTClientConfig = {}) {
    const envUrl = process.env.KYUTAI_STT_URL;
    this.sttUrl = config.sttUrl || envUrl || 'ws://localhost:8089/api/asr-streaming';
    this.authId = config.authId || process.env.KYUTAI_API_KEY || 'public_token';
    this.sampleRate = config.sampleRate ?? 16000;
  }

  /**
   * Connect to the Kyutai STT server.
   */
  connect(): Promise<void> {
    const url = this.buildWsUrl();
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        log.debug({ url }, 'Kyutai STT connected');
        resolve();
      });

      this.ws.on('error', (err) => {
        log.warn({ error: String(err), url }, 'Kyutai STT WebSocket error');
        reject(err);
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        log.debug({}, 'Kyutai STT disconnected');
        this.ws = null;
      });
    });
  }

  /**
   * Send raw audio bytes (PCM mono, 16-bit).
   * Sample rate should match constructor (default 16kHz).
   */
  sendAudio(buffer: ArrayBuffer | Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn({}, 'Kyutai STT sendAudio called while not connected');
      return;
    }
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this.ws.send(data);
  }

  /**
   * Register callback for transcript events.
   */
  onTranscript(cb: TranscriptCallback): void {
    this.transcriptCb = cb;
  }

  /**
   * Register callback for VAD (voice activity) events.
   */
  onVAD(cb: VADCallback): void {
    this.vadCb = cb;
  }

  /**
   * Close the WebSocket connection.
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.transcriptCb = null;
    this.vadCb = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private buildWsUrl(): string {
    const u = new URL(this.sttUrl);
    if (this.authId && this.authId !== 'public_token') {
      u.searchParams.set('auth_id', this.authId);
    }
    return u.toString();
  }

  private handleMessage(data: WebSocket.RawData): void {
    const str =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf8')
          : String(data);
    try {
      const obj = JSON.parse(str) as Record<string, unknown>;
      if (typeof obj.text === 'string') {
        const isFinal = obj.is_final === true || obj.final === true;
        this.transcriptCb?.({
          text: obj.text,
          isFinal,
          words: obj.words as KyutaiSTTTranscriptEvent['words'],
        });
      }
      if (typeof obj.vad === 'boolean' || typeof obj.is_speaking === 'boolean') {
        this.vadCb?.({
          isSpeaking: (obj.vad ?? obj.is_speaking) as boolean,
          value: obj.value as number | undefined,
        });
      }
    } catch {
      log.debug({ msg: str.slice(0, 100) }, 'Kyutai STT non-JSON message');
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Kyutai STT client (no singleton; one per session/stream).
 */
export function createKyutaiSTTClient(config?: KyutaiSTTClientConfig): KyutaiSTTClient {
  return new KyutaiSTTClient(config);
}

/**
 * Check if Kyutai STT server is reachable.
 */
export async function isKyutaiSTTAvailable(url?: string): Promise<boolean> {
  const baseUrl = url || process.env.KYUTAI_STT_URL || 'ws://localhost:8089/api/asr-streaming';
  const u = new URL(baseUrl);
  return new Promise((resolve) => {
    const ws = new WebSocket(u.toString());
    const t = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resolve(false);
    }, 3000);
    ws.on('open', () => {
      clearTimeout(t);
      ws.close();
      resolve(true);
    });
    ws.on('error', () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}
