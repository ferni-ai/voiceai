/**
 * Production guard: embedding provider dimensions must match Firestore vector index.
 */

export function getConfiguredFirestoreVectorDimensions(env: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = env.FIRESTORE_VECTOR_DIMENSION;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 768;
}

export function assertEmbeddingDimensionsMatch(options: {
  providerDimensions: number;
  providerModel: string;
  vectorStoreDimensions: number;
  usePersistentVectors: boolean;
  nodeEnv?: string;
}): void {
  const { providerDimensions, providerModel, vectorStoreDimensions, usePersistentVectors, nodeEnv } =
    options;

  if (providerDimensions === vectorStoreDimensions) {
    return;
  }

  if (nodeEnv === 'production' && usePersistentVectors) {
    throw new Error(
      `Embedding dimension mismatch: provider=${providerDimensions} (${providerModel}) ` +
        `vs Firestore index=${vectorStoreDimensions}. Fix FIRESTORE_VECTOR_DIMENSION or the vector index.`
    );
  }
}
