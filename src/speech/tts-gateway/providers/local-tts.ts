/**
 * Local TTS Provider
 *
 * ITTSProvider implementation for local TTS servers running on-device.
 * Supports two API formats:
 *
 *   'custom':  POST /synthesize  { text, voice_id }  -> s16le PCM
 *   'openai':  POST /v1/audio/speech  { input, voice }  -> WAV or f32le PCM
 *
 * Works with:
 *   - Qwen3-TTS MLX Python server  (custom API, s16le PCM)
 *   - Rust MLX Omni server          (openai API, WAV f32)
 *   - Rust Candle server             (openai API, raw f32le)
 *   - Kokoro-82M                     (custom API, s16le PCM)
 *   - Any server implementing either contract
 *
 * Env:
 *   TTS_PROVIDER=local
 *   LOCAL_TTS_URL=http://127.0.0.1:8501  (default)
 *   LOCAL_TTS_VOICE=default               (default voice ID)
 *   LOCAL_TTS_API=custom|openai           (default: custom)
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

/** API format: 'custom' = POST /synthesize, 'openai' = POST /v1/audio/speech */
export type LocalTTSApiFormat = 'custom' | 'openai';

export interface LocalTTSProviderConfig {
  /** HTTP base URL for the local TTS server (default: LOCAL_TTS_URL env or http://127.0.0.1:8501) */
  serverUrl?: string;
  /** Default voice ID when none specified (default: LOCAL_TTS_VOICE env or 'default') */
  defaultVoice?: string;
  /** Expected sample rate of returned PCM (default: 24000) */
  sampleRate?: number;
  /** Request timeout in ms (default: 15000) */
  timeoutMs?: number;
  /** API format: 'custom' for Python servers, 'openai' for Rust servers (default: LOCAL_TTS_API env or 'custom') */
  apiFormat?: LocalTTSApiFormat;
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
  private readonly apiFormat: LocalTTSApiFormat;

  constructor(config: LocalTTSProviderConfig = {}) {
    this.serverUrl = (
      config.serverUrl ||
      process.env.LOCAL_TTS_URL ||
      DEFAULT_URL
    ).replace(/\/$/, ''); // strip trailing slash

    this.defaultVoice = config.defaultVoice || process.env.LOCAL_TTS_VOICE || 'default';
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.timeoutMs = config.timeoutMs ?? SYNTHESIZE_TIMEOUT_MS;
    this.apiFormat = config.apiFormat ||
      (process.env.LOCAL_TTS_API as LocalTTSApiFormat | undefined) ||
      'custom';

    log.info(
      { serverUrl: this.serverUrl, defaultVoice: this.defaultVoice, sampleRate: this.sampleRate, apiFormat: this.apiFormat },
      'LocalTTSProvider initialized'
    );
  }

  /**
   * Synthesize text to s16le PCM audio via local HTTP server.
   *
   * custom API:  POST /synthesize         { text, voice_id, sample_rate }
   * openai API:  POST /v1/audio/speech    { input, voice, model }
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
    const { url, body } = this.apiFormat === 'openai'
      ? this.buildOpenAIRequest(text.trim(), resolvedVoice)
      : this.buildCustomRequest(text.trim(), resolvedVoice, prosody);

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

      const rawAudio = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') ?? '';

      // OpenAI API returns WAV or raw f32le — convert to s16le
      const audio = this.apiFormat === 'openai'
        ? convertResponseToS16le(rawAudio, contentType)
        : rawAudio;

      const latencyMs = Date.now() - startMs;

      log.debug(
        {
          latencyMs,
          audioBytes: audio.byteLength,
          voice: resolvedVoice,
          textLen: text.length,
          apiFormat: this.apiFormat,
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
   * Stream audio generation via chunked HTTP response from local TTS server.
   *
   * Collects text from the input stream (Rust server needs full text), then
   * POSTs to /v1/audio/speech/stream and yields s16le PCM chunks as they
   * arrive. Only supported for 'openai' API format; falls back to batch
   * synthesize() for 'custom' API format.
   */
  async *synthesizeStream(
    textStream: AsyncIterable<string>,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): AsyncGenerator<ArrayBuffer> {
    // Collect text from LLM stream — our Rust server needs the full text
    let text = '';
    for await (const chunk of textStream) {
      text += chunk;
    }
    text = text.trim();

    if (!text) return;

    // Streaming endpoint only available for openai API format
    if (this.apiFormat !== 'openai') {
      const audio = await this.synthesize(text, voiceId, prosody);
      if (audio.byteLength > 0) yield audio;
      return;
    }

    const resolvedVoice = this.resolveVoiceId(voiceId);
    const url = `${this.serverUrl}/v1/audio/speech/stream`;
    const controller = new AbortController();
    // Double the timeout for streaming (audio arrives over time)
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const startMs = Date.now();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: resolvedVoice,
          model: 'tts-1',
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        log.warn(
          { status: response.status, error: errText.slice(0, 200), url },
          'Local TTS streaming failed, falling back to batch'
        );
        const audio = await this.synthesize(text, voiceId, prosody);
        if (audio.byteLength > 0) yield audio;
        return;
      }

