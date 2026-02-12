/**
 * Local TTS Provider
 *
 * ITTSProvider implementation for local TTS servers running on-device.
 * Connects via HTTP to any local TTS server exposing a standard REST API:
 *
 *   POST /synthesize  { text, voice_id, prosody? }  -> PCM audio (16-bit, 24kHz)
 *   GET  /health                                      -> 200 OK
 *
 * Works with:
 *   - Qwen3-TTS MLX (Apple Silicon, 80-150ms TTFB, voice cloning)
 *   - Kokoro-82M (<80ms TTFB, lightweight)
 *   - Any server implementing the same endpoint contract
 *
 * Env:
 *   TTS_PROVIDER=local
 *   LOCAL_TTS_URL=http://127.0.0.1:8501  (default)
 *   LOCAL_TTS_VOICE=default               (default voice ID)
 *
 * @module speech/tts-gateway/providers/local-tts
 */

import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'LocalTTSProvider' });

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_URL = 'http://127.0.0.1:8501';
const DEFAULT_SAMPLE_RATE = 24000;
const SYNTHESIZE_TIMEOUT_MS = 15_000;
const AVAILABILITY_TIMEOUT_MS = 2000;
const WORDS_PER_MINUTE = 150;
const CHARS_PER_WORD = 5;

// ============================================================================
// CONFIG
// ============================================================================

export interface LocalTTSProviderConfig {
  /** HTTP base URL for the local TTS server (default: LOCAL_TTS_URL env or http://127.0.0.1:8501) */
  serverUrl?: string;
  /** Default voice ID when none specified (default: LOCAL_TTS_VOICE env or 'default') */
  defaultVoice?: string;
  /** Expected sample rate of returned PCM (default: 24000) */
  sampleRate?: number;
  /** Request timeout in ms (default: 15000) */
  timeoutMs?: number;
}

// ============================================================================
// PERSONA VOICE MAPPING
// ============================================================================

/**
 * Map persona voice IDs (Cartesia UUIDs or persona names) to local voice identifiers.
 * Local TTS servers typically use short string IDs, not Cartesia UUIDs.
 *
 * Falls back to 'default' for unknown voices.
 */
const PERSONA_TO_LOCAL_VOICE: Record<string, string> = {
  ferni: 'ferni',
  'maya-santos': 'maya',
  maya: 'maya',
  'peter-john': 'peter',
  peter: 'peter',
  'alex-chen': 'alex',
  alex: 'alex',
  'jordan-taylor': 'jordan',
  jordan: 'jordan',
  'nayan-patel': 'nayan',
  nayan: 'nayan',
  'joel-dickson': 'joel',
  joel: 'joel',
  'peter-lynch': 'lynch',
  'john-bogle': 'bogle',
};

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Local TTS provider — connects to a local TTS HTTP server for on-device synthesis.
 *
 * Returns 16-bit PCM audio at the configured sample rate.
 * The server is expected to handle voice cloning / selection internally.
 */
export class LocalTTSProvider implements ITTSProvider {
  readonly name = 'local';

  private readonly serverUrl: string;
  private readonly defaultVoice: string;
  private readonly sampleRate: number;
  private readonly timeoutMs: number;

  constructor(config: LocalTTSProviderConfig = {}) {
    this.serverUrl = (
      config.serverUrl ||
      process.env.LOCAL_TTS_URL ||
      DEFAULT_URL
    ).replace(/\/$/, ''); // strip trailing slash

    this.defaultVoice = config.defaultVoice || process.env.LOCAL_TTS_VOICE || 'default';
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.timeoutMs = config.timeoutMs ?? SYNTHESIZE_TIMEOUT_MS;

    log.info(
      { serverUrl: this.serverUrl, defaultVoice: this.defaultVoice, sampleRate: this.sampleRate },
      'LocalTTSProvider initialized'
    );
  }

  /**
   * Synthesize text to PCM audio via local HTTP server.
   *
   * POST /synthesize
   *   Request:  { text, voice_id, sample_rate, prosody? }
   *   Response: Binary PCM (16-bit signed, mono, at sample_rate)
   */
  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    if (!text.trim()) {
      return new ArrayBuffer(0);
    }

    const resolvedVoice = this.resolveVoiceId(voiceId);
    const url = `${this.serverUrl}/synthesize`;

    const body = JSON.stringify({
      text: text.trim(),
      voice_id: resolvedVoice,
      sample_rate: this.sampleRate,
      ...(prosody?.emotion ? { emotion: prosody.emotion } : {}),
      ...(prosody?.speed ? { speed: prosody.speed } : {}),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const startMs = Date.now();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        log.warn(
          { status: response.status, error: errText.slice(0, 200), url },
          'Local TTS synthesis failed'
        );
        return new ArrayBuffer(0);
      }

      const audio = await response.arrayBuffer();
      const latencyMs = Date.now() - startMs;

      log.debug(
        {
          latencyMs,
          audioBytes: audio.byteLength,
          voice: resolvedVoice,
          textLen: text.length,
        },
        `Local TTS synthesized in ${latencyMs}ms`
      );

      return audio;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        log.warn({ timeoutMs: this.timeoutMs, textLen: text.length }, 'Local TTS synthesis timeout');
      } else {
        log.warn({ error: String(error), url }, 'Local TTS synthesis error');
      }
      return new ArrayBuffer(0);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Check if the local TTS server is reachable.
   */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Estimate audio duration from text length.
   */
  estimateDuration(text: string): number {
    const words = Math.ceil(text.length / CHARS_PER_WORD);
    const minutes = words / WORDS_PER_MINUTE;
    return Math.round(minutes * 60 * 1000);
  }

  /**
   * Resolve a Cartesia UUID or persona name to a local voice ID.
   */
  private resolveVoiceId(voiceId: string): string {
    // Check persona mapping first
    const key = voiceId.toLowerCase().replace(/_/g, '-');
    const mapped = PERSONA_TO_LOCAL_VOICE[key];
    if (mapped) return mapped;

    // If it looks like a Cartesia UUID, use the default voice
    if (voiceId.includes('-') && voiceId.length > 20) {
      return this.defaultVoice;
    }

    // Pass through as-is (might be a custom local voice ID)
    return voiceId;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let providerInstance: LocalTTSProvider | null = null;

export function getLocalTTSProvider(config?: LocalTTSProviderConfig): ITTSProvider {
  if (!providerInstance) {
    providerInstance = new LocalTTSProvider(config);
  }
  return providerInstance;
}

export function resetLocalTTSProvider(): void {
  providerInstance = null;
}

export function createLocalTTSProvider(config?: LocalTTSProviderConfig): ITTSProvider {
  return new LocalTTSProvider(config);
}
