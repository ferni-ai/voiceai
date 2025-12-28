/**
 * BTCW TTS Core - CosyVoice Integration
 *
 * This module provides TTS using the BTCW (Better Than Cartesia Work) system,
 * which uses CosyVoice 3 as the backend with superhuman voice capabilities.
 *
 * Features:
 * - Streaming TTS with ~150ms first-byte latency
 * - 21 emotion types (Cartesia-compatible)
 * - Superhuman capabilities (circadian, relationship stage, meaningful silence)
 * - Voice cloning via reference audio
 *
 * @module @ferni/speech/tts/btcw-core
 */

import { AudioFrame } from '@livekit/rtc-node';
import { tts } from '@livekit/agents';
import type { PrewarmState, TTSOptions } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'btcw-tts' });

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
 * BTCW-specific TTS options
 */
export interface BTCWOptions extends TTSOptions {
  /** BTCW server endpoint */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Firebase ID token for authentication */
  idToken?: string;
  /** Function to get fresh ID token (enables auto-refresh) */
  getIdToken?: () => Promise<string>;
  /** Default emotion for synthesis */
  defaultEmotion?: BTCWEmotionType;
}

/**
 * BTCW emotion types (21 Cartesia-compatible emotions)
 */
export type BTCWEmotionType =
  | 'neutral'
  | 'angry'
  | 'sad'
  | 'surprised'
  | 'curious'
  | 'affectionate'
  | 'excited'
  | 'content'
  | 'scared'
  | 'happy'
  | 'nostalgic'
  | 'contemplative'
  | 'grateful'
  | 'proud'
  | 'sympathetic'
  | 'skeptical'
  | 'calm'
  | 'thoughtful'
  | 'confident'
  | 'warm'
  | 'peaceful';

/**
 * Superhuman synthesis options
 */
export interface SuperhumanOptions {
  userId?: string;
  relationshipDays?: number;
  totalInteractions?: number;
  vulnerableMoments?: number;
  userLastText?: string;
  userEmotional?: boolean;
  userVulnerable?: boolean;
  timeSinceUserMs?: number;
  memoryTopics?: string[];
  memoryInvolvesLoss?: boolean;
  enableCircadian?: boolean;
  enableRelationship?: boolean;
}

// AudioFrame is imported from @livekit/rtc-node for LiveKit compatibility

/**
 * Synthesis event types
 */
export type SynthesisEventType = 'audio' | 'mark' | 'word' | 'sentence' | 'done' | 'error';

/**
 * Synthesis event emitted during streaming
 */
export interface SynthesisEvent {
  type: SynthesisEventType;
  frame?: AudioFrame;
  mark?: string;
  word?: string;
  sentence?: string;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_NUM_CHANNELS = 1;
const CHUNK_SIZE_SAMPLES = 4800; // 200ms at 24kHz

/**
 * Default BTCW endpoint (Cloud Run deployed service)
 */
export const DEFAULT_BTCW_ENDPOINT =
  process.env.BTCW_ENDPOINT || 'https://btcw-cosyvoice-1031920444452.us-central1.run.app';

/**
 * BTCW persona voice mappings (maps to reference audio on server)
 */
export const BTCW_VOICE_IDS = {
  FERNI: 'ferni',
  PETER_JOHN: 'peter',
  ALEX_CHEN: 'alex',
  MAYA_SANTOS: 'maya',
  JORDAN_TAYLOR: 'jordan',
  NAYAN_PATEL: 'nayan',
} as const;

// ============================================================================
// LIGHTWEIGHT LOGGING
// ============================================================================

const _log = (msg: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'test') return;
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[btcw-tts] ${msg}${dataStr}\n`);
};

// ============================================================================
// PREWARM STATE
// ============================================================================

let _prewarmState: PrewarmState | null = null;
let _isPrewarming = false;
let _prewarmPromise: Promise<void> | null = null;

// ============================================================================
// BTCW TTS CLASS
// ============================================================================

/**
 * BTCW TTS adapter - drop-in replacement for Cartesia TTS
 *
 * Provides streaming TTS using CosyVoice 3 with superhuman capabilities.
 * API is designed to be compatible with @livekit/agents-plugin-cartesia.
 */
export class BTCWTTS {
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly streaming = true;

  #endpoint: string;
  #voiceId: string;
  #defaultEmotion: BTCWEmotionType;
  #superhumanOptions?: SuperhumanOptions;
  #apiKey?: string;
  #idToken?: string;
  #getIdToken?: () => Promise<string>;

  constructor(options: BTCWOptions & { voice: string }) {
    this.#endpoint = options.endpoint || DEFAULT_BTCW_ENDPOINT;
    this.#voiceId = options.voice;
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
    this.numChannels = 1; // BTCW only supports mono
    // Default to 'warm' - 'neutral' has server-side issues
    this.#defaultEmotion = options.defaultEmotion || 'warm';
    this.#apiKey = options.apiKey || process.env.BTCW_API_KEY;
    this.#idToken = options.idToken;
    this.#getIdToken = options.getIdToken;
  }

  /**
   * Get authentication headers for API requests
   */
  async #getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.#getIdToken) {
      const token = await this.#getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.#idToken) {
      headers['Authorization'] = `Bearer ${this.#idToken}`;
    } else if (this.#apiKey) {
      headers['X-API-Key'] = this.#apiKey;
    }

