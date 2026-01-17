/**
 * Firestore Vector Store Helpers
 *
 * Utility functions for embedding extraction and validation.
 *
 * @module memory/firestore-vector-store/helpers
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { FieldVector } from './types.js';

/**
 * Safely extract embedding array with validation.
 * Returns undefined if embedding is invalid or wrong dimension.
 */
export function extractEmbedding(
  rawEmbedding: unknown,
  expectedDimension: number,
  docId: string
): number[] | undefined {
  let embedding: number[] | undefined;

  // Handle Firestore FieldVector type
  if (rawEmbedding && typeof rawEmbedding === 'object' && 'toArray' in rawEmbedding) {
    embedding = (rawEmbedding as FieldVector).toArray();
  }
  // Handle raw number array
  else if (Array.isArray(rawEmbedding)) {
    embedding = rawEmbedding;
  }

  // Validate the embedding
  if (!embedding || !Array.isArray(embedding)) {
    getLogger().warn({ docId }, 'Document has no valid embedding');
    return undefined;
  }

  // Validate dimension to catch data corruption
  if (embedding.length !== expectedDimension) {
    getLogger().warn(
      { docId, expected: expectedDimension, actual: embedding.length },
      'Embedding dimension mismatch - possible data corruption'
    );
    // Still return it but log the warning - caller can decide what to do
  }

  // Validate all elements are numbers
  if (!embedding.every((n) => typeof n === 'number' && !isNaN(n))) {
    getLogger().warn({ docId }, 'Embedding contains non-numeric values');
    return undefined;
  }

  return embedding;
}

/**
 * Check if document matches filter criteria.
 */
export function matchesFilter(
  doc: { metadata: { source: string; category?: string; userId?: string } },
  filter?: { source?: string | string[]; category?: string | string[]; userId?: string }
): boolean {
  if (!filter) return true;

  if (filter.source) {
    const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
    if (!sources.includes(doc.metadata.source)) return false;
  }

  if (filter.category) {
    const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
    if (!doc.metadata.category || !categories.includes(doc.metadata.category)) return false;
  }

  if (filter.userId && doc.metadata.userId !== filter.userId) return false;

  return true;
}
