/**
 * Ferni TTS Provider - ITTSProvider for the Ferni Rust TTS service
 *
 * When TTS_PROVIDER=ferni-tts, the gateway uses this provider so synthesis
 * goes through the Ferni TTS service (8 superhuman transforms, full SSML).
 *
 * Env: FERNI_TTS_ENDPOINT, FERNI_TTS_API_KEY (optional), FERNI_TTS_DEFAULT_VOICE
 *
 * @see src/speech/tts/ferni-tts-core.ts - Full client and superhuman context
 * @see docs/audits/VOICE-AGENT-PIPELINE-GAPS-AUDIT.md - Wiring audit
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  cartesiaVoiceToFerniTTS,
  getFerniTTSVoiceIdForPersona,
} from '../../tts/ferni-tts-core.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';

const log = createLogger({ module: 'FerniTTSProvider' });

const DEFAULT_ENDPOINT = process.env.FERNI_TTS_ENDPOINT || 'http://localhost:8080';
const SAMPLE_RATE = 24000;

let ferniProviderInstance: FerniTTSProvider | null = null;

export function getFerniTTSProvider(): ITTSProvider {
  if (!ferniProviderInstance) {
    ferniProviderInstance = new FerniTTSProvider();
  }
  return ferniProviderInstance;
}

export function resetFerniTTSProvider(): void {
  ferniProviderInstance = null;
}

export class FerniTTSProvider implements ITTSProvider {
  readonly name = 'ferni-tts';
  private readonly endpoint: string;
  private readonly apiKey: string | null;

  constructor(options?: { endpoint?: string; apiKey?: string }) {
    this.endpoint = options?.endpoint ?? process.env.FERNI_TTS_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.apiKey = options?.apiKey ?? process.env.FERNI_TTS_API_KEY ?? null;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  private resolveVoiceId(voiceId: string): string {
    // Cartesia UUID or persona name → Ferni voice id
    const ferniId = cartesiaVoiceToFerniTTS(voiceId);
    if (ferniId !== 'ferni') return ferniId;
    return getFerniTTSVoiceIdForPersona(voiceId) || ferniId;
  }

  async synthesize(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    if (!text.trim()) {
      return new ArrayBuffer(0);
    }

    const resolvedVoice = this.resolveVoiceId(voiceId);
    const url = `${this.endpoint}/v1/synthesize`;
    const body = JSON.stringify({
      text: text.trim(),
      voice_id: resolvedVoice,
      sample_rate: SAMPLE_RATE,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body,
      });

      if (!response.ok) {
        const errText = await response.text();
        log.warn(
          { status: response.status, voiceId: resolvedVoice, error: errText.slice(0, 200) },
          'Ferni TTS synthesize failed'
        );
        return new ArrayBuffer(0);
      }

      return await response.arrayBuffer();
    } catch (error) {
      log.warn({ error: String(error), endpoint: this.endpoint }, 'Ferni TTS request failed');
      return new ArrayBuffer(0);
    }
  }

  estimateDuration(text: string): number {
    // Rough estimate: ~150ms per word at normal speech rate
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return Math.max(200, wordCount * 150);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
