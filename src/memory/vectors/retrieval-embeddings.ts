/**
 * Embeddings for search: a stored memory and a question about it are
 * embedded differently (Vertex task types), which separates real matches from
 * noise (session recall, measured 2026-10-10).
 *
 * @module memory/vectors/retrieval-embeddings
 */

import { getEmbeddingProvider, VertexAIEmbeddings } from './embeddings.js';

/** A stored memory, or a question looking for one. */
export type RetrievalRole = 'document' | 'query';

/**
 * Embed for retrieval with the default provider, telling Vertex which side of
 * the search each text is on. Other providers have no task types.
 */
export async function embedForRetrieval(texts: string[], role: RetrievalRole): Promise<number[][]> {
  const provider = getEmbeddingProvider();
  if (provider instanceof VertexAIEmbeddings) {
    return provider.embedBatch(texts, role === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT');
  }
  return provider.embedBatch(texts);
}
