/**
 * Audio Embedding Integration
 *
 * Receives audio embeddings from Higgs pipeline and stores on userData
 * for context injection into LLM.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'audio-embedding' });

/** Audio embedding from the Rust pipeline */
export interface AudioEmbeddingResult {
  embedding: number[];
  model: string;
  timestampMs: number;
  durationMs: number;
}

/** Summarize an audio embedding for LLM context injection */
export function summarizeAudioEmbedding(embedding: AudioEmbeddingResult): string {
  if (!embedding || embedding.embedding.length === 0) return '';

  // Compute basic statistics for the embedding
  const values = embedding.embedding;
  const norm = Math.sqrt(values.reduce((a, b) => a + b * b, 0));

  // Non-zero dimensions indicate acoustic content
  const nonZero = values.filter((v) => Math.abs(v) > 0.001).length;
  const sparsity = 1 - nonZero / values.length;

  return `model=${embedding.model} dim=${values.length} norm=${norm.toFixed(2)} sparsity=${(sparsity * 100).toFixed(0)}% duration=${embedding.durationMs}ms`;
}

/** Handle audio embedding message from Higgs pipeline */
export function handleAudioEmbedding(data: {
  embedding: number[];
  model: string;
  timestamp_ms: number;
  duration_ms: number;
}): AudioEmbeddingResult {
  const result: AudioEmbeddingResult = {
    embedding: data.embedding,
    model: data.model,
    timestampMs: data.timestamp_ms,
    durationMs: data.duration_ms,
  };

  log.debug(
    { model: result.model, dim: result.embedding.length, durationMs: result.durationMs },
    'Received audio embedding'
  );

  return result;
}
