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

  /** forgottenSince: docs forgotten after the sync read them (seen by the transactional re-read). */
  function ops(opts: { removeFails?: boolean; forgottenSince?: string[] } = {}) {
    const log: string[] = [];
    return {
      log,
      ops: {
        insert: async (f: { id: string }) => (log.push(`insert ${f.id}`), true),
        remove: async (_u: string, factId: string) => {
          if (opts.removeFails) throw new Error('graph down');
          log.push(`remove ${factId}`);
        },
        markSynced: async (_u: string, id: string, o: { onlyIfLive: boolean }) => {
          if (o.onlyIfLive && opts.forgottenSince?.includes(id)) return false;
          log.push(`mark ${id}`);
          return true;
        },
      },
    };
  }

  it('removes the copy of a forgotten fact at the head of the batch, marks it, and moves on', async () => {
    const { log, ops: o } = ops();
    const out = await syncFactDocs([forgotten('f0'), live('f1')], o);
    expect(log).toEqual(['remove fact_u1_f0', 'mark f0', 'insert f1', 'mark f1']);
    expect(out).toEqual({ synced: 1, removed: 1, failed: 0, deleteFailures: 0 });
  });

  it('takes back a copy written for a fact forgotten between the read and the write', async () => {
    const { log, ops: o } = ops({ forgottenSince: ['f1'] });
    const out = await syncFactDocs([live('f1')], o);
    expect(log).toEqual(['insert f1', 'remove fact_u1_f1', 'mark f1']);
    expect(out).toMatchObject({ synced: 0, removed: 1 });
  });

  it('never reports a failed removal as done: left unsynced, counted, live facts still copied', async () => {
    const { log, ops: o } = ops({ removeFails: true });
    const out = await syncFactDocs([forgotten('f0'), live('f1')], o);
    expect(log).toEqual(['insert f1', 'mark f1']); // f0 not marked: retried next cycle
    expect(out).toEqual({ synced: 1, removed: 0, failed: 0, deleteFailures: 1 });
  });
});

describe('deleting a graph copy', () => {
  it('throws when the graph store is not ready, so the sync never marks it removed', async () => {
    const { deleteFact } = await import('../../spanner-graph/client.js');
    await expect(deleteFact('u1', 'fact_u1_f0')).rejects.toThrow();
  });
});
