/**
 * Enhanced Voice Memory Service
 *
 * Speaker embeddings for voice recognition: the neural ECAPA-TDNN model in a
 * worker thread (services/voice/speaker-embedding-worker.ts) when
 * SPEAKER_MODEL_PATH names one, DSP voice features here otherwise. Neural
 * inference never runs on the calling (main) thread.
 *
 * Performance (measured 2026-10-04, Apple M-series, 2 s windows):
 * - Neural (ECAPA-TDNN, onnxruntime, 1 thread): ~89 ms per window, in the worker
 * - DSP fallback: ~6 ms; does not separate speakers (EER ~50%)
 */

import { getLogger } from '../utils/safe-logger.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { cosineSimilarity } from '../memory/rust-accelerator.js';
import { extractDSPFeatures } from './voice/speaker-dsp-features.js';
import { embedOffMainThread, getSpeakerEmbeddingMethod } from './voice/speaker-embedding-worker.js';

const log = getLogger().child({ module: 'VoiceMemoryEnhanced' });

/**
 * Neural speaker embedding (192-dimensional).
 */
export interface SpeakerEmbedding {
  /** Embedding vector */
  vector: Float32Array;
  /** Extraction method */
  method: 'neural' | 'dsp';
  /** Confidence score (0-1) */
  confidence: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Speaker match result.
 */
export interface SpeakerMatch {
  /** Index of matched speaker in candidate list */
  index: number;
  /** Similarity score (0-1) */
  similarity: number;
  /** Whether this is a confident match */
  isMatch: boolean;
}

function dspEmbedding(audio: Float32Array): SpeakerEmbedding {
  return {
    vector: extractDSPFeatures(audio),
    method: 'dsp',
    confidence: 0.7, // Lower confidence for DSP
    timestamp: new Date(),
  };
}

/**
 * Extract speaker embedding from audio samples.
 *
 * Neural (in the worker thread) when the model is available, otherwise DSP
 * features computed here.
 *
 * @param audio - Audio samples (16kHz mono Float32Array)
 * @returns Speaker embedding
 */
export async function extractSpeakerEmbedding(
  audio: Float32Array
): Promise<SpeakerEmbedding | null> {
  // Validate audio length
  const minSamples = 8000; // 0.5 seconds at 16kHz
  if (audio.length < minSamples) {
    log.debug('Audio too short for embedding extraction', {
      samples: audio.length,
      minRequired: minSamples,
    });
    return null;
  }

  if ((await getSpeakerEmbeddingMethod()) === 'dsp') return dspEmbedding(audio);
  try {
    const { vector } = await embedOffMainThread(audio);
    return { vector, method: 'neural', confidence: 0.95, timestamp: new Date() };
  } catch (error) {
    // One request failed (or the worker stopped, which it logs once): DSP for this one.
    log.debug('Neural speaker embedding failed, using DSP', { error: String(error) });
    return dspEmbedding(audio);
  }
}

/**
 * Compare two speaker embeddings (cosine similarity).
 *
 * @returns Similarity score (-1..1, higher = more similar)
 */
export async function compareSpeakerEmbeddings(
  emb1: SpeakerEmbedding,
  emb2: SpeakerEmbedding
): Promise<number> {
  return cosineSimilarity(emb1.vector, emb2.vector);
}

/**
 * Find the best matching speaker from a list of candidates.
 *
 * @param query - Query embedding
 * @param candidates - List of candidate embeddings
 * @param threshold - Minimum similarity threshold (default 0.7)
 * @returns Best match or null if no match above threshold
 */
export async function findBestSpeakerMatch(
  query: SpeakerEmbedding,
  candidates: SpeakerEmbedding[],
  threshold = 0.7
): Promise<SpeakerMatch | null> {
  let bestIndex = -1;
  let bestSimilarity = threshold;

  for (let i = 0; i < candidates.length; i++) {
    const similarity = await compareSpeakerEmbeddings(query, candidates[i]);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) {
    return {
      index: bestIndex,
      similarity: bestSimilarity,
      isMatch: true,
    };
  }

  return null;
}

/**
 * Extract multiple embeddings (one worker request each, in order).
 */
export async function extractSpeakerEmbeddingsBatch(
  audioSamples: Float32Array[]
): Promise<SpeakerEmbedding[]> {
  const results: SpeakerEmbedding[] = [];
  for (const audio of audioSamples) {
    // eslint-disable-next-line no-await-in-loop -- one model, requests are serialized anyway
    results.push((await extractSpeakerEmbedding(audio)) ?? dspEmbedding(audio));
  }
  return results;
}

/**
 * Check if neural speaker embedding is available.
 */
export async function isNeuralEmbeddingAvailable(): Promise<boolean> {
  try {
    return (await getSpeakerEmbeddingMethod()) === 'neural';
  } catch {
    return false;
  }
}

/**
 * Get information about the speaker embedding model.
 */
export async function getSpeakerModelInfo(): Promise<{
  available: boolean;
  model?: string;
  embeddingDim?: number;
  method: 'neural' | 'dsp';
}> {
  if (await isNeuralEmbeddingAvailable()) {
    return {
      available: true,
      model: 'ECAPA-TDNN',
      embeddingDim: 192,
      method: 'neural',
    };
  }

  return {
    available: true,
    method: 'dsp',
  };
}
