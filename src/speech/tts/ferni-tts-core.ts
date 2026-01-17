/**
 * Ferni TTS Core - Custom SSML + Superhuman TTS Integration
 *
 * This module provides TTS using Ferni's custom Rust-based TTS service,
 * which includes full W3C SSML 1.1 support and 8 "Better than Human" transforms.
 *
 * Features:
 * - Full W3C SSML 1.1 support (speak, voice, prosody, break, emphasis, etc.)
 * - Ferni SSML extensions (emotion, memory, breath, backchannel, silence)
 * - 8 Superhuman transforms:
 *   1. Circadian Rhythm (tempo based on time of day)
 *   2. Memory Prosody (emphasize remembered entities)
 *   3. Emotional Anticipation (express emotion before content)
 *   4. Meaningful Silence (strategic pauses)
 *   5. Relationship Prosody (warmth based on relationship stage)
 *   6. Energy Matching (mirror user's energy)
 *   7. Backchannels (natural "hmm", "uh-huh" sounds)
 *   8. Breath Patterns (natural breathing rhythm)
 *
 * @module @ferni/speech/tts/ferni-tts-core
 */

import { AudioFrame } from '@livekit/rtc-node';
import { tts } from '@livekit/agents';
import type { PrewarmState, TTSOptions } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ferni-tts' });

// Import SynthesizedAudio type for LiveKit compatibility
type SynthesizedAudio = {
  requestId: string;
  segmentId: string;
  frame: AudioFrame;
  deltaText?: string;
  final: boolean;
};

// Generate short unique IDs for request/segment tracking
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Ferni TTS-specific options
 */
export interface FerniTTSOptions extends TTSOptions {
  /** Ferni TTS server endpoint */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
}

/**
 * Superhuman context passed to Ferni TTS for prosody transforms
 * Matches the Rust SuperhumanContext struct
 */
export interface FerniSuperhumanContext {
  /** User's local hour (0-23) for circadian rhythm */
  userLocalHour?: number;
  /** Relationship stage (0.0-1.0, where 1.0 = deep trust) */
  relationshipStage?: number;
  /** User's current energy level (0.0-1.0) */
  userEnergy?: number;
  /** User's detected emotion and intensity */
  userEmotion?: [string, number];
  /** Topic sensitivity (0.0-1.0) */
  topicSensitivity?: number;
  /** Emotional trajectory: building_to_joy, moving_toward_peace, etc. */
  emotionalTrajectory?: string;
  /** Turn number in conversation */
  turnNumber?: number;
  /** User's speaking rate multiplier */
  userSpeakingRate?: number;
  /** Remembered entities to emphasize */
  rememberedEntities?: RememberedEntity[];
}

/**
 * Entity remembered from user's memory to emphasize in speech
 */
export interface RememberedEntity {
  name: string;
  entityType: 'person' | 'place' | 'project' | 'pet' | 'other';
  familiarity: number; // 0.0-1.0
  emotionalValence: number; // -1.0 to 1.0
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_NUM_CHANNELS = 1;
const CHUNK_SIZE_SAMPLES = 4800; // 200ms at 24kHz

/**
 * Default Ferni TTS endpoint
 */
export const DEFAULT_FERNI_TTS_ENDPOINT =
  process.env.FERNI_TTS_ENDPOINT || 'http://localhost:8080';

/**
 * Ferni persona voice mappings
 */
export const FERNI_TTS_VOICE_IDS = {
  FERNI: 'ferni',
  PETER_JOHN: 'peter',
  ALEX_CHEN: 'alex',
  MAYA_SANTOS: 'maya',
  JORDAN_TAYLOR: 'jordan',
  NAYAN_PATEL: 'nayan',
} as const;

// ============================================================================
// PREWARM STATE
// ============================================================================

let _prewarmState: PrewarmState | null = null;
let _isPrewarming = false;
let _prewarmPromise: Promise<void> | null = null;

// ============================================================================
// FERNI TTS CLASS
// ============================================================================

/**
 * Ferni TTS adapter - drop-in replacement for Cartesia/BTCW TTS
 *
 * Provides streaming TTS using Ferni's custom Rust service with
 * full SSML support and superhuman prosody transforms.
 */
export class FerniTTS {
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly streaming = true;

