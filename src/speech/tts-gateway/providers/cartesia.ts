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

import { createLogger } from '../../../utils/safe-logger.js';
import {
  CARTESIA_MODEL,
  CARTESIA_API_VERSION,
  CARTESIA_API_URL,
  cartesiaPronunciation,
} from '../../../config/voice-ids.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import { CartesiaReplyStream, type ReplyStream } from './cartesia-reply-stream.js';
import { CartesiaSocket } from './cartesia-socket.js';

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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The chunk's prosody as sonic-3 inline tags (rendered on both /tts/bytes and
 * the WebSocket). The gateway extracts speed/volume/emotion from the reply's
 * markup per chunk; without this the provider sent plain text and every
 * delivery cue was lost.
 */
export function prosodyTags(prosody?: SSMLProsodyConfig): string {
  if (!prosody) return '';
  const tags: string[] = [];
  if (prosody.speed !== undefined && prosody.speed !== 1) {
    tags.push(`<speed ratio="${clamp(prosody.speed, 0.6, 1.5)}"/>`);
  }
  if (prosody.volume !== undefined && prosody.volume !== 1) {
    tags.push(`<volume ratio="${clamp(prosody.volume, 0.5, 2)}"/>`);
  }
  if (prosody.emotion && /^[a-z_]+$/.test(prosody.emotion)) {
    tags.push(`<emotion value="${prosody.emotion}"/>`);
  }
  return tags.join('');
}

export class CartesiaTTSProvider implements ITTSProvider {
  readonly name = 'cartesia';
  private readonly socket = new CartesiaSocket(
    () => buildWebsocketUrl(process.env.CARTESIA_API_KEY ?? ''),
    WS_OPEN_TIMEOUT_MS
  );

  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
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
      ...cartesiaPronunciation(),
      transcript: prosodyTags(prosody) + plainText,
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
    prosody?: SSMLProsodyConfig
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

    try {
      await this.socket.send(
        contextId,
        {
          model_id: CARTESIA_MODEL,
          ...cartesiaPronunciation(),
          transcript: prosodyTags(prosody) + plainText,
          voice: { mode: 'id', id: voiceId },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000,
          },
          language: 'en',
          context_id: contextId,
          continue: false,
        },
        {
          onChunk: (pcm) => {
            queue.push(pcm);
            wake();
          },
          onDone: () => {
            streamDone = true;
            wake();
          },
          onError: (error) => {
            streamError = error;
            streamDone = true;
            wake();
          },
        }
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
      // Stopped early (interrupted, timed out, failed): stop Cartesia generating
      // for this context but keep the shared socket for the next chunk.
      if (streamDone) this.socket.release(contextId);
      else this.socket.cancel(contextId);
    }
  }

  /**
   * Voice a whole reply on one Cartesia context (continuations): the gateway
   * pushes each sentence as the LLM finishes it, and Cartesia keeps the tone
   * and pacing continuous across them. Put any inline tags on the first push.
   */
  openReplyStream(voiceId: string): ReplyStream {
    return new CartesiaReplyStream(
      this.socket,
      (transcript, more, contextId) => ({
        model_id: CARTESIA_MODEL,
        ...cartesiaPronunciation(),
        transcript,
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
        language: 'en',
        context_id: contextId,
        continue: more,
        // The gateway already sends whole sentences; server buffering only adds delay.
        max_buffer_delay_ms: 0,
      }),
      WS_STREAM_TIMEOUT_MS
    );
  }

  /**
   * Open the shared socket ahead of the first chunk so its handshake overlaps
   * the LLM's thinking instead of delaying the first audio. Never throws.
   */
  prewarm(): void {
    if (!process.env.CARTESIA_API_KEY) return;
    this.socket
      .connect()
      .catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Cartesia socket prewarm failed')
      );
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
