/**
 * Storing a memory whose embedding fails logs the error's class, never its text:
 * a provider error can echo the memory's content (a caller's fact) in its message.
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
    Object.assign(error, { status: 503 });
    throw error;
  },
}));

import { UnifiedMemoryStoreFacade } from '../facade.js';

describe('UnifiedMemoryStoreFacade.store embedding failure', () => {
  it('logs the error class, not the memory text the provider echoed', async () => {
    const store = new UnifiedMemoryStoreFacade({ enableDeduplication: true });
    const internals = store as unknown as Record<string, unknown>;
    internals.ensureInitialized = async () => undefined;
    internals.checkDuplicate = async () => true; // ends store() after the embedding step

    await store.store({ userId: 'u1', type: 'fact', content: SENTINEL } as never);

    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'VertexEchoError', status: 503 },
      'Failed to generate embedding',
    ]);
  });
});
