/**
 * Qwen3-TTS Client
 *
 * Client for the Qwen3-TTS-1.7B text-to-speech model.
 * Supports:
 * - Voice cloning from 3-second reference audio
 * - Voice design from natural language descriptions
 * - Emotion/tone control via `instruct` parameter
 * - Streaming synthesis
 * - Reusable voice clone prompts for efficiency
 *
 * Latency target: 97ms first-packet (per Qwen3-TTS benchmark)
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../utils/safe-logger.js';
import { getQwen3OmniConfig } from './config.js';
import type {
  Qwen3TTSConfig,
  TTSSynthesisRequest,
  TTSSynthesisResult,
  VoiceCloneResult,
} from './types.js';

const log = createLogger({ module: 'qwen3-tts-client' });

// =============================================================================
// VOICE CLONE CACHE
// =============================================================================

interface CachedVoicePrompt {
  personaId: string;
  /** Serialized prompt items from create_voice_clone_prompt() */
  promptData: unknown;
  /** When this clone was generated */
  createdAt: Date;
  /** Quality score if available */
  qualityScore?: number;
}

// =============================================================================
// QWEN3-TTS CLIENT
// =============================================================================

export class Qwen3TTSClient extends EventEmitter {
  private serverUrl: string;
  private language: string;
  private voiceCloneCache: Map<string, CachedVoicePrompt> = new Map();
  private isReady = false;
  private requestCount = 0;
  private totalLatencyMs = 0;

  constructor(config?: Partial<Qwen3TTSConfig>) {
    super();
    const omniConfig = getQwen3OmniConfig();
    this.serverUrl = config?.serverUrl || omniConfig.ttsServerUrl;
    this.language = config?.language || 'English';
  }

  // ===========================================================================
  // VOICE CLONING
  // ===========================================================================

