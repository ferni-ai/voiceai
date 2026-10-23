import { afterEach, describe, expect, it, vi } from 'vitest';
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
function fakeStore(topics: Record<string, string[] | null> = {}) {
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
    forgottenTopics: async (userId) => (userId in topics ? topics[userId]! : []),
  };
  return { facts, create, source, memories };
}

function harness(
  opts: Partial<BackfillOptions> = {},
  topics: Record<string, string[] | null> = {}
) {
  const store = fakeStore(topics);
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
      notMember: 0,
      forgotten: 0,
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

describe('backfill-remembered-facts: forgotten', () => {
  const DANA = 'my sister Dana is moving to Denver';
  const withDana = (h: ReturnType<typeof harness>) => {
    h.memories.set('bogle_users/test-user-0/memories/mem_dana', { content: DANA, type: 'summary' });
    return h;
  };
  const written = (h: ReturnType<typeof harness>) => [...h.facts.values()].map((d) => d.value);
  afterEach(() => vi.unstubAllEnvs());

  it('FORGET_EVERY_READER: a memory about a forgotten topic is never embedded or written', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const h = withDana(harness({}, { 'test-user-0': ['dana'] }));
    expect(await h.run()).toMatchObject({ forgotten: 1, toWrite: 6, created: 6, failed: 0 });
    expect(written(h)).not.toContain(DANA);
    expect(h.embed.mock.calls.flatMap(([texts]) => texts).join(' ')).not.toMatch(/Dana/);
  });

  it('FORGET_EVERY_READER: a dry run counts it too, still reading nothing but topics', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const h = withDana(harness({ dryRun: true }, { 'test-user-0': ['dana'] }));
    expect(await h.run()).toMatchObject({ forgotten: 1, toWrite: 6, created: 0 });
    expect(h.embed).not.toHaveBeenCalled();
  });

  it('FORGET_EVERY_READER: a user whose topics cannot be read is skipped (fails closed)', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const h = harness({}, { 'test-user-1': null });
    expect(await h.run()).toMatchObject({ forgotten: 3, created: 3 });
    expect([...h.facts.keys()].every((p) => p.startsWith('bogle_users/test-user-0/'))).toBe(true);
  });

  it('flag off: topics are not consulted and the run is unchanged', async () => {
    const h = withDana(harness({}, { 'test-user-0': ['dana'], 'test-user-1': null }));
    expect(await h.run()).toMatchObject({ forgotten: 0, toWrite: 7, created: 7 });
    expect(written(h)).toContain(DANA);
  });

  it('a memory marked forgottenAt is never copied, flag or not', async () => {
    const h = harness();
    h.memories.set('bogle_users/test-user-0/memories/mem_gone', { content: DANA, type: 'summary', forgottenAt: '2026-10-01' }); // prettier-ignore
    expect(await h.run()).toMatchObject({ forgotten: 1, created: 6 });
    expect(written(h)).not.toContain(DANA);
  });
});

describe('backfill-remembered-facts: only members, never a credential', () => {
  it.each(['anonymous', 'unknown', 'default', 'anon:abc123', 'onbehalf:xyz'])(
    'owner %j: never written (one bucket for many callers)',
    async (owner) => {
      const h = harness();
      h.memories.set(`bogle_users/${owner}/memories/mem_x`, { content: 'I ran 5k today', type: 'summary' }); // prettier-ignore
      expect(await h.run()).toMatchObject({ notMember: 1, created: 6 });
      expect([...h.facts.keys()].some((p) => p.includes(owner))).toBe(false);
    }
  );

  it.each([
    'my Gmail password is hunter2!',
    'card 5105-1051-0510-5100',
    'the code is 4 8 1 5',
    'it is ghp_1234567890abcdefABCD',
  ])(
    // prettier-ignore
    'a remembered credential is never embedded or written: %s',
    async (content) => {
      const h = harness();
      h.memories.set('bogle_users/test-user-0/memories/mem_secret', { content, type: 'summary' });
      expect(await h.run()).toMatchObject({ notKept: 2, created: 6 });
      expect(h.embed.mock.calls.flatMap(([texts]) => texts).join(' ')).not.toContain(content);
    }
  );
});