    return headers;
  }

  /**
   * Set ID token for authentication
   */
  setIdToken(token: string): void {
    this.#idToken = token;
  }

  /**
   * Set superhuman options
   */
  setSuperhumanOptions(options: SuperhumanOptions): void {
    this.#superhumanOptions = options;
  }

  /**
   * Create a streaming synthesis session
   * Compatible with Cartesia's stream() method
   */
  stream(): BTCWSynthesizeStream {
    return new BTCWSynthesizeStream(
      this.#endpoint,
      this.#voiceId,
      this.#defaultEmotion,
      this.sampleRate,
      this.numChannels,
      this.#superhumanOptions,
      this.#apiKey,
      this.#idToken,
      this.#getIdToken
    );
  }

  /**
   * Synthesize text (non-streaming)
   */
  async synthesize(text: string): Promise<BTCWChunkedStream> {
    const authHeaders = await this.#getAuthHeaders();
    return new BTCWChunkedStream(
      this.#endpoint,
      this.#voiceId,
      text,
      this.#defaultEmotion,
      this.sampleRate,
      this.numChannels,
      this.#superhumanOptions,
      authHeaders
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; modelLoaded: boolean; mockMode: boolean }> {
    const response = await fetch(`${this.#endpoint}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    const result = await response.json();
    return {
      status: result.status,
      modelLoaded: result.model_loaded,
      mockMode: result.mock_mode,
    };
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
export class BTCWSynthesizeStream implements AsyncIterable<SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM> {
  #endpoint: string;
  #voiceId: string;
  #emotion: BTCWEmotionType;
  #sampleRate: number;
  #numChannels: number;
  #superhumanOptions?: SuperhumanOptions;
  #apiKey?: string;
  #idToken?: string;
  #getIdToken?: () => Promise<string>;

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
    emotion: BTCWEmotionType,
    sampleRate: number,
    numChannels: number,
    superhumanOptions?: SuperhumanOptions,
    apiKey?: string,
    idToken?: string,
    getIdToken?: () => Promise<string>
  ) {
    this.#endpoint = endpoint;
    this.#voiceId = voiceId;
    this.#emotion = emotion;
    this.#sampleRate = sampleRate;
    this.#numChannels = numChannels;
    this.#superhumanOptions = superhumanOptions;
    this.#apiKey = apiKey;
    this.#idToken = idToken;
    this.#getIdToken = getIdToken;
  }

  async #getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.#getIdToken) {
      const token = await this.#getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.#idToken) {
      headers['Authorization'] = `Bearer ${this.#idToken}`;
    } else if (this.#apiKey) {
      headers['X-API-Key'] = this.#apiKey;
    }

    return headers;
  }

  /**
   * Push text to be synthesized (matches Cartesia API)
   */
  pushText(text: string): void {
    if (this.#inputEnded) {
      throw new Error('Cannot push text after endInput() called');
    }
    // Validate text before processing
    if (text === undefined || text === null) {
      log.error(`pushText called with ${text === undefined ? 'undefined' : 'null'} text - skipping`);
      return;
    }
    if (typeof text !== 'string') {
      log.error({ textType: typeof text }, 'pushText called with non-string text type - converting to string');
      text = String(text);
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
   * This replaces the current text queue with new text
   */
  updateInputStream(textOrStream: string | ReadableStream<string>): void {
    // Handle ReadableStream (LiveKit agents pass the LLM output stream)
    if (textOrStream && typeof textOrStream === 'object' && 'getReader' in textOrStream) {
      log.debug('Received ReadableStream - reading text chunks');
      this.#consumeTextStream(textOrStream as ReadableStream<string>);
      return;
    }

    // From here on, treat as string
    let text = textOrStream as string;

    // Validate text before processing
    if (text === undefined || text === null) {
      log.error(`updateInputStream called with ${text === undefined ? 'undefined' : 'null'} text - skipping`);
      return;
    }
    if (typeof text !== 'string') {
      // Check if it's a TokenData object with text property
      if (text && typeof text === 'object' && 'text' in (text as object)) {
        text = (text as { text: string }).text;
        log.debug({ extractedText: text.slice(0, 50) }, 'Extracted text from object');
      } else {
        log.warn({ textType: typeof text }, 'Converting non-string to string');
        text = String(text);
      }
    }
    if (!text.trim()) {
      log.warn('updateInputStream called with empty/whitespace text - skipping');
      return;
    }

    // Strip SSML tags - BTCW uses its own emotion system, not SSML
    text = this.#stripSSML(text);

    if (!text.trim()) {
      log.warn('Text empty after SSML stripping - skipping');
      return;
    }

    // Clear existing queue and add new text
    this.#textQueue.length = 0;
    this.#textQueue.push(text);
    this.#processNextText();
  }

  /**
   * Strip SSML tags from text, keeping only the spoken content.
   * BTCW uses its own emotion system (via the emotion parameter), not SSML.
   */
  #stripSSML(text: string): string {
    const original = text;

    // Remove <break> tags entirely (BTCW handles pauses differently)
    text = text.replace(/<break[^>]*\/>/gi, ' ');
    text = text.replace(/<break[^>]*>[^<]*<\/break>/gi, ' ');

    // Remove <emotion> tags but keep content
    text = text.replace(/<emotion[^>]*>(.*?)<\/emotion>/gi, '$1');

    // Remove <prosody> tags but keep content
    text = text.replace(/<prosody[^>]*>(.*?)<\/prosody>/gi, '$1');

    // Remove <speak> wrapper if present
    text = text.replace(/<\/?speak>/gi, '');

    // Remove any other XML-like tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ').trim();

    // Log if SSML was stripped
    if (original !== text) {
      log.debug({ original: original.slice(0, 100), stripped: text.slice(0, 100) }, 'Stripped SSML');
    }

    return text;
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

            // Strip SSML from chunk
            const cleanChunk = this.#stripSSML(chunk);
            if (cleanChunk.length > 0) {
              log.debug({ chunk: cleanChunk.slice(0, 50) }, 'Sending text chunk');
              this.#textQueue.push(cleanChunk);
              this.#processNextText();
            }
          }
        }
      }

      // Send any remaining text
      const cleanBuffer = this.#stripSSML(buffer);
      if (cleanBuffer.length > 0) {
        log.debug({ text: cleanBuffer.slice(0, 50) }, 'Sending final text');
        this.#textQueue.push(cleanBuffer);
        this.#processNextText();
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Error reading text stream');
    } finally {
      reader.releaseLock();
      // Signal end of input
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
    // For HTTP-based synthesis, this is a no-op
    // The segment naturally ends when text is fully synthesized
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
      const speechEndpoint = `${this.#endpoint}/v1/audio/speech`;
      this.#abortController = new AbortController();

      try {
        const headers = await this.#getAuthHeaders();

        // Debug: Log the request being made
        const requestBody = {
          text,
          voice: this.#voiceId,
          emotion: this.#emotion,
          emotion_intensity: 1.0,
          speed: 1.0,
          stream: true,
          superhuman: this.#superhumanOptions
            ? {
                enable_circadian: this.#superhumanOptions.enableCircadian ?? true,
                user_id: this.#superhumanOptions.userId,
                relationship_days: this.#superhumanOptions.relationshipDays,
                memory_topics: this.#superhumanOptions.memoryTopics,
              }
            : undefined,
        };
        log.debug({ endpoint: speechEndpoint, textLength: text?.length, voice: this.#voiceId }, 'Sending request');

        const fetchStart = Date.now();
        let response: Response;
        try {
          response = await fetch(speechEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: this.#abortController.signal,
          });
          log.debug({ latencyMs: Date.now() - fetchStart, status: response.status }, 'Fetch completed');
        } catch (fetchError) {
          log.error({ latencyMs: Date.now() - fetchStart, error: String(fetchError) }, 'Fetch failed');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        if (!response.ok) {
          // Try to get error details from response body
          let errorDetails = '';
          try {
            errorDetails = await response.text();
          } catch {
            errorDetails = '(could not read response body)';
          }
          log.error({ status: response.status, statusText: response.statusText, body: errorDetails }, 'HTTP error');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          log.error('No response body');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        // Collect ALL audio bytes first, then chunk into consistent frame sizes
        // This prevents tiny frames from HTTP chunking causing audio artifacts
        const allChunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          allChunks.push(value);
          totalBytes += value.length;
        }

        // Combine all chunks into a single buffer
        const combinedBuffer = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of allChunks) {
          combinedBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Ensure we have complete Int16 samples (2 bytes each)
        const completeBytes = combinedBuffer.length - (combinedBuffer.length % 2);
        if (completeBytes === 0) {
          log.warn('No complete audio samples received');
          this.#eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
          this.#notifyWaiter();
          continue;
        }

        // Create properly aligned Int16Array
        const alignedBuffer = new ArrayBuffer(completeBytes);
        new Uint8Array(alignedBuffer).set(combinedBuffer.subarray(0, completeBytes));
        const allAudioData = new Int16Array(alignedBuffer);

        log.debug({ samples: allAudioData.length, durationSec: (allAudioData.length / this.#sampleRate).toFixed(2) }, 'Received audio');

        // Chunk into consistent CHUNK_SIZE_SAMPLES frames for smooth playback
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

        log.debug({ frameCount: frames.length }, 'Created audio frames');

        // Push all frames with proper SynthesizedAudio structure
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
        // For errors, push END_OF_STREAM and let consumer handle it
        log.error({ error: String(error) }, 'Synthesis error');
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

  async *[Symbol.asyncIterator](): AsyncIterator<SynthesizedAudio | typeof tts.SynthesizeStream.END_OF_STREAM> {
    this.#processNextText();

    while (true) {
      while (this.#eventQueue.length > 0) {
        const event = this.#eventQueue.shift()!;
        yield event;

        // Check for END_OF_STREAM symbol
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
 * Yields SynthesizedAudio objects that LiveKit expects
 */
export class BTCWChunkedStream implements AsyncIterable<SynthesizedAudio> {
  #endpoint: string;
  #voiceId: string;
  #text: string;
  #emotion: BTCWEmotionType;
  #sampleRate: number;
  #numChannels: number;
  #superhumanOptions?: SuperhumanOptions;
  #authHeaders: Record<string, string>;
  #requestId: string = generateId();
  #segmentId: string = generateId();

  constructor(
    endpoint: string,
    voiceId: string,
    text: string,
    emotion: BTCWEmotionType,
    sampleRate: number,
    numChannels: number,
    superhumanOptions?: SuperhumanOptions,
    authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  ) {
    this.#endpoint = endpoint;
    this.#voiceId = voiceId;
    this.#text = text;
    this.#emotion = emotion;
    this.#sampleRate = sampleRate;
    this.#numChannels = numChannels;
    this.#superhumanOptions = superhumanOptions;
    this.#authHeaders = authHeaders;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SynthesizedAudio> {
    const speechEndpoint = `${this.#endpoint}/v1/audio/speech`;

    try {
      const response = await fetch(speechEndpoint, {
        method: 'POST',
        headers: this.#authHeaders,
        body: JSON.stringify({
          text: this.#text,
          voice: this.#voiceId,
          emotion: this.#emotion,
          emotion_intensity: 1.0,
          speed: 1.0,
          stream: false,
          superhuman: this.#superhumanOptions
            ? {
                enable_circadian: this.#superhumanOptions.enableCircadian ?? true,
                user_id: this.#superhumanOptions.userId,
                relationship_days: this.#superhumanOptions.relationshipDays,
                memory_topics: this.#superhumanOptions.memoryTopics,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        log.error({ status: response.status, statusText: response.statusText }, 'HTTP error in chunked synthesis');
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioData = new Int16Array(arrayBuffer);

      // Calculate total number of chunks
      const numChunks = Math.ceil(audioData.length / CHUNK_SIZE_SAMPLES);

      // Yield in chunks using proper LiveKit AudioFrame instances
      let chunkIndex = 0;
      for (let i = 0; i < audioData.length; i += CHUNK_SIZE_SAMPLES) {
        chunkIndex++;
        const isLastChunk = chunkIndex === numChunks;
        const chunkData = audioData.slice(i, i + CHUNK_SIZE_SAMPLES);
        const samplesPerChannel = chunkData.length / this.#numChannels;
        // Use LiveKit's AudioFrame constructor: (data, sampleRate, numChannels, samplesPerChannel)
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
      log.error({ error: String(error) }, 'Chunked synthesis error');
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a BTCW TTS instance
 *
 * @param voiceId - BTCW voice ID (persona name: 'ferni', 'peter', etc.)
 * @param options - BTCW options
 */
export function createBTCWTTS(voiceId: string, options?: Partial<BTCWOptions>): BTCWTTS {
  return new BTCWTTS({
    voice: voiceId,
    ...options,
  });
}

/**
 * Create BTCW TTS from environment configuration
 */
export function createBTCWTTSFromEnv(voiceId?: string): BTCWTTS {
  const voice = voiceId || process.env.BTCW_DEFAULT_VOICE || 'ferni';
  const endpoint = process.env.BTCW_ENDPOINT || DEFAULT_BTCW_ENDPOINT;
  const apiKey = process.env.BTCW_API_KEY;

  return new BTCWTTS({
    voice,
    endpoint,
    apiKey,
  });
}

// ============================================================================
// PREWARMING
// ============================================================================

/**
 * Prewarm a BTCW TTS instance
 */
export async function prewarmBTCWTTS(voiceId = 'ferni'): Promise<void> {
  if (_isPrewarming || _prewarmState) {
    _log('BTCW TTS prewarm already in progress or complete');
    return _prewarmPromise || Promise.resolve();
  }

  _isPrewarming = true;
  const startTime = Date.now();
  _log(`Prewarming BTCW TTS for voice ${voiceId}...`);

  _prewarmPromise = (async () => {
    try {
      const tts = createBTCWTTSFromEnv(voiceId);

      // Verify connectivity
      await tts.healthCheck();

      _prewarmState = {
        instance: tts,
        voiceId,
        timestamp: Date.now(),
      };

      const elapsed = Date.now() - startTime;
      _log(`BTCW TTS prewarmed in ${elapsed}ms`);
    } catch (error) {
      _log(`BTCW TTS prewarm failed: ${error}`);
    } finally {
      _isPrewarming = false;
    }
  })();

  await _prewarmPromise;
}

/**
 * Check if BTCW TTS is prewarmed
 */
export function isBTCWTTSPrewarmed(): boolean {
  return _prewarmState !== null;
}

/**
 * Get prewarmed BTCW TTS instance (consumes it)
 */
export function getPrewarmedBTCWTTS(): BTCWTTS | null {
  if (_prewarmState) {
    const tts = _prewarmState.instance as BTCWTTS;
    _prewarmState = null;
    return tts;
  }
  return null;
}

/**
 * Clear prewarmed BTCW TTS
 */
export function clearPrewarmedBTCWTTS(): void {
  _prewarmState = null;
  _prewarmPromise = null;
  _isPrewarming = false;
}

// ============================================================================
// VOICE ID MAPPING
// ============================================================================

/**
 * Map Cartesia voice ID to BTCW voice ID
 * Falls back to 'ferni' for unknown voices
 */
export function cartesiaVoiceToBTCW(cartesiaVoiceId: string): string {
  // Import the voice IDs from config to match
  const CARTESIA_TO_BTCW: Record<string, string> = {
    // These are the Cartesia UUIDs from voice-ids.ts
    'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc': 'ferni',
    '3f04e815-3260-4f50-8fd9-af9c657be4c2': 'peter',
    '81c164d9-7baa-419d-9f9a-6b18100a01ee': 'alex',
    '11175483-5332-496c-8c01-ca527ce04e4a': 'maya',
    'b2d14370-c56b-4bdd-a6a3-71abe1b6e345': 'jordan',
    '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3': 'nayan',
  };

  return CARTESIA_TO_BTCW[cartesiaVoiceId] || 'ferni';
}

/**
 * Get BTCW voice ID for a persona name
 */
export function getBTCWVoiceIdForPersona(personaId: string): string {
  const normalized = personaId.toLowerCase();

  const PERSONA_TO_BTCW: Record<string, string> = {
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

  return PERSONA_TO_BTCW[normalized] || 'ferni';
}
