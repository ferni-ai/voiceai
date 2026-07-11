/**
 * Cartesia TTS Provider — implements ITTSProvider using Cartesia REST + WebSocket.
 *
 * Production TTS for persona voices:
 * - synthesize(): REST /tts/bytes (full buffer)
 * - synthesizeStreaming(): WebSocket /tts/websocket (first-byte streaming)
 *
 * Encoding: pcm_s16le @ 24kHz. No native addon required.
 *
 * @module speech/tts-gateway/providers/cartesia
 */

import { randomUUID } from 'node:crypto';

import { WebSocket } from 'ws';

import { createLogger } from '../../../utils/safe-logger.js';
import {
  CARTESIA_MODEL,
  CARTESIA_API_VERSION,
  CARTESIA_API_URL,
} from '../../../config/voice-ids.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';

const log = createLogger({ module: 'CartesiaTTSProvider' });

const BYTES_API = `${CARTESIA_API_URL.replace(/\/$/, '')}/tts/bytes`;
const WORDS_PER_MINUTE = 150;
const WS_OPEN_TIMEOUT_MS = 5_000;
const WS_STREAM_TIMEOUT_MS = 30_000;

function buildWebsocketUrl(apiKey: string): string {
  const base = CARTESIA_API_URL.replace(/^http/i, 'ws').replace(/\/$/, '');
  const params = new URLSearchParams({
    api_key: apiKey,
    cartesia_version: CARTESIA_API_VERSION,
  });
  return `${base}/tts/websocket?${params.toString()}`;
}

/**
 * Strip SSML and normalize text for Cartesia (tags get spoken literally otherwise).
 */
function stripForCartesia(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class CartesiaTTSProvider implements ITTSProvider {
  readonly name = 'cartesia';

  async synthesize(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY is not set');
    }

    const plainText = stripForCartesia(text);
    if (!plainText) {
      return new ArrayBuffer(0);
    }

    const body = {
      model_id: CARTESIA_MODEL,
      transcript: plainText,
      voice: { mode: 'id' as const, id: voiceId },
      output_format: {
        container: 'raw' as const,
        encoding: 'pcm_s16le' as const,
        sample_rate: 24000,
      },
      language: 'en',
    };

    const response = await fetch(BYTES_API, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error(
        { status: response.status, statusText: response.statusText, body: errText },
        'Cartesia TTS request failed'
      );
      throw new Error(`Cartesia TTS failed: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Stream PCM audio as Cartesia generates it (WebSocket).
   * Yields s16le chunks for low TTFB — do NOT route Cartesia through
   * whole-text streaming in the gateway (that waits for the full LLM reply).
   */
  async *synthesizeStreaming(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig
  ): AsyncIterable<ArrayBuffer> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY is not set');
    }

    const plainText = stripForCartesia(text);
    if (!plainText) {
      return;
    }

    const contextId = randomUUID();
    const wsUrl = buildWebsocketUrl(apiKey);
    const queue: ArrayBuffer[] = [];
    let resolveWait: (() => void) | null = null;
    let streamDone = false;
    let streamError: Error | null = null;

    const wake = (): void => {
      if (resolveWait) {
        const resolve = resolveWait;
        resolveWait = null;
        resolve();
      }
    };

    const fail = (err: Error): void => {
      streamError = err;
      streamDone = true;
      wake();
    };

    const ws = new WebSocket(wsUrl);

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Cartesia WebSocket open timed out after ${WS_OPEN_TIMEOUT_MS}ms`));
        }, WS_OPEN_TIMEOUT_MS);

        ws.once('open', () => {
          clearTimeout(timer);
          resolve();
        });
        ws.once('error', (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[] | string) => {
        try {
          const textPayload =
            typeof raw === 'string'
              ? raw
              : Buffer.isBuffer(raw)
                ? raw.toString('utf8')
                : Array.isArray(raw)
                  ? Buffer.concat(raw).toString('utf8')
                  : Buffer.from(raw).toString('utf8');
          const message = JSON.parse(textPayload) as {
            type?: string;
            data?: string;
            done?: boolean;
            error?: string;
            message?: string;
          };

          if (message.type === 'error' || message.error) {
            fail(
              new Error(
                message.error || message.message || 'Cartesia WebSocket TTS error'
              )
            );
            return;
          }

          if (message.type === 'chunk' && message.data) {
            const pcm = Buffer.from(message.data, 'base64');
            if (pcm.byteLength > 0) {
              queue.push(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
              wake();
            }
          }

          if (message.type === 'done' || message.done === true) {
            streamDone = true;
            wake();
          }
        } catch (parseErr) {
          fail(
            parseErr instanceof Error
              ? parseErr
              : new Error(`Cartesia WS parse error: ${String(parseErr)}`)
          );
        }
      });

      ws.on('error', (err: Error) => {
        fail(err);
      });

      ws.on('close', () => {
        streamDone = true;
        wake();
      });

      ws.send(
        JSON.stringify({
          model_id: CARTESIA_MODEL,
          transcript: plainText,
          voice: { mode: 'id', id: voiceId },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000,
          },
          language: 'en',
          context_id: contextId,
          continue: false,
        })
      );

      const deadline = Date.now() + WS_STREAM_TIMEOUT_MS;

      while (!streamDone || queue.length > 0) {
        if (streamError) {
          throw streamError;
        }
        if (Date.now() > deadline) {
          throw new Error(`Cartesia WebSocket stream timed out after ${WS_STREAM_TIMEOUT_MS}ms`);
        }
        if (queue.length === 0) {
          if (streamDone) break;
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
          continue;
        }
        yield queue.shift()!;
      }

      log.debug(
        { contextId, textLen: plainText.length },
        'Cartesia WebSocket streaming TTS complete'
      );
    } finally {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          // ignore close errors
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.CARTESIA_API_KEY;
  }

  estimateDuration(text: string): number {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return Math.round((wordCount / WORDS_PER_MINUTE) * 60 * 1000);
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let instance: CartesiaTTSProvider | null = null;

export function getCartesiaProvider(): CartesiaTTSProvider {
  if (!instance) {
    instance = new CartesiaTTSProvider();
  }
  return instance;
}

export function createCartesiaProvider(): CartesiaTTSProvider {
  return new CartesiaTTSProvider();
}

export function resetCartesiaProvider(): void {
  instance = null;
}
