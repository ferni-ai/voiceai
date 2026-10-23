import { describe, expect, it, vi } from 'vitest';
import {
  backfill,
  databaseRefusal,
  type BackfillOptions,
  type MemorySource,
} from '../backfill-remembered-facts.js';
import type { FactDocWrite } from '../../../src/memory/dynamic/remembered-facts.js';

/**
 * memories in memory, in path order, and the dynamic_facts the run creates.
 * Seeds: 2 users x 3 remembered facts, plus one of each kind that is left out.
 */
function fakeStore() {
  const memories = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < 6; i++) {
    const path = `bogle_users/test-user-${i % 2}/memories/mem_${i}`;
    memories.set(path, { content: `remembered thing number ${i}`, type: 'summary' });
  }
  memories.set('bogle_users/test-user-0/memories/mem_goal', { content: 'a goal', type: 'commitment' }); // prettier-ignore
  memories.set('bogle_users/test-user-0/memories/mem_old', { content: 'old', type: 'summary', archived: true }); // prettier-ignore
  memories.set('bogle_users/test-user-0/memories/mem_blank', { content: '  ', type: 'summary' });
  memories.set('bogle_users/test-user-1/memories/consolidated_1', { content: 'x', type: 'summary' }); // prettier-ignore
  const facts = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async (userId: string, doc: FactDocWrite) => {
    const path = `bogle_users/${userId}/dynamic_facts/${doc.id}`;
    if (facts.has(path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    facts.set(path, doc.data);
  });
  const source: MemorySource = {
    async page(after, size) {
      const paths = [...memories.keys()].sort().filter((p) => after === undefined || p > after);
      return paths.slice(0, size).map((path) => ({ path, data: { ...memories.get(path) } }));
    },
    create,
  };
  return { facts, create, source };
}

function harness(opts: Partial<BackfillOptions> = {}) {
  const store = fakeStore();
  let saved: string | undefined;
  const embed = vi.fn(async (texts: string[]) => texts.map(() => new Array(768).fill(0.01)));
  const cursor = { read: vi.fn(() => saved), write: vi.fn((a: string) => void (saved = a)) };
  const options: BackfillOptions = { database: 'ferni-dev', dryRun: false, rate: 1000, batch: 2, ...opts }; // prettier-ignore
  const deps = { source: store.source, embed, model: async () => 'test-model', cursor };
  return {
    ...store,
    embed,
    cursor,
    run: (o: Partial<BackfillOptions> = {}) => backfill({ ...options, ...o }, deps),
  };
}

describe('backfill-remembered-facts', () => {
  it('dry run (the default) counts what it would write, and embeds, writes and saves nothing', async () => {
    const h = harness({ dryRun: true });
    expect(await h.run()).toEqual({
      scanned: 10,
      skipped: 3,
      notKept: 1,
      toWrite: 6,
      created: 0,
      existing: 0,
      failed: 0,
      requests: 0,
    });
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.cursor.read).not.toHaveBeenCalled();
    expect(h.cursor.write).not.toHaveBeenCalled();
  });

  it('writes each remembered fact as a caller_asserted, embedded fact; a rerun creates nothing', async () => {
    const h = harness();
    expect(await h.run()).toMatchObject({ toWrite: 6, created: 6, existing: 0, failed: 0 });
    expect(h.facts.size).toBe(6);
    expect([...h.facts.values()][0]).toMatchObject({
      source: 'caller_asserted',
      memoryId: 'mem_0',
      embeddingModel: 'test-model',
    });
    // A fresh run (no cursor) over facts already there: all found, none written over.
    const again = harness();
    for (const [p, d] of h.facts) again.facts.set(p, d);
    expect(await again.run()).toMatchObject({ created: 0, existing: 6 });
  });

  it('resumes after the saved cursor', async () => {
    const h = harness({ limit: 4 });
    await h.run();
    const first = h.facts.size;
    await h.run({ limit: undefined });
    expect(first).toBeGreaterThan(0);
    expect(h.facts.size).toBe(6);
    expect(h.create.mock.calls.length).toBe(6); // nothing written twice
  });

  it('--uid: only that user', async () => {
    const h = harness({ uid: 'test-user-1' });
    expect(await h.run()).toMatchObject({ created: 3 });
    expect([...h.facts.keys()].every((p) => p.startsWith('bogle_users/test-user-1/'))).toBe(true);
  });

  it('refuses prod without --confirm-prod, and with FIRESTORE_DATABASE set', () => {
    expect(databaseRefusal(undefined, [], {})).toMatch(/required/);
    expect(databaseRefusal('(default)', [], {})).toMatch(/confirm-prod/);
    expect(databaseRefusal('(default)', ['--confirm-prod'], { FIRESTORE_DATABASE: 'x' })).toMatch(/FIRESTORE_DATABASE/); // prettier-ignore
    expect(databaseRefusal('ferni-dev', [], {})).toBeUndefined();
  });
});
