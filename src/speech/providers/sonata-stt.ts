/**
 * Sonata STT Provider — speech-to-text using pocket-voice's
 * Kyutai Moshi STT 1B on Apple Silicon Metal GPU via NAPI.
 *
 * Input: i16 LE PCM audio frames (resampled to 24kHz f32 internally).
 * Output: Transcription text with word timestamps.
 */

import { createRequire } from 'module';
import { createLogger } from '../../utils/safe-logger.js';
import { FrameBuffer } from '../sonata/frame-buffer.js';
import { SONATA_SAMPLE_RATE } from '../sonata/voice-config.js';
import type { TranscriptResult } from '../tts-gateway/types.js';

const require = createRequire(import.meta.url);
const log = createLogger({ module: 'SonataSTT' });

// ─── Native Module Loading ──────────────────────────────────────────────────

interface SonataSTTNative {
  create(hfRepo: string, modelPath: string | null, enableVad: boolean): SonataSTTInstance;
  frameSize(): number;
  sampleRate(): number;
}

interface SonataSTTInstance {
  processFrame(pcm: Float32Array): number;
  flush(): number;
  getAllText(): string;
  getVadProb(horizon: number): number;
  reset(): void;
}

interface SonataModule {
  SonataSTT: SonataSTTNative;
}

let nativeModule: SonataModule | null = null;
let loadError: Error | null = null;

function loadNative(): SonataModule {
  if (nativeModule) return nativeModule;
  if (loadError) throw loadError;

  try {
    nativeModule = require('@ferni/sonata') as SonataModule;
    log.info('Native Sonata STT module loaded');
    return nativeModule;
  } catch (err) {
    loadError = err as Error;
    log.warn({ error: loadError.message }, 'Native Sonata STT module unavailable');
    throw loadError;
  }
}

// ─── STT Client ─────────────────────────────────────────────────────────────

export interface SonataSTTConfig {
  /** HuggingFace model repo (default: kyutai/stt-1b-en_fr-candle) */
  hfRepo?: string;
  /** Model file within repo (default: model.safetensors) */
  modelPath?: string;
  /** Enable semantic VAD (default: true) */
  enableVad?: boolean;
  /** Input sample rate — audio will be resampled to 24kHz (default: 24000) */
  inputSampleRate?: number;
}

type TranscriptCallback = (result: TranscriptResult) => void;

export class SonataSTTClient {
  private engine: SonataSTTInstance | null = null;
  private frameBuffer: FrameBuffer;
  private transcriptCallbacks: TranscriptCallback[] = [];
  private readonly config: Required<SonataSTTConfig>;
  private connected = false;

  constructor(config?: SonataSTTConfig) {
    this.config = {
      hfRepo: config?.hfRepo ?? process.env.SONATA_STT_HF_REPO ?? 'kyutai/stt-1b-en_fr-candle',
      modelPath: config?.modelPath ?? 'model.safetensors',
      enableVad: config?.enableVad ?? true,
      inputSampleRate: config?.inputSampleRate ?? SONATA_SAMPLE_RATE,
    };
    this.frameBuffer = new FrameBuffer();
  }

  /**
   * Initialize the STT engine. Downloads model on first call (~1.5GB).
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const native = loadNative();
    log.info({ hfRepo: this.config.hfRepo }, 'Creating Sonata STT engine');

    this.engine = native.SonataSTT.create(
      this.config.hfRepo,
      this.config.modelPath,
      this.config.enableVad,
    );
    this.connected = true;
    log.info('Sonata STT engine ready');
  }

  /**
   * Send audio frames for processing.
   * Accepts Int16Array (i16 LE PCM) — converts to f32 and buffers into 80ms frames.
   */
  async sendAudio(frames: Int16Array): Promise<void> {
    if (!this.engine) {
      throw new Error('STT engine not connected. Call connect() first.');
    }

    // Convert i16 → f32
    const f32 = new Float32Array(frames.length);
    for (let i = 0; i < frames.length; i++) {
      f32[i] = frames[i] / 32768.0;
    }

    // Buffer into complete frames and process each
    const completeFrames = this.frameBuffer.push(f32);
    for (const frame of completeFrames) {
      const wordCount = this.engine.processFrame(frame);
      if (wordCount > 0) {
        const text = this.engine.getAllText();
        if (text.trim()) {
          const result: TranscriptResult = {
            text: text.trim(),
            latencyMs: 0, // Not tracked per-frame
          };
          for (const cb of this.transcriptCallbacks) {
            cb(result);
          }
        }
      }
    }
  }

  /**
   * Flush remaining text after speech ends.
   * Returns the final transcription.
   */
  async triggerTranscription(): Promise<TranscriptResult> {
    if (!this.engine) {
      return { text: '', latencyMs: 0 };
    }

    const startMs = Date.now();
    this.engine.flush();
    const text = this.engine.getAllText();
    const latencyMs = Date.now() - startMs;

    return {
      text: text.trim(),
      latencyMs,
    };
  }

  /**
   * Register a callback for streaming transcript events.
   */
  onTranscript(cb: TranscriptCallback): void {
    this.transcriptCallbacks.push(cb);
  }

  /**
   * Get VAD probability (higher = more likely silent).
   * @param horizon - 0=0.5s, 1=1.0s, 2=2.0s, 3=3.0s
   */
  getVadProb(horizon: number = 1): number {
    if (!this.engine) return -1;
    return this.engine.getVadProb(horizon);
  }

  /**
   * Reset for a new utterance (clears state, keeps model loaded).
   */
  reset(): void {
    this.engine?.reset();
    this.frameBuffer.reset();
  }

  /**
   * Disconnect and release resources.
   */
  async disconnect(): Promise<void> {
    this.engine = null;
    this.connected = false;
    this.transcriptCallbacks = [];
    this.frameBuffer.reset();
    log.info('Sonata STT disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Factory function matching the pattern of other STT providers.
 */
export function createSonataSTTClient(config?: SonataSTTConfig): SonataSTTClient {
  return new SonataSTTClient(config);
}

/**
 * Check if Sonata STT is available on this platform.
 */
export function isSonataSTTAvailable(): boolean {
  try {
    loadNative();
    return true;
  } catch {
    return false;
  }
}
