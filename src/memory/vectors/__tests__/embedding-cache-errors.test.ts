/**
 * The cache's failure Results name the error's class and numeric status, never its
 * message: a provider error can echo the text that was embedded (a caller's fact).
 */
import { describe, expect, it, vi } from 'vitest';

const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../embeddings.js', () => {
  const refuse = async () => {
    throw Object.assign(new Error(`400 could not embed ${SENTINEL}, retry`), {
      name: 'VertexEchoError',
      status: 400,
    });
  };
  return { embed: refuse, embedBatch: refuse, getEmbeddingProvider: () => 'mock' };
});

import { EmbeddingCache } from '../embedding-cache.js';

describe('EmbeddingCache failure results', () => {
  it.each([
    ['get', (c: EmbeddingCache) => c.get(SENTINEL), 'Failed to generate embedding'],
    ['getBatch', (c: EmbeddingCache) => c.getBatch([SENTINEL]), 'Batch embedding failed'],
  ])('%s: the message holds the class and status, not the provider text', async (_n, run, lead) => {
    const result = await run(new EmbeddingCache({ maxSize: 10 }));
    if (result.ok) throw new Error('expected a failure');
    expect(result.error.type).toBe('embedding_failed');
    expect(result.error.message).toBe(`${lead}: VertexEchoError 400`);
    expect(result.error.message).not.toContain(SENTINEL);
  });
});
