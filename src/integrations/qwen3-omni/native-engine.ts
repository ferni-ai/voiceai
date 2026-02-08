/**
 * Native Omni Engine – in-process Qwen3-Omni STS via ferni-omni NAPI.
 *
 * Wraps the Rust/Candle pipeline (ferni-omni .node) with lazy loading and
 * graceful fallback when the binary is missing. Use for test-mode shape
 * validation or production when QWEN3_OMNI_BACKEND=candle.
 *
 * - Input: 16 kHz mono Float32Array
 * - Output: 24 kHz mono Float32Array (or streaming chunks)
 */

import { createRequire } from 'node:module';
import { createLogger } from '../../utils/safe-logger.js';

const require = createRequire(import.meta.url);

const log = createLogger({ module: 'NativeOmniEngine' });

// Lazy-loaded ferni-omni NAPI module (OmniEngine, OmniConfig, OmniTimings)
type FerniOmniModule = {
  OmniEngine: new (config: OmniConfigNAPI) => OmniEngineNAPI;
};

interface OmniConfigNAPI {
  useFullOmni?: boolean;
  testMode?: boolean;
  thinkerModelPath?: string;
  thinkerTokenizerPath?: string;
}

interface OmniEngineNAPI {
  processAudioOmni(audio: Float32Array): Float32Array;
  processAudioOmniStreaming(audio: Float32Array, callback: (chunk: Float32Array) => void): OmniTimingsNAPI;
  processAudioOmniTimed(audio: Float32Array): OmniTimingsNAPI;
  readonly sampleRateIn: number;
  readonly sampleRateOut: number;
  readonly isReady: boolean;
}

export interface OmniTimingsNAPI {
  melMs: number;
  encoderMs: number;
  thinkerMs: number;
  talkerMs: number;
  code2WavMs: number;
  totalMs: number;
}

let _omniModule: FerniOmniModule | null = null;

function loadOmniModule(): FerniOmniModule | null {
  if (_omniModule !== null) return _omniModule;
  try {
    _omniModule = require('ferni-omni') as FerniOmniModule;
    return _omniModule;
  } catch (err) {
    log.debug('ferni-omni NAPI not available', { err: String(err) });
    return null;
  }
}

/**
 * Returns true if the ferni-omni native addon is available (e.g. .node binary present).
 */
export function isNativeOmniAvailable(): boolean {
  return loadOmniModule() !== null;
}

export interface NativeOmniEngineOptions {
  /** When true, build pipeline with zero weights (no checkpoint). For tests and shape validation. */
  testMode?: boolean;
  /** Path to model directory (safetensors + config). Required when testMode is false. */
  modelPath?: string;
  /** Path to tokenizer (tokenizer.json). Required when testMode is false. */
  tokenizerPath?: string;
}

/**
 * In-process Qwen3-Omni STS engine using the Rust/Candle NAPI pipeline.
 * Use create() to obtain an instance; check isNativeOmniAvailable() first if you need a fallback.
 */
export class NativeOmniEngine {
  private readonly engine: OmniEngineNAPI;

  private constructor(engine: OmniEngineNAPI) {
    this.engine = engine;
  }

  /**
   * Create a NativeOmniEngine. Throws if ferni-omni is not available or config is invalid.
   * For test mode (no weights), pass { testMode: true }. For production, pass modelPath and tokenizerPath.
   */
  static create(opts: NativeOmniEngineOptions): NativeOmniEngine {
    const mod = loadOmniModule();
    if (!mod) {
      throw new Error(
        'ferni-omni native addon not available. Install or build apps/rust-omni and ensure the .node binary is loadable.'
      );
    }
    const testMode = opts.testMode ?? false;
    if (!testMode && (!opts.modelPath || !opts.tokenizerPath)) {
      throw new Error('NativeOmniEngine: when testMode is false, modelPath and tokenizerPath are required.');
    }
    const config: OmniConfigNAPI = {
      useFullOmni: true,
      testMode,
      thinkerModelPath: opts.modelPath,
      thinkerTokenizerPath: opts.tokenizerPath,
    };
    const engine = new mod.OmniEngine(config);
    if (!engine.isReady) {
      throw new Error('NativeOmniEngine: pipeline failed to initialize (isReady is false).');
    }
    return new NativeOmniEngine(engine);
  }

  /** Process audio (16 kHz mono f32) and return waveform (24 kHz f32). */
  processAudio(pcm16kHz: Float32Array): Float32Array {
    return this.engine.processAudioOmni(pcm16kHz);
  }

  /** Process audio in streaming mode; onChunk is called for each output chunk (24 kHz f32). Returns per-stage timings. */
  processAudioStreaming(
    pcm16kHz: Float32Array,
    onChunk: (chunk: Float32Array) => void
  ): OmniTimingsNAPI {
    return this.engine.processAudioOmniStreaming(pcm16kHz, onChunk);
  }

  /** Per-stage timing metrics for the last processAudioOmniTimed or processAudioStreaming run. */
  processAudioTimed(pcm16kHz: Float32Array): OmniTimingsNAPI {
    return this.engine.processAudioOmniTimed(pcm16kHz);
  }

  get sampleRateIn(): number {
    return this.engine.sampleRateIn;
  }

  get sampleRateOut(): number {
    return this.engine.sampleRateOut;
  }

  get isReady(): boolean {
    return this.engine.isReady;
  }

  // -------------------------------------------------------------------------
  // Audio format helpers (Int16 ↔ Float32)
  // -------------------------------------------------------------------------

  /** Convert Int16Array PCM to Float32Array in [-1, 1]. */
  static int16ToFloat32(int16: Int16Array): Float32Array {
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      out[i] = int16[i] / 32768;
    }
    return out;
  }

  /** Convert Float32Array in [-1, 1] to Int16Array PCM. */
  static float32ToInt16(f32: Float32Array): Int16Array {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
  }
}
