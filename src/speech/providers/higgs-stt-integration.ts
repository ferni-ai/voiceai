/**
 * Higgs STT Integration
 *
 * When TTS_PROVIDER=higgs-pipeline, forwards user audio to the Higgs provider
 * (sendUserAudio) and fetches transcript + biomarkers (triggerTranscription).
 * Biomarkers are attached to userData for downstream use.
 *
 * Supports 24 kHz room audio: resamples 24→16 kHz so Higgs STT receives 16 kHz
 * (uses @ferni/audio resampleF32 when available, else JS linear interpolation).
 *
 * Lives in speech/providers to avoid speech→agents layer violation (BTH refactor H1.6).
 *
 * @module speech/providers/higgs-stt-integration
 */

import { createRequire } from 'node:module';
import { getTTSProvider } from '../tts-gateway/providers/index.js';
import { getHiggsPipelineProvider } from '../tts-gateway/providers/higgs-pipeline.js';
import type { VoiceBiomarkers } from '../tts-gateway/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HiggsSTTIntegration' });

const requireFn = createRequire(import.meta.url);

/** Sample rate Higgs STT expects (exported for HiggsSTT adapter). */
export const HIGGS_STT_SAMPLE_RATE = 16000;

/** Batch interval in ms (env HIGGS_STT_BATCH_MS). 0 = send every frame. */
function getBatchMs(): number {
  const v = process.env.HIGGS_STT_BATCH_MS;
  if (v === undefined || v === '') return 0;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

/** Buffered frames when HIGGS_STT_BATCH_MS > 0; flushed on timer. */
let batchBuffer: Int16Array[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/** Cached STT provider so we don't call getTTSProvider() every frame. */
let cachedProvider: {
  sendUserAudio: (frames: Int16Array) => Promise<void>;
  triggerTranscription: () => Promise<{ text: string; biomarkers?: VoiceBiomarkers }>;
} | null | undefined = undefined;

/** Lazy-loaded @ferni/audio resampleF32 for 24→16 kHz. */
let rustResample:
  | ((samples: Float32Array, fromRate: number, toRate: number) => Float32Array)
  | null = null;

function getRustResample(): typeof rustResample {
  if (rustResample !== null) return rustResample;
  try {
    const mod = requireFn('@ferni/audio') as {
      resampleF32?: (s: Float32Array, a: number, b: number) => Float32Array;
    };
    if (typeof mod?.resampleF32 === 'function') {
      rustResample = mod.resampleF32;
      return rustResample;
    }
  } catch {
    /* @ferni/audio not available */
  }
  return null;
}

/**
 * Resample PCM to 16 kHz for Higgs STT. Returns Int16Array at 16 kHz.
 * When input is already 16 kHz, returns the same buffer (zero-copy when Int16Array).
 * Exported for HiggsSTT LiveKit adapter.
 */
export function resampleTo16k(
  frameData: ArrayLike<number> | Int16Array,
  sampleRate: number
): Int16Array {
  if (sampleRate === HIGGS_STT_SAMPLE_RATE) {
    return frameData instanceof Int16Array
      ? frameData
      : new Int16Array(frameData.length).map((_, i) => frameData[i] as number);
  }

  const len = frameData.length;
  const int16 = frameData instanceof Int16Array ? frameData : new Int16Array(Array.from(frameData));

  // Int16 → Float32 (-1..1)
  const f32 = new Float32Array(len);
  for (let i = 0; i < len; i++) f32[i] = int16[i]! / 32768;

  // Resample: use @ferni/audio when available, else linear interpolation
  let outF32: Float32Array;
  const resample = getRustResample();
  if (resample) {
    outF32 = resample(f32, sampleRate, HIGGS_STT_SAMPLE_RATE);
  } else {
    const ratio = sampleRate / HIGGS_STT_SAMPLE_RATE;
    const outLen = Math.floor(len / ratio);
    outF32 = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, len - 1);
      const t = srcIdx - lo;
      outF32[i] = f32[lo]! * (1 - t) + f32[hi]! * t;
    }
  }

  // Float32 → Int16
  const outLen = outF32.length;
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, outF32[i]!));
    out[i] = s < 0 ? Math.max(-32768, Math.round(s * 32768)) : Math.min(32767, Math.round(s * 32767));
  }
  return out;
}