      let firstChunk = true;
      let totalBytes = 0;
      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value && value.byteLength > 0) {
            if (firstChunk) {
              const ttfaMs = Date.now() - startMs;
              log.info(
                { ttfaMs, chunkBytes: value.byteLength, voice: resolvedVoice },
                `Local TTS stream TTFA: ${ttfaMs}ms`
              );
              firstChunk = false;
            }

            totalBytes += value.byteLength;
            // Server sends s16le PCM directly — no conversion needed
            yield value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
          }
        }
      } finally {
        reader.releaseLock();
      }

      const totalMs = Date.now() - startMs;
      log.debug(
        { totalMs, totalBytes, voice: resolvedVoice, textLen: text.length },
        `Local TTS stream complete in ${totalMs}ms`
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        log.warn({ timeoutMs: this.timeoutMs * 2, textLen: text.length }, 'Local TTS stream timeout');
      } else {
        log.warn({ error: String(error), url }, 'Local TTS stream error');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // --------------------------------------------------------------------------
  // Request builders
  // --------------------------------------------------------------------------

  private buildCustomRequest(text: string, voice: string, prosody?: SSMLProsodyConfig) {
    return {
      url: `${this.serverUrl}/synthesize`,
      body: JSON.stringify({
        text,
        voice_id: voice,
        sample_rate: this.sampleRate,
        ...(prosody?.emotion ? { emotion: prosody.emotion } : {}),
        ...(prosody?.speed ? { speed: prosody.speed } : {}),
      }),
    };
  }

  private buildOpenAIRequest(text: string, voice: string) {
    return {
      url: `${this.serverUrl}/v1/audio/speech`,
      body: JSON.stringify({
        input: text,
        voice,
        model: 'tts-1',
      }),
    };
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
// AUDIO FORMAT CONVERSION (OpenAI API responses → s16le PCM)
// ============================================================================

/**
 * Convert an OpenAI-style TTS response to s16le PCM.
 * Auto-detects WAV (from rust-mlx-omni) vs raw f32le (from rust-perf).
 */
function convertResponseToS16le(raw: ArrayBuffer, contentType: string): ArrayBuffer {
  if (raw.byteLength === 0) return raw;

  if (contentType.includes('audio/wav') || isWavBuffer(raw)) {
    return convertWavToS16le(raw);
  }

  // Assume raw f32le PCM (4 bytes per sample)
  return convertF32leToS16le(raw);
}

/** Check for RIFF/WAVE magic bytes. */
function isWavBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const view = new DataView(buf);
  // "RIFF" at 0, "WAVE" at 8
  return (
    view.getUint32(0, false) === 0x52494646 &&
    view.getUint32(8, false) === 0x57415645
  );
}

/** Convert f32le PCM [-1.0, 1.0] to s16le PCM. */
export function convertF32leToS16le(f32Buffer: ArrayBuffer): ArrayBuffer {
  const f32 = new Float32Array(f32Buffer);
  const s16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, f32[i]));
    s16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return s16.buffer;
}

/**
 * Extract audio data from a WAV file and convert to s16le PCM.
 * Handles IEEE float (format 3) and PCM integer (format 1) WAV.
 */
export function convertWavToS16le(wavBuffer: ArrayBuffer): ArrayBuffer {
  if (wavBuffer.byteLength < 44) return wavBuffer;

  const view = new DataView(wavBuffer);
  let audioFormat = 1; // 1=PCM int, 3=IEEE float
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;

  // Walk sub-chunks after RIFF header (12 bytes)
  let offset = 12;
  while (offset < view.byteLength - 8) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (id === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, wavBuffer.byteLength - dataOffset);
      break;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset += 1; // WAV chunks are word-aligned
  }

  if (dataOffset === 0 || dataSize === 0) return wavBuffer;

  const audioData = wavBuffer.slice(dataOffset, dataOffset + dataSize);

  // IEEE float 32-bit → convert to s16le
  if (audioFormat === 3 && bitsPerSample === 32) {
    return convertF32leToS16le(audioData);
  }

  // Already s16le PCM → return as-is
  if (audioFormat === 1 && bitsPerSample === 16) {
    return audioData;
  }

  // 32-bit integer PCM → downsample to s16
  if (audioFormat === 1 && bitsPerSample === 32) {
    const i32 = new Int32Array(audioData);
    const s16 = new Int16Array(i32.length);
    for (let i = 0; i < i32.length; i++) {
      s16[i] = (i32[i] >> 16) & 0xffff;
    }
    return s16.buffer;
  }

  return audioData;
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
