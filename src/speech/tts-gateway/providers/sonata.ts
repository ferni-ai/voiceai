/**
 * Sonata TTS Provider — implements ITTSProvider using pocket-voice's
 * Kyutai DSM TTS 1.6B on Apple Silicon Metal GPU via NAPI.
 *
 * Audio output: f32 PCM, 24kHz, mono, 1920 samples per frame (80ms).
 * Streaming: yields ~80ms PCM chunks per model step.
 */

import { createRequire } from 'module';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';
import {
  resolveVoicePath,
  SONATA_FRAME_SIZE,
} from '../../sonata/voice-config.js';

const require = createRequire(import.meta.url);
const log = createLogger({ module: 'SonataTTSProvider' });

// ─── Native Module Loading ──────────────────────────────────────────────────

interface SonataTTSNative {
  create(hfRepo: string, voicePath: string | null, nQ: number | null): SonataTTSInstance;
}

interface SonataTTSInstance {
  setText(text: string): void;
  setTextDone(): void;
  step(): boolean;
  getAudio(maxSamples: number): Float32Array;
  isDone(): boolean;
  reset(): void;
  frameSize(): number;
  sampleRate(): number;
}

interface SonataModule {
  SonataTTS: SonataTTSNative;
}

let nativeModule: SonataModule | null = null;
let loadError: Error | null = null;

function loadNative(): SonataModule {
  if (nativeModule) return nativeModule;
  if (loadError) throw loadError;

  try {
    nativeModule = require('@ferni/sonata') as SonataModule;
    log.info('Native Sonata module loaded');
    return nativeModule;
  } catch (err) {
    loadError = err as Error;
    log.warn({ error: loadError.message }, 'Native Sonata module unavailable');
    throw loadError;
  }
}

// ─── Provider Config ────────────────────────────────────────────────────────

export interface SonataProviderConfig {
  /** HuggingFace model repo (default: kyutai/tts-1.6b-en_fr) */
  hfRepo?: string;
  /** Number of audio codebooks (default: 24) */
  nQ?: number;
}

const DEFAULT_HF_REPO = 'kyutai/tts-1.6b-en_fr';
const DEFAULT_N_Q = 24;
const WORDS_PER_MINUTE = 150;

// ─── Provider Implementation ────────────────────────────────────────────────

export class SonataTTSProvider implements ITTSProvider {
  readonly name = 'sonata';
  private engine: SonataTTSInstance | null = null;
  private readonly hfRepo: string;
  private readonly nQ: number;
  private currentVoiceId: string | null = null;

  constructor(config?: SonataProviderConfig) {
    this.hfRepo = config?.hfRepo ?? process.env.SONATA_HF_REPO ?? DEFAULT_HF_REPO;
    this.nQ = config?.nQ ?? DEFAULT_N_Q;
  }

  private getEngine(voiceId: string): SonataTTSInstance {
    // Re-create engine if voice changed (different persona)
    if (this.engine && this.currentVoiceId === voiceId) {
      return this.engine;
    }

    const native = loadNative();
    const voicePath = resolveVoicePath(voiceId) ?? null;

    if (this.engine) {
      // Reset existing engine (voice change)
      this.engine = null;
    }

    log.info({ voiceId, voicePath, hfRepo: this.hfRepo }, 'Creating Sonata TTS engine');
    this.engine = native.SonataTTS.create(this.hfRepo, voicePath, this.nQ);
    this.currentVoiceId = voiceId;
    return this.engine;
  }

  async synthesize(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig,
  ): Promise<ArrayBuffer> {
    const engine = this.getEngine(voiceId);

    engine.reset();
    engine.setText(text);
    engine.setTextDone();

    // Run all steps to completion, collecting audio
    const chunks: Float32Array[] = [];
    while (!engine.isDone()) {
      const done = engine.step();
      const audio = engine.getAudio(SONATA_FRAME_SIZE * 10);
      if (audio.length > 0) {
        chunks.push(audio);
      }
      if (done) break;
    }

    // Drain any remaining audio
    const remaining = engine.getAudio(SONATA_FRAME_SIZE * 100);
    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    // Convert f32 PCM to s16le (matches existing provider format)
    const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0);
    const s16 = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        s16[offset++] = Math.max(-32768, Math.min(32767, Math.round(chunk[i] * 32767)));
      }
    }

    return s16.buffer;
  }

  async *synthesizeStreaming(
    text: string,
    voiceId: string,
    _prosody?: SSMLProsodyConfig,
  ): AsyncIterable<ArrayBuffer> {
    const engine = this.getEngine(voiceId);

    engine.reset();
    engine.setText(text);
    engine.setTextDone();

    // Yield audio chunks as they're generated (~80ms per step)
    while (!engine.isDone()) {
      const done = engine.step();
      const audio = engine.getAudio(SONATA_FRAME_SIZE);
      if (audio.length > 0) {
        // Convert f32 → s16le
        const s16 = new Int16Array(audio.length);
        for (let i = 0; i < audio.length; i++) {
          s16[i] = Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32767)));
        }
        yield s16.buffer;
      }
      if (done) break;
    }

    // Drain remaining
    const remaining = engine.getAudio(SONATA_FRAME_SIZE * 100);
    if (remaining.length > 0) {
      const s16 = new Int16Array(remaining.length);
      for (let i = 0; i < remaining.length; i++) {
        s16[i] = Math.max(-32768, Math.min(32767, Math.round(remaining[i] * 32767)));
      }
      yield s16.buffer;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      loadNative();
      return true;
    } catch {
      return false;
    }
  }

  estimateDuration(text: string): number {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return Math.round((wordCount / WORDS_PER_MINUTE) * 60 * 1000);
  }
}

// ─── Singleton Pattern ──────────────────────────────────────────────────────

let instance: SonataTTSProvider | null = null;

export function getSonataProvider(config?: SonataProviderConfig): SonataTTSProvider {
  if (!instance) {
    instance = new SonataTTSProvider(config);
  }
  return instance;
}

export function createSonataProvider(config?: SonataProviderConfig): SonataTTSProvider {
  return new SonataTTSProvider(config);
}

export function resetSonataProvider(): void {
  instance = null;
}
