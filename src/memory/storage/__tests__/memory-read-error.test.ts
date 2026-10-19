/**
 * getUserMemories used to catch every Firestore error and return [], so a
 * missing composite index (FAILED_PRECONDITION) read exactly like a user with
 * no memories. A failed read must now throw, and log at error level when it
 * needs a fix rather than a retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: { fail: unknown; docs: Array<Record<string, unknown>> } = { fail: null, docs: [] };
const logged = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => ({
    error: logged.error,
    warn: logged.warn,
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('../../../utils/firestore-utils.js', () => {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => {
      if (state.fail) throw state.fail;
      return { docs: state.docs.map((d) => ({ id: d.id, data: () => d })) };
    },
  };
  return {
    getFirestoreDb: () => ({
      collection: () => ({ doc: () => ({ collection: () => query }) }),
    }),
    cleanForFirestore: (o: unknown) => o,
  };
});
vi.mock('../../firestore-vector-store/index.js', () => ({ getFirestoreVectorStore: vi.fn() }));
vi.mock('../../memory-graph.js', () => ({ getMemoryGraph: vi.fn() }));

const { getUserMemories } = await import('../lifecycle-integration.js');
const { MemoryReadError, isTransientFirestoreError } = await import('../memory-read-error.js');

function grpcError(code: number, message: string): Error {
  return Object.assign(new Error(`${code} ${message}`), { code });
}

beforeEach(() => {
  state.fail = null;
  state.docs = [];
  logged.error.mockClear();
  logged.warn.mockClear();
});

describe('getUserMemories never passes a failed read off as zero memories', () => {
  it('returns the memories on a good read (baseline)', async () => {
    state.docs = [
      { id: 'm1', content: 'likes jazz', type: 'preference', strength: 1, createdAt: new Date() },
    ];
    const memories = await getUserMemories('u1');
    expect(memories.map((m) => m.id)).toEqual(['m1']);
  });

  it('throws a non-transient MemoryReadError and logs at error on a missing index', async () => {
    state.fail = grpcError(9, 'FAILED_PRECONDITION: The query requires an index.');

    const err = await getUserMemories('u1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MemoryReadError);
    expect(err).toMatchObject({ userId: 'u1', code: 9, transient: false });
    expect(logged.error).toHaveBeenCalledTimes(1);
    expect(String(logged.error.mock.calls[0]?.[1])).toContain('missing composite index');
  });

  it('still throws on a transient error, logged at warn', async () => {
    state.fail = grpcError(14, 'UNAVAILABLE: connection reset');

    const err = await getUserMemories('u1').catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'MemoryReadError', code: 14, transient: true });
    expect(logged.warn).toHaveBeenCalledTimes(1);
    expect(logged.error).not.toHaveBeenCalled();
  });
});

describe('isTransientFirestoreError', () => {
  it.each([
    [{ code: 14 }, true],
    [{ code: 4 }, true],
    [{ code: 'unavailable' }, true],
    [{ code: 'DEADLINE_EXCEEDED' }, true],
    [{ code: 9 }, false],
    [{ code: 7 }, false],
    [{ code: 'failed-precondition' }, false],
    [new Error('no code'), false],
    [null, false],
  ])('%o -> %s', (error, expected) => {
    expect(isTransientFirestoreError(error)).toBe(expected);
  });
});
