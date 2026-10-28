/**
 * Recalling logs no part of the user's query: not when its embedding fails (the
 * provider's error can echo it) and not in the debug summary of a successful recall.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

vi.mock('../../embeddings.js', () => ({
  embed: async () => {
    const error = new Error(`400 could not embed ${SENTINEL}, retry`);
    error.name = 'VertexEchoError';
    throw Object.assign(error, { status: 503 });
  },
}));

import { UnifiedMemoryStoreFacade } from '../facade.js';

describe('UnifiedMemoryStoreFacade.recall logs', () => {
  it('carries the error class and the query length, never the query text', async () => {
    const store = new UnifiedMemoryStoreFacade({ features: { useVectorSearch: true } as never });
    const internals = store as unknown as Record<string, unknown>;
    internals.ensureInitialized = async () => undefined;
    internals.firestoreAdapter = { search: async () => [] };
    internals.memoryAdapter = { search: async () => [] };

    await store.recall({ userId: 'u1', query: SENTINEL } as never);

    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'VertexEchoError', status: 503 },
      'Failed to generate query embedding',
    ]);
    expect(logged).toContainEqual([
      expect.objectContaining({ userId: 'u1', queryLength: SENTINEL.length }),
      'Memory recall complete',
    ]);
  });
});
