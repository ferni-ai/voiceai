import { describe, expect, it } from 'vitest';
import {
  assertEmbeddingDimensionsMatch,
  getConfiguredFirestoreVectorDimensions,
} from '../embedding-dimension-guard.js';

describe('embedding dimension guard', () => {
  it('reads FIRESTORE_VECTOR_DIMENSION from env', () => {
    expect(getConfiguredFirestoreVectorDimensions({ FIRESTORE_VECTOR_DIMENSION: '1536' })).toBe(
      1536
    );
    expect(getConfiguredFirestoreVectorDimensions({})).toBe(768);
  });

  it('hard-fails in production when persistent vectors dimension mismatch', () => {
    expect(() =>
      assertEmbeddingDimensionsMatch({
        providerDimensions: 1536,
        providerModel: 'text-embedding-3-small',
        vectorStoreDimensions: 768,
        usePersistentVectors: true,
        nodeEnv: 'production',
      })
    ).toThrow(/Embedding dimension mismatch/);
  });

  it('does not throw in test/development on mismatch', () => {
    expect(() =>
      assertEmbeddingDimensionsMatch({
        providerDimensions: 1536,
        providerModel: 'text-embedding-3-small',
        vectorStoreDimensions: 768,
        usePersistentVectors: true,
        nodeEnv: 'test',
      })
    ).not.toThrow();
  });
});
