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

type EmbeddingProviderLike = { dimensions: number; model: string };

type DimensionLog = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  debug: (obj: Record<string, unknown>, msg: string) => void;
};

/** Validate provider vs vector-store dimensions at memory init (logs in non-prod). */
export function validateMemoryEmbeddingDimensions(
  provider: EmbeddingProviderLike,
  usePersistentVectors: boolean,
  log: DimensionLog,
  nodeEnv: string | undefined = process.env.NODE_ENV
): void {
  const vectorStoreDimensions = usePersistentVectors
    ? getConfiguredFirestoreVectorDimensions()
    : provider.dimensions;

  assertEmbeddingDimensionsMatch({
    providerDimensions: provider.dimensions,
    providerModel: provider.model,
    vectorStoreDimensions,
    usePersistentVectors,
    nodeEnv,
  });

  if (provider.dimensions !== vectorStoreDimensions) {
    log.warn(
      {
        providerModel: provider.model,
        providerDimensions: provider.dimensions,
        vectorStoreDimensions,
        usePersistentVectors,
        risk: 'SEARCH_QUALITY_DEGRADED',
      },
      '⚠️ Embedding dimension mismatch detected - semantic search quality may be affected'
    );
    return;
  }

  log.debug(
    { providerModel: provider.model, dimensions: provider.dimensions },
    'Embedding dimensions validated successfully'
  );
}