  #endpoint: string;
  #voiceId: string;
  #superhumanContext?: FerniSuperhumanContext;
  #apiKey?: string;

  constructor(options: FerniTTSOptions & { voice: string }) {
    this.#endpoint = options.endpoint || DEFAULT_FERNI_TTS_ENDPOINT;
    this.#voiceId = options.voice;
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
    this.numChannels = 1; // Ferni TTS outputs mono
    this.#apiKey = options.apiKey || process.env.FERNI_TTS_API_KEY;
  }

  /**
   * Get authentication headers for API requests
   */
  #getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.#apiKey) {
      headers['Authorization'] = `Bearer ${this.#apiKey}`;
    }

    return headers;
  }

  /**
   * Set superhuman context for prosody transforms
   */
  setSuperhumanContext(context: FerniSuperhumanContext): void {
    this.#superhumanContext = context;
  }

  /**
   * Create a streaming synthesis session
   * Compatible with Cartesia/BTCW's stream() method
   */
  stream(): FerniTTSSynthesizeStream {
    return new FerniTTSSynthesizeStream(
      this.#endpoint,
      this.#voiceId,
      this.sampleRate,
      this.numChannels,
      this.#superhumanContext,
      this.#getAuthHeaders()
    );
  }

  /**
   * Synthesize text (non-streaming)
   */
  async synthesize(text: string): Promise<FerniTTSChunkedStream> {
    return new FerniTTSChunkedStream(
      this.#endpoint,
      this.#voiceId,
      text,
      this.sampleRate,
      this.numChannels,
      this.#superhumanContext,
      this.#getAuthHeaders()
    );
  }

  /**
   * Synthesize SSML (non-streaming)
   */
  async synthesizeSSML(ssml: string): Promise<FerniTTSChunkedStream> {
    return new FerniTTSChunkedStream(
      this.#endpoint,
      this.#voiceId,
      ssml,
      this.sampleRate,
      this.numChannels,
      this.#superhumanContext,
      this.#getAuthHeaders(),
      true // isSSML
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; backend: string }> {
    const response = await fetch(`${this.#endpoint}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    const result = await response.json();
    return {
      status: result.status,
      backend: result.backend || 'unknown',
    };
  }

  /**
   * List available voices
   */
  async listVoices(): Promise<Array<{ id: string; name: string; style: string }>> {
    const response = await fetch(`${this.#endpoint}/v1/voices`);
    if (!response.ok) {
      throw new Error(`List voices failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Get current voice ID
   */
  get voiceId(): string {
    return this.#voiceId;
  }

  /**
   * Get server endpoint
   */
  get endpoint(): string {
    return this.#endpoint;
  }
}

// ============================================================================
// STREAMING IMPLEMENTATION
// ============================================================================

/**
 * Streaming synthesis stream - compatible with LiveKit's SynthesizeStream
 * Yields SynthesizedAudio objects that LiveKit expects
 */
export class FerniTTSSynthesizeStream
  implements AsyncIterable<SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM>
{
  #endpoint: string;
  #voiceId: string;
  #sampleRate: number;
  #numChannels: number;
  #superhumanContext?: FerniSuperhumanContext;
  #authHeaders: Record<string, string>;

  #inputEnded = false;
  #textQueue: string[] = [];
  #eventQueue: (SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM)[] = [];
  #resolveWait: (() => void) | null = null;
  #abortController: AbortController | null = null;
  #processing = false;
  #requestId: string = generateId();
  #segmentId: string = generateId();

  constructor(
    endpoint: string,
    voiceId: string,
    sampleRate: number,
    numChannels: number,
    superhumanContext?: FerniSuperhumanContext,
    authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  ) {
    this.#endpoint = endpoint;
    this.#voiceId = voiceId;
    this.#sampleRate = sampleRate;
    this.#numChannels = numChannels;
    this.#superhumanContext = superhumanContext;
    this.#authHeaders = authHeaders;
  }

  /**
   * Push text to be synthesized (matches Cartesia API)
   */
  pushText(text: string): void {
    if (this.#inputEnded) {
      throw new Error('Cannot push text after endInput() called');
    }
    if (!text || typeof text !== 'string') {
      log.warn('pushText called with invalid text - skipping');
      return;
    }
    if (!text.trim()) {
      log.warn('pushText called with empty/whitespace text - skipping');
      return;
    }
    this.#textQueue.push(text);
    this.#processNextText();
  }

  /**
   * Signal end of input (matches Cartesia API)
   */
  endInput(): void {
    this.#inputEnded = true;
    if (!this.#processing && this.#textQueue.length === 0) {
      this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
      this.#notifyWaiter();
    }
  }

  /**
   * Update the input stream with new text (required by LiveKit agents)
   */
  updateInputStream(textOrStream: string | ReadableStream<string>): void {
    if (textOrStream && typeof textOrStream === 'object' && 'getReader' in textOrStream) {
      log.debug('Received ReadableStream - reading text chunks');
      this.#consumeTextStream(textOrStream as ReadableStream<string>);
      return;
    }

    let text = textOrStream as string;
    if (!text || typeof text !== 'string') {
      log.warn('updateInputStream called with invalid text - skipping');
      return;
    }
    if (!text.trim()) {
      log.warn('updateInputStream called with empty/whitespace text - skipping');
      return;
    }

    // Note: We preserve SSML - Ferni TTS handles it natively!
    this.#textQueue.length = 0;
    this.#textQueue.push(text);
    this.#processNextText();
  }

  /**
   * Consume a ReadableStream of text chunks and synthesize
   */
  async #consumeTextStream(stream: ReadableStream<string>): Promise<void> {
    const reader = stream.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value && typeof value === 'string') {
          buffer += value;

          // Check for sentence boundaries to send chunks
          const sentenceEnd = buffer.search(/[.!?,:;]\s+/);
          if (sentenceEnd !== -1) {
            const chunk = buffer.slice(0, sentenceEnd + 1).trim();
            buffer = buffer.slice(sentenceEnd + 1);

            if (chunk.length > 0) {
              log.debug({ chunk: chunk.slice(0, 50) }, 'Sending text chunk');
              this.#textQueue.push(chunk);
              this.#processNextText();
            }
          }
        }
      }

      // Send any remaining text
      if (buffer.trim().length > 0) {
        log.debug({ text: buffer.slice(0, 50) }, 'Sending final text');
        this.#textQueue.push(buffer.trim());
        this.#processNextText();
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Error reading text stream');
    } finally {
      reader.releaseLock();
      this.#inputEnded = true;
      if (!this.#processing && this.#textQueue.length === 0) {
        this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
        this.#notifyWaiter();
      }
    }
  }

  /**
   * Mark the end of the segment (required by LiveKit agents)
   */
  markSegmentEnd(): void {
    // No-op for HTTP-based synthesis
  }

  /**
   * Flush any buffered audio
   */
  flush(): void {
    // HTTP streaming doesn't buffer
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
  }

  #notifyWaiter(): void {
    if (this.#resolveWait) {
      this.#resolveWait();
      this.#resolveWait = null;
    }
  }

  async #processNextText(): Promise<void> {
    if (this.#processing || this.#textQueue.length === 0) return;
    this.#processing = true;

    while (this.#textQueue.length > 0) {
      const text = this.#textQueue.shift()!;
      const streamEndpoint = `${this.#endpoint}/v1/synthesize/stream`;
      this.#abortController = new AbortController();

      try {
        // Build request body with superhuman context
        const requestBody = {
          text,
          voice_id: this.#voiceId,
          sample_rate: this.#sampleRate,
          superhuman: this.#superhumanContext
            ? {
                user_local_hour: this.#superhumanContext.userLocalHour,
                relationship_stage: this.#superhumanContext.relationshipStage,
                user_energy: this.#superhumanContext.userEnergy,
                user_emotion: this.#superhumanContext.userEmotion,
                topic_sensitivity: this.#superhumanContext.topicSensitivity,
                emotional_trajectory: this.#superhumanContext.emotionalTrajectory,
                turn_number: this.#superhumanContext.turnNumber,
                user_speaking_rate: this.#superhumanContext.userSpeakingRate,
                remembered_entities: this.#superhumanContext.rememberedEntities?.map((e) => ({
                  name: e.name,
                  entity_type: e.entityType,
                  familiarity: e.familiarity,
                  emotional_valence: e.emotionalValence,
                })),
              }
            : undefined,
        };

        log.debug(
          {
            endpoint: streamEndpoint,
            textLength: text?.length,
            voice: this.#voiceId,
            hasSuperhumanContext: !!this.#superhumanContext,
          },
          'Sending streaming request to Ferni TTS'
        );

        const fetchStart = Date.now();
        const response = await fetch(streamEndpoint, {
          method: 'POST',
          headers: this.#authHeaders,
          body: JSON.stringify(requestBody),
          signal: this.#abortController.signal,
        });

        log.debug(
          { latencyMs: Date.now() - fetchStart, status: response.status },
          'Ferni TTS fetch completed'
        );

        if (!response.ok) {
          let errorDetails = '';
          try {
            errorDetails = await response.text();
          } catch {
            errorDetails = '(could not read response body)';
          }
          log.error(
            { status: response.status, statusText: response.statusText, body: errorDetails },
            'Ferni TTS HTTP error'
          );
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          log.error('No response body from Ferni TTS');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        // Collect ALL audio bytes, then chunk into consistent frame sizes
        const allChunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          allChunks.push(value);
          totalBytes += value.length;
        }

        // Combine all chunks
        const combinedBuffer = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of allChunks) {
          combinedBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Ensure complete Int16 samples
        const completeBytes = combinedBuffer.length - (combinedBuffer.length % 2);
        if (completeBytes === 0) {
          log.warn('No complete audio samples received from Ferni TTS');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        // Create properly aligned Int16Array
        const alignedBuffer = new ArrayBuffer(completeBytes);
        new Uint8Array(alignedBuffer).set(combinedBuffer.subarray(0, completeBytes));
        const allAudioData = new Int16Array(alignedBuffer);

        log.debug(
          {
            samples: allAudioData.length,
            durationSec: (allAudioData.length / this.#sampleRate).toFixed(2),
          },
          'Received audio from Ferni TTS'
        );

        // Chunk into consistent CHUNK_SIZE_SAMPLES frames
        const frames: AudioFrame[] = [];
        for (let i = 0; i < allAudioData.length; i += CHUNK_SIZE_SAMPLES) {
          const chunkData = allAudioData.slice(i, i + CHUNK_SIZE_SAMPLES);
          const samplesPerChannel = chunkData.length / this.#numChannels;

          const frame = new AudioFrame(
            chunkData,
            this.#sampleRate,
            this.#numChannels,
            samplesPerChannel
          );
          frames.push(frame);
        }

        log.debug({ frameCount: frames.length }, 'Created audio frames from Ferni TTS');

        // Push all frames
        for (let i = 0; i < frames.length; i++) {
          const isLastFrame = i === frames.length - 1;
          this.#eventQueue.push({
            requestId: this.#requestId,
            segmentId: this.#segmentId,
            frame: frames[i],
            final: isLastFrame,
          });
          this.#notifyWaiter();
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') break;
        log.error({ error: String(error) }, 'Ferni TTS synthesis error');
        this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
        this.#notifyWaiter();
      }
    }

    this.#processing = false;

    if (this.#inputEnded && this.#textQueue.length === 0) {
      this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
      this.#notifyWaiter();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<
    SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM
  > {
    this.#processNextText();

    while (true) {
      while (this.#eventQueue.length > 0) {
        const event = this.#eventQueue.shift()!;
        yield event;

        if (event === tts.SynthesizeStream.END_OF_STREAM) {
          this.close();
          return;
        }
      }

      if (this.#processing || this.#textQueue.length > 0 || !this.#inputEnded) {
        await new Promise<void>((resolve) => {
          this.#resolveWait = resolve;
        });
      } else {
        yield tts.SynthesizeStream.END_OF_STREAM;
        return;
      }
    }
  }
}

// ============================================================================
// CHUNKED STREAM (NON-STREAMING)
// ============================================================================

/**
 * Chunked audio stream for non-streaming synthesis
 */
export class FerniTTSChunkedStream implements AsyncIterable<SynthesizedAudio> {
  #endpoint: string;
  #voiceId: string;
  #text: string;
  #sampleRate: number;
  #numChannels: number;
  #superhumanContext?: FerniSuperhumanContext;
  #authHeaders: Record<string, string>;
  #isSSML: boolean;
  #requestId: string = generateId();
  #segmentId: string = generateId();

  constructor(
    endpoint: string,
    voiceId: string,
    text: string,
    sampleRate: number,
    numChannels: number,
    superhumanContext?: FerniSuperhumanContext,
    authHeaders: Record<string, string> = { 'Content-Type': 'application/json' },
    isSSML = false
  ) {
    this.#endpoint = endpoint;
    this.#voiceId = voiceId;
    this.#text = text;
    this.#sampleRate = sampleRate;
    this.#numChannels = numChannels;
    this.#superhumanContext = superhumanContext;
    this.#authHeaders = authHeaders;
    this.#isSSML = isSSML;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SynthesizedAudio> {
    // Use different endpoint for SSML vs plain text
    const synthesizeEndpoint = this.#isSSML
      ? `${this.#endpoint}/v1/synthesize/ssml`
      : `${this.#endpoint}/v1/synthesize`;

    try {
      const requestBody = this.#isSSML
        ? { ssml: this.#text, voice_id: this.#voiceId, sample_rate: this.#sampleRate }
        : {
            text: this.#text,
            voice_id: this.#voiceId,
            sample_rate: this.#sampleRate,
            superhuman: this.#superhumanContext
              ? {
                  user_local_hour: this.#superhumanContext.userLocalHour,
                  relationship_stage: this.#superhumanContext.relationshipStage,
                  user_energy: this.#superhumanContext.userEnergy,
                  user_emotion: this.#superhumanContext.userEmotion,
                  topic_sensitivity: this.#superhumanContext.topicSensitivity,
                  emotional_trajectory: this.#superhumanContext.emotionalTrajectory,
                  turn_number: this.#superhumanContext.turnNumber,
                  user_speaking_rate: this.#superhumanContext.userSpeakingRate,
                  remembered_entities: this.#superhumanContext.rememberedEntities?.map((e) => ({
                    name: e.name,
                    entity_type: e.entityType,
                    familiarity: e.familiarity,
                    emotional_valence: e.emotionalValence,
                  })),
                }
              : undefined,
          };

      const response = await fetch(synthesizeEndpoint, {
        method: 'POST',
        headers: this.#isSSML
          ? { ...this.#authHeaders, 'Content-Type': 'application/ssml+xml' }
          : this.#authHeaders,
        body: this.#isSSML ? this.#text : JSON.stringify(requestBody),
      });

      if (!response.ok) {
        log.error(
          { status: response.status, statusText: response.statusText },
          'Ferni TTS HTTP error in chunked synthesis'
        );
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioData = new Int16Array(arrayBuffer);

      // Calculate total number of chunks
      const numChunks = Math.ceil(audioData.length / CHUNK_SIZE_SAMPLES);

      // Yield in chunks
      let chunkIndex = 0;
      for (let i = 0; i < audioData.length; i += CHUNK_SIZE_SAMPLES) {
        chunkIndex++;
        const isLastChunk = chunkIndex === numChunks;
        const chunkData = audioData.slice(i, i + CHUNK_SIZE_SAMPLES);
        const samplesPerChannel = chunkData.length / this.#numChannels;
        const frame = new AudioFrame(
          chunkData,
          this.#sampleRate,
          this.#numChannels,
          samplesPerChannel
        );
        yield {
          requestId: this.#requestId,
          segmentId: this.#segmentId,
          frame,
          final: isLastChunk,
        };
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Ferni TTS chunked synthesis error');
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a Ferni TTS instance
 *
 * @param voiceId - Ferni voice ID (persona name: 'ferni', 'peter', etc.)
 * @param options - Ferni TTS options
 */
export function createFerniTTS(voiceId: string, options?: Partial<FerniTTSOptions>): FerniTTS {
  return new FerniTTS({
    voice: voiceId,
    ...options,
  });
}

/**
 * Create Ferni TTS from environment configuration
 */
export function createFerniTTSFromEnv(voiceId?: string): FerniTTS {
  const voice = voiceId || process.env.FERNI_TTS_DEFAULT_VOICE || 'ferni';
  const endpoint = process.env.FERNI_TTS_ENDPOINT || DEFAULT_FERNI_TTS_ENDPOINT;
  const apiKey = process.env.FERNI_TTS_API_KEY;

  return new FerniTTS({
    voice,
    endpoint,
    apiKey,
  });
}

// ============================================================================
// PREWARMING
// ============================================================================

/**
 * Prewarm a Ferni TTS instance
 */
export async function prewarmFerniTTS(voiceId = 'ferni'): Promise<void> {
  if (_isPrewarming || _prewarmState) {
    log.debug('Ferni TTS prewarm already in progress or complete');
    return _prewarmPromise || Promise.resolve();
  }

  _isPrewarming = true;
  const startTime = Date.now();
  log.debug(`Prewarming Ferni TTS for voice ${voiceId}...`);

  _prewarmPromise = (async () => {
    try {
      const tts = createFerniTTSFromEnv(voiceId);

      // Verify connectivity
      await tts.healthCheck();

      _prewarmState = {
        instance: tts,
        voiceId,
        timestamp: Date.now(),
      };

      const elapsed = Date.now() - startTime;
      log.info({ elapsed, voiceId }, 'Ferni TTS prewarmed');
    } catch (error) {
      log.error({ error: String(error) }, 'Ferni TTS prewarm failed');
    } finally {
      _isPrewarming = false;
    }
  })();

  await _prewarmPromise;
}

/**
 * Check if Ferni TTS is prewarmed
 */
export function isFerniTTSPrewarmed(): boolean {
  return _prewarmState !== null;
}

/**
 * Get prewarmed Ferni TTS instance (consumes it)
 */
export function getPrewarmedFerniTTS(): FerniTTS | null {
  if (_prewarmState) {
    const tts = _prewarmState.instance as FerniTTS;
    _prewarmState = null;
    return tts;
  }
  return null;
}

/**
 * Clear prewarmed Ferni TTS
 */
export function clearPrewarmedFerniTTS(): void {
  _prewarmState = null;
  _prewarmPromise = null;
  _isPrewarming = false;
}

// ============================================================================
// VOICE ID MAPPING
// ============================================================================

/**
 * Map Cartesia voice ID to Ferni TTS voice ID
 */
export function cartesiaVoiceToFerniTTS(cartesiaVoiceId: string): string {
  const CARTESIA_TO_FERNI: Record<string, string> = {
    // Cartesia UUIDs → Ferni persona names
    'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc': 'ferni',
    '3f04e815-3260-4f50-8fd9-af9c657be4c2': 'peter',
    '81c164d9-7baa-419d-9f9a-6b18100a01ee': 'alex',
    '11175483-5332-496c-8c01-ca527ce04e4a': 'maya',
    'b2d14370-c56b-4bdd-a6a3-71abe1b6e345': 'jordan',
    '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3': 'nayan',
  };

  return CARTESIA_TO_FERNI[cartesiaVoiceId] || 'ferni';
}

/**
 * Get Ferni TTS voice ID for a persona name
 */
export function getFerniTTSVoiceIdForPersona(personaId: string): string {
  const normalized = personaId.toLowerCase();

  const PERSONA_TO_FERNI: Record<string, string> = {
    ferni: 'ferni',
    'jack-b': 'ferni',
    coach: 'ferni',
    'life-coach': 'ferni',

    'peter-john': 'peter',
    peter: 'peter',

    'alex-chen': 'alex',
    alex: 'alex',

    'maya-santos': 'maya',
    maya: 'maya',

    'jordan-taylor': 'jordan',
    jordan: 'jordan',

    'nayan-patel': 'nayan',
    nayan: 'nayan',
  };

  return PERSONA_TO_FERNI[normalized] || 'ferni';
}

// ============================================================================
// SUPERHUMAN CONTEXT BUILDER
// ============================================================================

/**
 * Build superhuman context from conversation state
 * This is the bridge between the voice agent's context and Ferni TTS
 */
export function buildFerniSuperhumanContext(
  options: {
    userId?: string;
    userTimezone?: string;
    relationshipDays?: number;
    totalInteractions?: number;
    userEmotion?: string;
    userEmotionIntensity?: number;
    userEnergy?: number;
    topicSensitivity?: number;
    emotionalTrajectory?: string;
    turnNumber?: number;
    userSpeakingRate?: number;
    rememberedEntities?: Array<{
      name: string;
      type: string;
      familiarity: number;
      sentiment: number;
    }>;
  } = {}
): FerniSuperhumanContext {
  // Calculate user's local hour from timezone
  let userLocalHour: number | undefined;
  if (options.userTimezone) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: options.userTimezone,
        hour: 'numeric',
        hour12: false,
      });
      userLocalHour = parseInt(formatter.format(now), 10);
    } catch {
      // Invalid timezone, use undefined
    }
  }

  // Calculate relationship stage (0.0-1.0) from days and interactions
  let relationshipStage: number | undefined;
  if (options.relationshipDays !== undefined || options.totalInteractions !== undefined) {
    const daysFactor = Math.min((options.relationshipDays || 0) / 365, 1.0);
    const interactionsFactor = Math.min((options.totalInteractions || 0) / 100, 1.0);
    relationshipStage = daysFactor * 0.4 + interactionsFactor * 0.6;
  }

  return {
    userLocalHour,
    relationshipStage,
    userEnergy: options.userEnergy,
    userEmotion:
      options.userEmotion && options.userEmotionIntensity !== undefined
        ? [options.userEmotion, options.userEmotionIntensity]
        : undefined,
    topicSensitivity: options.topicSensitivity,
    emotionalTrajectory: options.emotionalTrajectory,
    turnNumber: options.turnNumber,
    userSpeakingRate: options.userSpeakingRate,
    rememberedEntities: options.rememberedEntities?.map((e) => ({
      name: e.name,
      entityType: (e.type as 'person' | 'place' | 'project' | 'pet' | 'other') || 'other',
      familiarity: e.familiarity,
      emotionalValence: e.sentiment,
    })),
  };
}
