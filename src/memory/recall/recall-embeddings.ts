/**
 * Embeddings for recall ranking, with graceful degradation.
 *
 * Returns null (keyword-only ranking) when semantic recall is turned off,
 * when the only provider is the local hash embedder (no semantic meaning),
 * or when the embedding stack cannot load (e.g. a missing native module).
 * Each call is bounded by a timeout so recall never waits on a slow API.
 *
 * @module memory/recall/recall-embeddings
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RecallEmbeddings' });

/** Embed texts; null when embeddings are unavailable. Never throws. */
export type Embedder = (texts: string[]) => Promise<number[][] | null>;

export function semanticRecallEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.MEMORY_RECALL_SEMANTIC !== 'off';
}

const DEFAULT_TIMEOUT_MS = 4_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

let cached: Promise<Embedder | null> | null = null;

/** The process-wide embedder for recall, or null for keyword-only ranking. */
export function getRecallEmbedder(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Embedder | null> {
  if (!semanticRecallEnabled()) return Promise.resolve(null);
  if (!cached) {
    cached = (async (): Promise<Embedder | null> => {
      try {
        const mod = await import('../vectors/embeddings.js');
        const provider = mod.getEmbeddingProvider();
        if (provider instanceof mod.LocalEmbeddings) return null;
        return async (texts: string[]) => {
          if (texts.length === 0) return [];
          const vectors = await withTimeout(mod.embedBatch(texts), timeoutMs);
          return vectors && vectors.length === texts.length ? vectors : null;
        };
      } catch (error) {
        log.warn({ error: String(error) }, 'Embeddings unavailable; recall is keyword-only');
        return null;
      }
    })();
  }
  return cached;
}

/** Reset the cached embedder (tests). */
export function resetRecallEmbedder(): void {
  cached = null;
}
