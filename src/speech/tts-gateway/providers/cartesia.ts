/**
 * Cartesia TTS Provider
 *
 * Implementation of ITTSProvider for Cartesia's TTS API.
 * Uses the bytes API (non-streaming) for reliable SSML/prosody support.
 *
 * Why bytes API over streaming?
 * - No token fragmentation issues
 * - Full SSML/prosody support
 * - Consistent audio quality
 * - Better error handling
 *
 * The tradeoff is slightly higher latency for first byte, but this is
 * mitigated by caching.
 *
 * @module speech/tts-gateway/providers/cartesia
 */

/* global AbortController */

import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  CARTESIA_MODEL,
  CARTESIA_API_URL,
  CARTESIA_API_VERSION,
  getVoiceIdForPersona,
  isValidVoiceId,
} from '../../../config/voice-ids.js';

const log = createLogger({ module: 'CartesiaTTSProvider' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Bytes API endpoint */
const BYTES_ENDPOINT = '/tts/bytes';

/** Default audio format for Cartesia */
const DEFAULT_OUTPUT_FORMAT = {
  container: 'raw',
  encoding: 'pcm_s16le',
  sample_rate: 24000,
} as const;

/** Words per minute for duration estimation */
const WORDS_PER_MINUTE = 150;

/** Characters per word for estimation */
const CHARS_PER_WORD = 5;

// ============================================================================
// CARTESIA PROVIDER CLASS
// ============================================================================

/**
 * Cartesia TTS Provider configuration
 */
export interface CartesiaProviderConfig {
  /** API key (defaults to CARTESIA_API_KEY env var) */
  apiKey?: string;
  /** API URL (defaults to CARTESIA_API_URL) */
  apiUrl?: string;
  /** API version (defaults to CARTESIA_API_VERSION) */
  apiVersion?: string;
  /** Model ID (defaults to CARTESIA_MODEL) */
  modelId?: string;
  /** Sample rate (defaults to 24000) */
  sampleRate?: number;
  /** Request timeout in ms (defaults to 30000) */
  timeoutMs?: number;
  /**
   * Throw errors instead of returning empty buffer (default: false)
   *
   * When false (default): Errors are logged and empty ArrayBuffer is returned.
   * This provides graceful degradation but can hide issues.
   *
   * When true: Errors are thrown for better debugging and explicit error handling.
   * Recommended for development and when explicit error handling is needed.
   */
  throwOnError?: boolean;
}

/**
 * Cartesia TTS Provider implementation
 *
 * Uses Cartesia's bytes API for reliable audio generation.
 */
export class CartesiaTTSProvider implements ITTSProvider {
  readonly name = 'cartesia';

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly apiVersion: string;
  private readonly modelId: string;
  private readonly sampleRate: number;
  private readonly timeoutMs: number;
  private readonly throwOnError: boolean;

  constructor(config: CartesiaProviderConfig = {}) {
    const envApiKey = process.env.CARTESIA_API_KEY;

    this.apiKey = config.apiKey || envApiKey || '';
    this.apiUrl = config.apiUrl || CARTESIA_API_URL || 'https://api.cartesia.ai';
    this.apiVersion = config.apiVersion || CARTESIA_API_VERSION || '2024-06-10';
    this.modelId = config.modelId || CARTESIA_MODEL || 'sonic-3-latest';
    this.sampleRate = config.sampleRate || 24000;
    this.timeoutMs = config.timeoutMs || 30000;
    this.throwOnError = config.throwOnError ?? false;

    if (!this.apiKey) {
      log.warn({}, 'CARTESIA_API_KEY not set - TTS will return empty audio');
    }
  }

  /**
   * Synthesize text to audio
   *
   * @param text - Clean text to synthesize (no SSML - should be pre-processed)
   * @param voiceId - Voice identifier (Cartesia UUID or persona name)
   * @param prosody - Optional prosody configuration
   * @returns Generated audio buffer
   */
  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<ArrayBuffer> {
    if (!this.apiKey) {
      const message = 'CARTESIA_API_KEY not configured';
      log.warn({ text: text.slice(0, 50) }, message);
      if (this.throwOnError) {
        throw new Error(message);
      }
      return new ArrayBuffer(0);
    }

    if (!text.trim()) {
      log.debug({}, 'Empty text, returning empty buffer');
      return new ArrayBuffer(0);
    }

    const startTime = Date.now();

    // Resolve voice ID (might be persona name like 'ferni')
    const resolvedVoiceId = this.resolveVoiceId(voiceId);

    try {
      const requestBody = this.buildRequestBody(text, resolvedVoiceId, prosody);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.apiUrl}${BYTES_ENDPOINT}`, {
          method: 'POST',
          headers: {
            'X-API-Key': this.apiKey,
            'Cartesia-Version': this.apiVersion,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const errorMessage = `Cartesia API error: ${response.status} - ${errorText.slice(0, 200)}`;
          log.warn(
            {
              status: response.status,
              error: errorText.slice(0, 200),
              text: text.slice(0, 50),
              voiceId: resolvedVoiceId,
            },
            'Cartesia API error'
          );
          if (this.throwOnError) {
            throw new Error(errorMessage);
          }
          return new ArrayBuffer(0);
        }

        const audioBuffer = await response.arrayBuffer();
        const durationMs = Date.now() - startTime;

        log.debug(
          {
            text: text.slice(0, 50),
            voiceId: resolvedVoiceId,
            audioBytes: audioBuffer.byteLength,
            durationMs,
            hadProsody: !!prosody,
          },
          '✅ Cartesia TTS generated'
        );

        return audioBuffer;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('aborted')) {
        log.warn(
          { text: text.slice(0, 50), timeoutMs: this.timeoutMs },
          'Cartesia TTS request timed out'
        );
        if (this.throwOnError) {
          throw new Error(`Cartesia TTS request timed out after ${this.timeoutMs}ms`);
        }
      } else {
        log.error(
          { error: errorMessage, text: text.slice(0, 50) },
          'Cartesia TTS synthesis failed'
        );
        if (this.throwOnError) {
          throw error;
        }
      }

      return new ArrayBuffer(0);
    }
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Simple health check - try to get voices list
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${this.apiUrl}/voices`, {
          method: 'GET',
          headers: {
            'X-API-Key': this.apiKey,
            'Cartesia-Version': this.apiVersion,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }

  /**
   * Estimate audio duration from text
   *
   * Uses words-per-minute estimation.
   * More accurate than byte-counting.
   *
   * @param text - Text to estimate
   * @returns Estimated duration in milliseconds
   */
  estimateDuration(text: string): number {
    // Count words (approximate)
    const words = Math.ceil(text.length / CHARS_PER_WORD);
    // Words per minute to milliseconds
    const minutes = words / WORDS_PER_MINUTE;
    return Math.round(minutes * 60 * 1000);
  }

  /**
   * Resolve voice ID from persona name or validate UUID
   */
  private resolveVoiceId(voiceIdOrPersona: string): string {
    // Check if it's already a valid Cartesia UUID
    if (isValidVoiceId(voiceIdOrPersona)) {
      return voiceIdOrPersona;
    }

    // Try to resolve persona name
    const resolved = getVoiceIdForPersona(voiceIdOrPersona);
    if (!isValidVoiceId(resolved)) {
      log.warn(
        { input: voiceIdOrPersona, resolved },
        'Could not resolve to valid voice ID, using as-is'
      );
      return voiceIdOrPersona;
    }

    return resolved;
  }

  /**
   * Build Cartesia API request body
   */
  private buildRequestBody(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model_id: this.modelId,
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
      },
      output_format: {
        ...DEFAULT_OUTPUT_FORMAT,
        sample_rate: this.sampleRate,
      },
      language: 'en',
    };

    // Apply prosody configuration if provided
    // Note: Cartesia's bytes API supports speed via generation config
    if (prosody) {
      if (prosody.speed !== undefined && prosody.speed !== 1.0) {
        // Cartesia uses speed in generation_config
        body.generation_config = {
          ...((body.generation_config as Record<string, unknown>) || {}),
          speed: prosody.speed,
        };
      }

      // Emotion is handled via voice embedding, not API parameter
      // We log it for debugging but can't directly apply it in bytes API
      if (prosody.emotion) {
        log.debug(
          { emotion: prosody.emotion, intensity: prosody.emotionIntensity },
          'Emotion specified in prosody (requires voice embedding adjustment)'
        );
      }

      // Volume would be applied post-processing, not in API
      if (prosody.volume !== undefined && prosody.volume !== 1.0) {
        log.debug(
          { volume: prosody.volume },
          'Volume specified in prosody (requires post-processing)'
        );
      }
    }

    return body;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let providerInstance: CartesiaTTSProvider | null = null;
let providerConfig: CartesiaProviderConfig | undefined;

/**
 * Get the singleton Cartesia provider instance
 *
 * Note: First call with config sets the configuration. Subsequent calls
 * with different config will log a warning but use the existing instance.
 * Use createCartesiaProvider() for a fresh instance with different config.
 */
export function getCartesiaProvider(config?: CartesiaProviderConfig): ITTSProvider {
  if (!providerInstance) {
    providerInstance = new CartesiaTTSProvider(config);
    providerConfig = config;
  } else if (config && providerConfig) {
    // Warn if config differs (common bug: expecting new config to take effect)
    const configDiffers =
      config.apiKey !== providerConfig.apiKey ||
      config.apiUrl !== providerConfig.apiUrl ||
      config.modelId !== providerConfig.modelId;

    if (configDiffers) {
      log.warn(
        { existingModel: providerConfig.modelId, newModel: config.modelId },
        'getCartesiaProvider called with different config - using existing instance. ' +
          'Use createCartesiaProvider() for a new instance.'
      );
    }
  }
  return providerInstance;
}

/**
 * Reset the singleton provider (for testing)
 */
export function resetCartesiaProvider(): void {
  providerInstance = null;
  providerConfig = undefined;
}

/**
 * Create a new Cartesia provider instance (for testing or custom config)
 */
export function createCartesiaProvider(config?: CartesiaProviderConfig): ITTSProvider {
  return new CartesiaTTSProvider(config);
}
