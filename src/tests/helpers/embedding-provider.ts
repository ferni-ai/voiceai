/**
 * Choose the embedding provider tests run against, explicitly.
 *
 * getEmbeddingProvider() picks Vertex AI whenever GOOGLE_CLOUD_PROJECT is set,
 * ahead of every API key, and caches the result. Tests gated on an API key
 * therefore did not get that key's provider: with GOOGLE_CLOUD_PROJECT also
 * set (CI's integration step sets both) they called Vertex, which returns 403
 * without credentials. These helpers make the gate and the provider agree.
 */
import { afterAll, beforeAll } from 'vitest';
import {
  getEmbeddingProvider,
  setEmbeddingProvider,
  GoogleEmbeddings,
  LocalEmbeddings,
  OpenAIEmbeddings,
  type EmbeddingProvider,
} from '../../memory/embeddings.js';

/** The vector store dimensions the memory system checks providers against. */
const MEMORY_STORE_DIMENSIONS = 768;

/** True when a real embedding API can be reached with a key alone. */
export const HAS_EMBEDDING_API_KEY = !!process.env.OPENAI_API_KEY || !!process.env.GOOGLE_API_KEY;

/** Swap the provider for the enclosing describe (or file), then restore it. */
function pinProvider(create: () => EmbeddingProvider): void {
  let previous: EmbeddingProvider;
  beforeAll(() => {
    previous = getEmbeddingProvider();
    setEmbeddingProvider(create());
  });
  afterAll(() => {
    setEmbeddingProvider(previous);
  });
}

/**
 * Deterministic hash embeddings with no network. For tests that check output
 * shape, not semantic quality.
 */
export function useLocalEmbeddings(): void {
  pinProvider(() => new LocalEmbeddings(MEMORY_STORE_DIMENSIONS));
}

/**
 * The provider HAS_EMBEDDING_API_KEY promises, in getEmbeddingProvider()'s
 * order after Vertex: OpenAI, then Google AI. Does nothing without a key, so
 * tests gated on HAS_EMBEDDING_API_KEY skip as before.
 */
export function useApiKeyEmbeddings(): void {
  if (!HAS_EMBEDDING_API_KEY) return;
  pinProvider(() =>
    process.env.OPENAI_API_KEY
      ? new OpenAIEmbeddings()
      : new GoogleEmbeddings({ model: 'gemini-embedding-001' })
  );
}