/** True when Higgs pipeline should be used for STT (Parakeet). Use with TTS_PROVIDER=higgs-pipeline or with USE_HIGGS_STT + HIGGS_PIPELINE_URL for STT-only (TTS from Cartesia). */
export function isHiggsSTTEnabled(): boolean {
  if (process.env.USE_HIGGS_STT !== 'true') return false;
  const p = process.env.TTS_PROVIDER?.toLowerCase();
  if (p === 'higgs-pipeline' || p === 'higgs') return true;
  const url = process.env.HIGGS_PIPELINE_URL?.trim();
  return (url?.length ?? 0) > 0;
}

/**
 * Check if the current TTS provider supports STT (sendUserAudio + triggerTranscription).
 * Result is cached so we don't call getTTSProvider() every frame.
 */
export function getHiggsSTTProvider(): {
  sendUserAudio: (frames: Int16Array) => Promise<void>;
  triggerTranscription: () => Promise<{ text: string; biomarkers?: VoiceBiomarkers }>;
} | null {
  if (!isHiggsSTTEnabled()) return null;
  if (cachedProvider !== undefined) return cachedProvider;
  const pEnv = process.env.TTS_PROVIDER?.toLowerCase();
  const provider =
    pEnv === 'higgs-pipeline' || pEnv === 'higgs'
      ? getTTSProvider()
      : getHiggsPipelineProvider();
  const p = provider as unknown as {
    sendUserAudio?: (frames: Int16Array) => Promise<void>;
    triggerTranscription?: () => Promise<{ text: string; biomarkers?: VoiceBiomarkers }>;
  };
  if (typeof p.sendUserAudio === 'function' && typeof p.triggerTranscription === 'function') {
    cachedProvider = {
      sendUserAudio: p.sendUserAudio,
      triggerTranscription: p.triggerTranscription,
    };
  } else {
    cachedProvider = null;
  }
  return cachedProvider;
}

/**
 * Flush batched audio to Higgs (when HIGGS_STT_BATCH_MS > 0).
 * Concatenates buffered Int16Arrays and sends one sendUserAudio call.
 */
function flushBatch(): void {
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  if (batchBuffer.length === 0) return;
  const provider = getHiggsSTTProvider();
  if (!provider) {
    batchBuffer = [];
    return;
  }
  const totalLen = batchBuffer.reduce((s, b) => s + b.length, 0);
  const out = new Int16Array(totalLen);
  let offset = 0;
  for (const b of batchBuffer) {
    out.set(b, offset);
    offset += b.length;
  }
  batchBuffer = [];
  void provider.sendUserAudio(out).catch((err) => {
    log.warn({ error: String(err) }, 'Higgs sendUserAudio (batch) failed');
  });
}

/**
 * Send user audio frame to Higgs for STT buffering.
 * Zero-copy when frame is already Int16Array at 16 kHz (resampleTo16k returns same ref).
 * Resamples 24 kHz (or other rates) to 16 kHz when needed.
 * When HIGGS_STT_BATCH_MS > 0, buffers frames and sends in batches to reduce WebSocket traffic.
 * Non-blocking.
 */
export function sendUserAudioToHiggs(
  frameData: ArrayLike<number> | Int16Array,
  sampleRate: number
): void {
  const provider = getHiggsSTTProvider();
  if (!provider) return;
  if (frameData.length === 0) return;

  const int16 = resampleTo16k(frameData, sampleRate);
  if (int16.length === 0) return;

  const batchMs = getBatchMs();
  if (batchMs <= 0) {
    void provider.sendUserAudio(int16).catch((err) => {
      log.warn({ error: String(err) }, 'Higgs sendUserAudio failed');
    });
    return;
  }

  batchBuffer.push(new Int16Array(int16));
  if (batchTimer === null) {
    batchTimer = setTimeout(flushBatch, batchMs);
  }
}

/**
 * Trigger Higgs transcription and return transcript + biomarkers.
 * Call when user utterance is final (e.g. on final transcript event).
 */
export async function fetchHiggsTranscriptAndBiomarkers(): Promise<{
  text: string;
  biomarkers?: VoiceBiomarkers;
} | null> {
  const provider = getHiggsSTTProvider();
  if (!provider) return null;
  try {
    const result = await provider.triggerTranscription();
    return { text: result.text, biomarkers: result.biomarkers };
  } catch (err) {
    log.warn({ error: String(err) }, 'Higgs triggerTranscription failed');
    return null;
  }
}
