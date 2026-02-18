/**
 * Higgs MLX TTS Provider
 *
 * ITTSProvider implementation for the Higgs Audio V2 MLX server.
 * Communicates over WebSocket with the Python MLX server running
 * Higgs Audio V2 with INT4 quantization (~75 tok/s, RTF 0.33x).
 *
 * Protocol:
 *   Client -> Server:
 *     {"type": "StartSession"}
 *     {"type": "Synthesize", "text": "...", "request_id": 1}
 *     {"type": "SynthesizeStreaming", "text": "...", "request_id": 2, "chunk_size": 25}
 *     {"type": "EndSession"}
 *
 *   Server -> Client:
 *     {"type": "SessionStarted"}
 *     {"type": "SynthesisComplete", "request_id": 1, ...}
 *     {"type": "AudioChunk", "request_id": 2, "samples": N} + binary PCM
 *     {"type": "StreamComplete", "request_id": 2, ...}
 *     {"type": "SessionEnded"}
 *
 * Env:
 *   TTS_PROVIDER=higgs-mlx
 *   HIGGS_MLX_URL=ws://localhost:8700  (default)
 *
 * @module speech/tts-gateway/providers/higgs-mlx
 */

import { WebSocket, type RawData } from 'ws';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'HiggsMLXProvider' });

const DEFAULT_WS_URL = 'ws://localhost:8700';
const DEFAULT_HEALTH_URL = 'http://localhost:8701/health';
const CONNECTION_TIMEOUT_MS = 5000;
const SYNTHESIZE_TIMEOUT_MS = 60_000;
const WORDS_PER_MINUTE = 150;
const CHARS_PER_WORD = 5;

export interface HiggsMLXProviderConfig {
  serverUrl?: string;
  healthUrl?: string;
  connectionTimeoutMs?: number;
}

interface PendingSynthesis {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (error: Error) => void;
  chunks: ArrayBuffer[];
  startMs: number;
}

let _instance: HiggsMLXTTSProvider | null = null;

export class HiggsMLXTTSProvider implements ITTSProvider {
  readonly name = 'higgs-mlx';

  private ws: WebSocket | null = null;
  private serverUrl: string;
  private healthUrl: string;
  private connectionTimeoutMs: number;
  private pendingSynth: PendingSynthesis | null = null;
  private sessionActive = false;
  private requestCounter = 0;
  private connecting = false;

  constructor(config: HiggsMLXProviderConfig = {}) {
    this.serverUrl = config.serverUrl ?? process.env.HIGGS_MLX_URL ?? DEFAULT_WS_URL;
    this.healthUrl = config.healthUrl ?? process.env.HIGGS_MLX_HEALTH_URL ?? DEFAULT_HEALTH_URL;
    this.connectionTimeoutMs = config.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS;
  }

  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    await this.ensureConnected();