  /**
   * Clone a voice from a reference audio sample.
   * Qwen3-TTS requires only ~3 seconds of reference audio.
   *
   * The cloned voice prompt is cached for reuse across synthesis calls.
   */
  async cloneVoice(
    personaId: string,
    referenceAudioPath: string,
    referenceTranscript: string
  ): Promise<VoiceCloneResult> {
    const startTime = Date.now();

    log.info({ personaId, referenceAudioPath }, 'Cloning voice for persona');

    try {
      // Call the TTS server's voice clone endpoint
      const response = await fetch(`${this.serverUrl}/v1/voice/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: personaId,
          ref_audio: referenceAudioPath,
          ref_text: referenceTranscript,
          language: this.language,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice clone failed ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as {
        prompt_data: unknown;
        ref_duration_sec: number;
        quality_score: number;
      };

      // Cache the voice clone prompt for reuse
      this.voiceCloneCache.set(personaId, {
        personaId,
        promptData: result.prompt_data,
        createdAt: new Date(),
        qualityScore: result.quality_score,
      });

      const cloneResult: VoiceCloneResult = {
        personaId,
        promptPath: `cached:${personaId}`,
        refDurationSec: result.ref_duration_sec,
        qualityScore: result.quality_score,
        success: true,
      };

      log.info(
        {
          personaId,
          durationMs: Date.now() - startTime,
          refDurationSec: result.ref_duration_sec,
          qualityScore: result.quality_score,
        },
        'Voice cloned successfully'
      );

      this.emit('voiceCloned', cloneResult);
      return cloneResult;
    } catch (error) {
      log.error({ error: String(error), personaId }, 'Voice cloning failed');

      return {
        personaId,
        promptPath: '',
        refDurationSec: 0,
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Design a voice from a natural language description.
   * Fallback when no reference audio is available.
   */
  async designVoice(personaId: string, description: string): Promise<VoiceCloneResult> {
    const startTime = Date.now();

    log.info({ personaId, descriptionLength: description.length }, 'Designing voice for persona');

    try {
      const response = await fetch(`${this.serverUrl}/v1/voice/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: personaId,
          description,
          language: this.language,
          // Generate a sample to create the cached prompt
          sample_text: 'Hello, how are you doing today? I am here to help.',
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice design failed ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as {
        prompt_data: unknown;
        quality_score: number;
      };

      // Cache
      this.voiceCloneCache.set(personaId, {
        personaId,
        promptData: result.prompt_data,
        createdAt: new Date(),
        qualityScore: result.quality_score,
      });

      return {
        personaId,
        promptPath: `designed:${personaId}`,
        refDurationSec: 0,
        qualityScore: result.quality_score,
        success: true,
      };
    } catch (error) {
      log.error({ error: String(error), personaId }, 'Voice design failed');

      return {
        personaId,
        promptPath: '',
        refDurationSec: 0,
        success: false,
        error: String(error),
      };
    }
  }

  // ===========================================================================
  // SYNTHESIS
  // ===========================================================================

  /**
   * Synthesize text to speech using a cloned persona voice.
   * Uses the cached voice clone prompt for the persona.
   */
  async synthesize(request: TTSSynthesisRequest): Promise<TTSSynthesisResult> {
    const startTime = Date.now();

    const cachedVoice = this.voiceCloneCache.get(request.personaId);

    try {
      const response = await fetch(`${this.serverUrl}/v1/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          persona_id: request.personaId,
          language: request.language || this.language,
          instruct: request.instruct,
          voice_clone_prompt: cachedVoice?.promptData || null,
          streaming: request.streaming ?? false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS synthesis failed ${response.status}: ${errorText}`);
      }

      // Get audio data
      const audioBuffer = await response.arrayBuffer();
      const audioData = new Uint8Array(audioBuffer);

      const latency = Date.now() - startTime;
      this.requestCount++;
      this.totalLatencyMs += latency;

      const result: TTSSynthesisResult = {
        audioData,
        sampleRate: 24000,
        latencyMs: latency,
        text: request.text,
      };

      this.emit('synthesis', { latencyMs: latency, textLength: request.text.length });
      return result;
    } catch (error) {
      log.error(
        {
          error: String(error),
          personaId: request.personaId,
          textLength: request.text.length,
        },
        'TTS synthesis failed'
      );
      throw error;
    }
  }

  /**
   * Stream synthesized audio chunks.
   * For lower latency, audio is streamed as it's generated.
   */
  async *streamSynthesize(request: TTSSynthesisRequest): AsyncGenerator<Uint8Array> {
    const cachedVoice = this.voiceCloneCache.get(request.personaId);

    const response = await fetch(`${this.serverUrl}/v1/tts/synthesize/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: request.text,
        persona_id: request.personaId,
        language: request.language || this.language,
        instruct: request.instruct,
        voice_clone_prompt: cachedVoice?.promptData || null,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS streaming failed ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for TTS streaming');
    }

    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Check TTS server health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      this.isReady = response.ok;
      return this.isReady;
    } catch {
      this.isReady = false;
      return false;
    }
  }

  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Check if a voice clone is cached for a persona
   */
  hasVoiceClone(personaId: string): boolean {
    return this.voiceCloneCache.has(personaId);
  }

  /**
   * Get all cached persona voice IDs
   */
  getCachedPersonas(): string[] {
    return Array.from(this.voiceCloneCache.keys());
  }

  /**
   * Clear the voice clone cache (forces re-cloning on next use)
   */
  clearCache(): void {
    this.voiceCloneCache.clear();
    log.info('Voice clone cache cleared');
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get ready(): boolean {
    return this.isReady;
  }

  get avgLatencyMs(): number {
    return this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0;
  }

  get cacheSize(): number {
    return this.voiceCloneCache.size;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a Qwen3-TTS client
 */
export function createQwen3TTSClient(config?: Partial<Qwen3TTSConfig>): Qwen3TTSClient {
  return new Qwen3TTSClient(config);
}
