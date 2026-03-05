/**
 * Cartesia TTS Provider — implements ITTSProvider using Cartesia REST API.
 *
 * Production TTS for persona voices. Uses Cartesia's /tts/bytes endpoint
 * (pcm_s16le, 24kHz). No native addon required.
 *
 * @module speech/tts-gateway/providers/cartesia
 */

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
