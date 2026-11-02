/**
 * #2689: persistTurn and markSummarized log what happened (role, ids, length),
 * never the words. A caller turn and a summary carrying a sentinel go through the
 * real functions with only Firestore faked; no piece of the sentinel may reach any
 * log call. Before the fix persistTurn logged `preview: content.slice(0, 40)`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../tests/helpers/snippet-leak.js';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (...args: unknown[]) => logged.push(args);
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

const fakeDoc = vi.hoisted(() => {
  const doc: Record<string, unknown> = {};
  doc.collection = () => ({ doc: () => doc, add: async () => ({ id: 'turn-1' }) });
  doc.update = async () => undefined;
  return doc;
});
vi.mock('../../../utils/shared-firestore.js', () => ({
  sharedFirestore: () => ({ collection: () => ({ doc: () => fakeDoc }) }),
}));

const { persistTurn, markSummarized } = await import('../realtime-memory.js');

describe('realtime-memory logs no conversation text (#2689)', () => {
  beforeEach(() => {
    logged.length = 0;
  });

  it.each(['user', 'assistant'] as const)(
    'persistTurn logs the %s turn length, not its words',
    async (role) => {
      await persistTurn('user-log-1', 'conv-1', { role, content: SENTINEL, timestamp: new Date() });

      expect(leakedPieces(logged)).toEqual([]);
      const persisted = logged.find(([, msg]) => msg === '💾 Turn persisted to Firestore');
      expect(persisted?.[0]).toMatchObject({ role, contentLen: SENTINEL.length });
    }
  );

  it('markSummarized logs the summary length, not the summary', async () => {
    await markSummarized('user-log-1', 'conv-1', SENTINEL);

    expect(leakedPieces(logged)).toEqual([]);
    const done = logged.find(([, msg]) => msg === '✅ Conversation summarized');
    expect(done?.[0]).toMatchObject({ summaryLen: SENTINEL.length });
  });
});
