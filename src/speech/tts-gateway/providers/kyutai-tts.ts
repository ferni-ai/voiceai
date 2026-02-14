/**
 * Kyutai TTS Provider
 *
 * Implementation of ITTSProvider for Kyutai's Delayed Streams Modeling TTS.
 * Connects to moshi-server TTS websocket (Rust/CUDA on GCE or bridge on Mac).
 *
 * Env: TTS_PROVIDER=kyutai, KYUTAI_TTS_URL=ws://localhost:8090/api/tts_streaming
 *
 * @module speech/tts-gateway/providers/kyutai-tts
 */

import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import WebSocket from 'ws';

const log = createLogger({ module: 'KyutaiTTSProvider' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Kyutai TTS default sample rate (matches config) */
const SAMPLE_RATE = 24000;

/** Words per minute for duration estimation */
const WORDS_PER_MINUTE = 150;

/** Chars per word for estimation */
const CHARS_PER_WORD = 5;

/** Connection timeout for synthesize (ms) */
const SYNTHESIZE_TIMEOUT_MS = 30_000;

/** Connection timeout for isAvailable (ms) */
const AVAILABILITY_TIMEOUT_MS = 3000;

/** Persona ID to Kyutai voice path (relative to voice_folder, e.g. /voices) */
const PERSONA_TO_KYUTAI_VOICE: Record<string, string> = {
  ferni: 'ferni/ferni-voice.safetensors',
  maya: 'maya/maya-voice.safetensors',
  'peter-john': 'peter-john/peter-john-voice.safetensors',
  alex: 'alex/alex-voice.safetensors',
  jordan: 'jordan/jordan-voice.safetensors',
  'nayan-patel': 'nayan-patel/nayan-patel-voice.safetensors',
};

// ============================================================================
// CONFIG
// ============================================================================

export interface KyutaiTTSProviderConfig {
  /** WebSocket URL for TTS streaming (default: KYUTAI_TTS_URL env) */
  ttsUrl?: string;
  /** Auth token for Kyutai API (optional; set via query or header) */
  authId?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Throw on error instead of returning empty buffer (default: false) */
  throwOnError?: boolean;
}

// ============================================================================
// PROVIDER CLASS
// ============================================================================

/**
 * Kyutai TTS Provider implementation.
 *
 * Sends text over WebSocket to Kyutai TTS server and collects binary PCM.
 * Protocol: connect, send text (UTF-8 or JSON with text/voice_id), receive binary audio frames.
 */
export class KyutaiTTSProvider implements ITTSProvider {
  readonly name = 'kyutai';

  private readonly ttsUrl: string;
  private readonly authId: string;
  private readonly timeoutMs: number;
  private readonly throwOnError: boolean;

  constructor(config: KyutaiTTSProviderConfig = {}) {
    const envUrl = process.env.KYUTAI_TTS_URL;
    this.ttsUrl = config.ttsUrl || envUrl || 'ws://localhost:8090/api/tts_streaming';
    this.authId = config.authId || process.env.KYUTAI_API_KEY || 'public_token';
    this.timeoutMs = config.timeoutMs ?? SYNTHESIZE_TIMEOUT_MS;
    this.throwOnError = config.throwOnError ?? false;

    if (!envUrl && !config.ttsUrl) {
      log.debug({ url: this.ttsUrl }, 'Kyutai TTS URL not set, using default localhost');
    }
  }

  /**
   * Synthesize text to audio via Kyutai TTS WebSocket.
   *
   * Strips SSML (caller should pass clean text). Sends text to server,
   * collects binary PCM chunks, returns concatenated ArrayBuffer.
   */
  async synthesize(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    if (!text.trim()) {
      log.debug({}, 'Empty text, returning empty buffer');
      return new ArrayBuffer(0);
    }

    const kyutaiVoiceId = this.resolveVoiceId(voiceId);
    const url = this.buildWsUrl();
    const chunks: Buffer[] = [];
    let ws: WebSocket;

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        const err = new Error(`Kyutai TTS synthesize timeout after ${this.timeoutMs}ms`);
        if (this.throwOnError) {
          reject(err);
        } else {
          log.warn({ text: text.slice(0, 50) }, err.message);
          resolve(this.chunksToArrayBuffer(chunks));
        }
      }, this.timeoutMs);

      ws = new WebSocket(url);

      ws.on('error', (err) => {
        clearTimeout(timeoutId);
        log.warn({ error: String(err), url }, 'Kyutai TTS WebSocket error');
        if (this.throwOnError) {
          reject(err);
        } else {
          resolve(this.chunksToArrayBuffer(chunks));
        }
      });

      ws.on('open', () => {
        // Send text: Kyutai server expects voice_id as path relative to voice_folder (e.g. ferni/ferni-voice.safetensors)
        const payload = JSON.stringify({ text: text.trim(), voice_id: kyutaiVoiceId });
        ws.send(payload, (err) => {
          if (err) {
            clearTimeout(timeoutId);
            ws.close();
            if (this.throwOnError) {
              reject(err);
            } else {
              resolve(this.chunksToArrayBuffer(chunks));
            }
          }
        });
      });

      ws.on('message', (data: WebSocket.RawData) => {
        const buf = Buffer.isBuffer(data) ? data : data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(String(data), 'utf8');
        // Skip only small control messages (e.g. {"done":true}). PCM chunks are larger and must not be dropped.
        if (buf.length < 128) {
          const str = buf.toString('utf8').trim();
          if (str.startsWith('{')) {
            try {
              const o = JSON.parse(str) as { done?: boolean; error?: string };
              if (o && typeof o.done !== 'undefined') {
                if (o.error) {
                  log.warn({ error: o.error, msg: str.slice(0, 120) }, 'Kyutai TTS server sent error (no audio)');
                } else {
                  log.debug({ msg: str.slice(0, 80) }, 'Kyutai TTS control message (skipped)');
                }
                return;
              }
            } catch {
              // not JSON, treat as PCM
            }
          }
        }
        chunks.push(buf);
      });

      ws.on('close', () => {
        clearTimeout(timeoutId);
        if (chunks.length === 0) {
          log.warn({ url: this.ttsUrl }, 'Kyutai TTS received no PCM chunks (empty audio)');
        }
        resolve(this.chunksToArrayBuffer(chunks));
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    const url = this.buildWsUrl();
    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(url);
      const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve(false);
      }, AVAILABILITY_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(timeoutId);
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        clearTimeout(timeoutId);
        resolve(false);
      });
    });
  }

  estimateDuration(text: string): number {
    const words = Math.ceil(text.length / CHARS_PER_WORD);
    const minutes = words / WORDS_PER_MINUTE;
    return Math.round(minutes * 60 * 1000);
  }

  /** Resolve persona/voiceId to Kyutai voice path (persona/voice.safetensors). */
  private resolveVoiceId(voiceId: string): string {
    const key = voiceId.toLowerCase().replace(/_/g, '-');
    const path = PERSONA_TO_KYUTAI_VOICE[key];
    if (path) {
      return path;
    }
    if (voiceId.includes('/') || voiceId.endsWith('.safetensors')) {
      return voiceId;
    }
    return `${voiceId}/${voiceId}-voice.safetensors`;
  }

  private buildWsUrl(): string {
    const u = new URL(this.ttsUrl);
    if (this.authId && this.authId !== 'public_token') {
      u.searchParams.set('auth_id', this.authId);
    }
    return u.toString();
  }

  private chunksToArrayBuffer(chunks: Buffer[]): ArrayBuffer {
    if (chunks.length === 0) {
      return new ArrayBuffer(0);
    }
    const total = Buffer.concat(chunks);
    return total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let providerInstance: KyutaiTTSProvider | null = null;
let providerConfig: KyutaiTTSProviderConfig | undefined;

export function getKyutaiProvider(config?: KyutaiTTSProviderConfig): ITTSProvider {
  if (!providerInstance) {
    providerInstance = new KyutaiTTSProvider(config);
    providerConfig = config;
  } else if (config && providerConfig) {
    const differs =
      config.ttsUrl !== providerConfig.ttsUrl || config.authId !== providerConfig.authId;
    if (differs) {
      log.warn(
        {},
        'getKyutaiProvider called with different config - using existing instance. Use createKyutaiProvider() for new config.'
      );
    }
  }
  return providerInstance;
}

export function resetKyutaiProvider(): void {
  providerInstance = null;
  providerConfig = undefined;
}

export function createKyutaiProvider(config?: KyutaiTTSProviderConfig): ITTSProvider {
  return new KyutaiTTSProvider(config);
}