    const requestId = ++this.requestCounter;
    const cleanText = this.stripSsml(text);

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingSynth = null;
        reject(new Error(`Higgs MLX synthesis timed out after ${SYNTHESIZE_TIMEOUT_MS}ms`));
      }, SYNTHESIZE_TIMEOUT_MS);

      this.pendingSynth = {
        resolve: (buffer: ArrayBuffer) => {
          clearTimeout(timeout);
          resolve(buffer);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        chunks: [],
        startMs: Date.now(),
      };

      this.send({
        type: 'Synthesize',
        text: cleanText,
        request_id: requestId,
        voice_id: voiceId || 'default',
        temperature: 0.3,
        max_tokens: 750,
      });
    });
  }

  async *synthesizeStreaming(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): AsyncIterable<ArrayBuffer> {
    await this.ensureConnected();

    const requestId = ++this.requestCounter;
    const cleanText = this.stripSsml(text);

    // Use a queue-based approach for streaming
    const chunks: ArrayBuffer[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    const onMessage = (data: RawData) => {
      if (data instanceof Buffer) {
        const copy = new ArrayBuffer(data.byteLength);
        new Uint8Array(copy).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        chunks.push(copy);
        resolveWait?.();
      } else if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'StreamComplete' || msg.type === 'SynthesisComplete') {
            done = true;
            resolveWait?.();
          } else if (msg.type === 'Error') {
            error = new Error(msg.message ?? 'Higgs MLX streaming error');
            resolveWait?.();
          }
        } catch {
          // Ignore parse errors
        }
      }
    };

    this.ws?.on('message', onMessage);

    try {
      this.send({
        type: 'SynthesizeStreaming',
        text: cleanText,
        request_id: requestId,
        voice_id: voiceId || 'default',
        temperature: 0.3,
        max_tokens: 750,
        chunk_size: 25,
      });

      while (!done && !error) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else {
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
          resolveWait = null;
        }
      }

      // Drain remaining chunks
      while (chunks.length > 0) {
        yield chunks.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      this.ws?.off('message', onMessage);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  estimateDuration(text: string): number {
    const words = text.length / CHARS_PER_WORD;
    return Math.round((words / WORDS_PER_MINUTE) * 60 * 1000);
  }

  // ─── Private helpers ──────────────────────────────────────

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionActive) {
      return;
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.connecting) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
      return;
    }

    this.connecting = true;

    try {
      await this.connect();
      await this.startSession();
    } finally {
      this.connecting = false;
    }
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Higgs MLX connection timed out after ${this.connectionTimeoutMs}ms`));
      }, this.connectionTimeoutMs);

      log.info('Connecting to Higgs MLX server:', this.serverUrl);
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        log.info('Connected to Higgs MLX server');
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        log.error('WebSocket error:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        this.sessionActive = false;
        this.ws = null;
        log.info('Disconnected from Higgs MLX server');
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  private async startSession(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('StartSession timed out'));
      }, 5000);

      const onMsg = (data: RawData) => {
        if (typeof data === 'string') {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'SessionStarted') {
              clearTimeout(timeout);
              this.ws?.off('message', onMsg);
              this.sessionActive = true;
              log.info('Session started with Higgs MLX server');
              resolve();
            }
          } catch {
            // Ignore
          }
        }
      };

      this.ws?.on('message', onMsg);
      this.send({ type: 'StartSession' });
    });
  }

  private handleMessage(data: RawData): void {
    if (data instanceof Buffer && this.pendingSynth) {
      // Binary audio data -- copy to own ArrayBuffer
      const copy = new ArrayBuffer(data.byteLength);
      new Uint8Array(copy).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.pendingSynth.chunks.push(copy);
      return;
    }

    if (typeof data !== 'string') return;

    try {
      const msg = JSON.parse(data);

      if (msg.type === 'SynthesisComplete' && this.pendingSynth) {
        const elapsed = Date.now() - this.pendingSynth.startMs;
        log.info(`Synthesis complete: ${msg.tokens_per_sec} tok/s, RTF=${msg.rtf}, ${elapsed}ms`);

        // Concatenate all chunks into a single buffer
        const totalSize = this.pendingSynth.chunks.reduce((s, c) => s + c.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of this.pendingSynth.chunks) {
          combined.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }

        const pending = this.pendingSynth;
        this.pendingSynth = null;
        pending.resolve(combined.buffer);
      } else if (msg.type === 'Error') {
        log.error('Higgs MLX error:', msg.message);
        if (this.pendingSynth) {
          const pending = this.pendingSynth;
          this.pendingSynth = null;
          pending.reject(new Error(msg.message ?? 'Higgs MLX error'));
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      log.warn('Cannot send - WebSocket not open');
    }
  }

  private stripSsml(text: string): string {
    // Remove SSML tags for Higgs (it uses raw text)
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async disconnect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'EndSession' });
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      this.ws.close();
    }
    this.ws = null;
    this.sessionActive = false;
  }
}

export function createHiggsMLXProvider(config?: HiggsMLXProviderConfig): HiggsMLXTTSProvider {
  return new HiggsMLXTTSProvider(config);
}

export function getHiggsMLXProvider(): HiggsMLXTTSProvider {
  if (!_instance) {
    _instance = createHiggsMLXProvider();
  }
  return _instance;
}

export function resetHiggsMLXProvider(): void {
  if (_instance) {
    _instance.disconnect().catch(() => {});
    _instance = null;
  }
}
