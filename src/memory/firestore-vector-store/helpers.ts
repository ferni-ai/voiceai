/**
 * Firestore Vector Store Helpers
 *
 * Utility functions for embedding extraction and validation.
 *
 * @module memory/firestore-vector-store/helpers
 */

import { getLogger } from '../../utils/safe-logger.js';
import { ownedBy, ownerId } from '../retrieval/vector-ownership.js';
import type { CollectionReference, FieldVector, Query } from './types.js';
import { redactCredentials, redactCredentialsIn } from '../credential-redaction.js';
import type { VectorDocument } from '../vector-store-interface.js';

/**
 * The document without a credential the caller said in its text or metadata (#2385). An
 * embedding the caller computed from the old text is dropped, so the store embeds the new one.
 */
export function withoutCredentials(doc: VectorDocument): VectorDocument {
  const text = redactCredentials(doc.text);
  const metadata = redactCredentialsIn(doc.metadata);
  if (text === doc.text) return { ...doc, metadata };
  const { embedding: _embeddedFromSecret, ...rest } = doc;
  return { ...rest, text, metadata };
}

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

  // Validate dimension - historical data may have different dimensions
  // (e.g., 384 from LocalEmbeddings fallback vs 768 from Vertex AI)
  if (embedding.length !== expectedDimension) {
    getLogger().debug(
      { docId, expected: expectedDimension, actual: embedding.length },
      'Embedding dimension mismatch - historical data may use different embedding model'
    );
    // Still return it - caller can decide what to do with dimension-mismatched embeddings
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
  if (!ownedBy(doc, filter)) return false;
  if (!filter) return true;

  if (filter.source) {
    const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
    if (!sources.includes(doc.metadata.source)) return false;
  }

  if (filter.category) {
    const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
    if (!doc.metadata.category || !categories.includes(doc.metadata.category)) return false;
  }

  return true;
}

/**
 * The collection narrowed by what a query can express (one source, the
 * owner): applied BEFORE findNearest, which can't take where() itself.
 */
export function filteredQuery(
  collRef: CollectionReference,
  filter?: { source?: string | string[]; userId?: string }
): CollectionReference {
  let q: CollectionReference | Query = collRef;
  const sources = filter?.source === undefined ? [] : [filter.source].flat();
  if (sources.length === 1) q = q.where('metadata.source', '==', sources[0]);
  const owner = ownerId(filter?.userId);
  if (owner) q = q.where('metadata.userId', '==', owner);
  return q as CollectionReference;
}

/**
 * Whether a stored vector may be returned: the query can't express every
 * filter (several sources, categories), and another user's document must
 * never come back.
 */
export function keepCandidate(
  data: { metadata?: unknown },
  filter?: { source?: string | string[]; category?: string | string[]; userId?: string }
): boolean {
  const metadata = data.metadata as
    { source: string; category?: string; userId?: string } | undefined;
  return !!metadata && matchesFilter({ metadata }, filter);
}
