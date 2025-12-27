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

import type { PrewarmState, TTSOptions } from './types.js';

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

/**
 * Audio frame from BTCW streaming
 */
export interface AudioFrame {
  data: Int16Array;
  sampleRate: number;
  numChannels: number;
  samplesPerChannel: number;
}

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
 * Streaming synthesis stream - compatible with Cartesia's SynthesizeStream
 */
export class BTCWSynthesizeStream implements AsyncIterable<SynthesisEvent> {
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
  #eventQueue: SynthesisEvent[] = [];
  #resolveWait: (() => void) | null = null;
  #abortController: AbortController | null = null;
  #processing = false;

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
    this.#textQueue.push(text);
    this.#processNextText();
  }

  /**
   * Signal end of input (matches Cartesia API)
   */
  endInput(): void {
    this.#inputEnded = true;
    if (!this.#processing && this.#textQueue.length === 0) {
      this.#eventQueue.push({ type: 'done' });
      this.#notifyWaiter();
    }
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
        const response = await fetch(speechEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
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
          }),
          signal: this.#abortController.signal,
        });

        if (!response.ok) {
          this.#eventQueue.push({
            type: 'error',
            error: `HTTP ${response.status}: ${response.statusText}`,
          });
          this.#notifyWaiter();
          continue;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          this.#eventQueue.push({ type: 'error', error: 'No response body' });
          this.#notifyWaiter();
          continue;
        }

        // Process audio chunks
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const audioData = new Int16Array(value.buffer, value.byteOffset, value.byteLength / 2);
          const frame: AudioFrame = {
            data: audioData,
            sampleRate: this.#sampleRate,
            numChannels: this.#numChannels,
            samplesPerChannel: audioData.length / this.#numChannels,
          };
          this.#eventQueue.push({ type: 'audio', frame });
          this.#notifyWaiter();
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') break;
        this.#eventQueue.push({ type: 'error', error: String(error) });
        this.#notifyWaiter();
      }
    }

    this.#processing = false;

    if (this.#inputEnded && this.#textQueue.length === 0) {
      this.#eventQueue.push({ type: 'done' });
      this.#notifyWaiter();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SynthesisEvent> {
    this.#processNextText();

    while (true) {
      while (this.#eventQueue.length > 0) {
        const event = this.#eventQueue.shift()!;
        yield event;

        if (event.type === 'done' || event.type === 'error') {
          this.close();
          return;
        }
      }

      if (this.#processing || this.#textQueue.length > 0 || !this.#inputEnded) {
        await new Promise<void>((resolve) => {
          this.#resolveWait = resolve;
        });
      } else {
        yield { type: 'done' };
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
export class BTCWChunkedStream implements AsyncIterable<SynthesisEvent> {
  #endpoint: string;
  #voiceId: string;
  #text: string;
  #emotion: BTCWEmotionType;
  #sampleRate: number;
  #numChannels: number;
  #superhumanOptions?: SuperhumanOptions;
  #authHeaders: Record<string, string>;

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

  async *[Symbol.asyncIterator](): AsyncIterator<SynthesisEvent> {
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
        yield { type: 'error', error: `HTTP ${response.status}: ${response.statusText}` };
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioData = new Int16Array(arrayBuffer);

      // Yield in chunks
      for (let i = 0; i < audioData.length; i += CHUNK_SIZE_SAMPLES) {
        const chunkData = audioData.slice(i, i + CHUNK_SIZE_SAMPLES);
        const frame: AudioFrame = {
          data: chunkData,
          sampleRate: this.#sampleRate,
          numChannels: this.#numChannels,
          samplesPerChannel: chunkData.length / this.#numChannels,
        };
        yield { type: 'audio', frame };
      }

      yield { type: 'done' };
    } catch (error) {
      yield { type: 'error', error: String(error) };
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
export async function prewarmBTCWTTS(voiceId: string = 'ferni'): Promise<void> {
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
