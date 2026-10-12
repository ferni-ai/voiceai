import { describe, expect, it } from 'vitest';
import { syncFactDocs, syncableFact } from '../firestore-spanner-sync.js';

describe('copying facts to Spanner', () => {
  const path = 'bogle_users/u1/dynamic_facts/f1';
  const fact = {
    entityName: 'Pete',
    key: 'phone',
    value: '435-339-7687',
    extractedAt: '2026-01-05',
  };

  it('copies a live fact with its owner', () => {
    expect(syncableFact('f1', path, fact)).toMatchObject({ id: 'f1', userId: 'u1', key: 'phone' });
  });

  it('never copies a fact the caller asked to forget (any forgottenAt value)', () => {
    expect(syncableFact('f1', path, { ...fact, forgottenAt: '2026-01-07T00:00:00Z' })).toBeNull();
    expect(syncableFact('f1', path, { ...fact, forgottenAt: { seconds: 1 } })).toBeNull();
  });
});

describe('a sync batch with forgotten facts', () => {
  const live = (id: string) => ({
    id,
    path: `bogle_users/u1/dynamic_facts/${id}`,
    data: { entityName: 'User', key: 'job', value: `job ${id}`, extractedAt: '2026-01-05' },
  });
  const forgotten = (id: string) => ({
    ...live(id),
    data: { ...live(id).data, forgottenAt: '2026-01-07T00:00:00Z' },
  });

  function ops(removeFails = false) {
    const log: string[] = [];
    return {
      log,
      ops: {
        insert: async (f: { id: string }) => (log.push(`insert ${f.id}`), true),
        remove: async (_u: string, factId: string) => {
          if (removeFails) throw new Error('graph down');
          log.push(`remove ${factId}`);
        },
        markSynced: async (_u: string, id: string) => {
          log.push(`mark ${id}`);
        },
      },
    };
  }

  it('removes the copy of a forgotten fact at the head of the batch, marks it, and moves on', async () => {
    const { log, ops: o } = ops();
    const out = await syncFactDocs([forgotten('f0'), live('f1')], o);
    expect(log).toEqual(['remove fact_u1_f0', 'mark f0', 'insert f1', 'mark f1']);
    expect(out).toEqual({ synced: 1, removed: 1, failed: 0 });
  });

  it('retries a removal that failed, without holding up the live facts behind it', async () => {
    const { log, ops: o } = ops(true);
    const out = await syncFactDocs([forgotten('f0'), live('f1')], o);
    expect(log).toEqual(['insert f1', 'mark f1']); // f0 not marked: picked up again next cycle
    expect(out).toEqual({ synced: 1, removed: 0, failed: 1 });
  });
});
