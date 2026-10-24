import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backfill,
  databaseRefusal,
  defaultCursorFile,
  fileCursor,
  type BackfillDeps,
  type BackfillOptions,
  type MemorySource,
} from '../backfill-remembered-facts.js';
import type { SecretModel } from '../../../src/memory/secret-check.js';
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

/** The secret-check model: a clear no unless the text is in `secrets`. */
const fakeModel = (secrets: string[] = []) =>
  vi.fn<SecretModel>(async (_p, content) =>
    secrets.some((t) => content.includes(t)) ? '{"secret":true}' : '{"secret":false}'
  );

function harness(
  opts: Partial<BackfillOptions> = {},
  topics: Record<string, string[] | null> = {}
) {
  const store = fakeStore(topics);
  let saved: string | undefined;
  const embed = vi.fn(async (texts: string[]) => texts.map(() => new Array(768).fill(0.01)));
  const cursor = { read: vi.fn(() => saved), write: vi.fn((a: string) => void (saved = a)) };
  const secretModel = fakeModel();
  const options: BackfillOptions = { database: 'ferni-dev', dryRun: false, rate: 1000, batch: 2, ...opts }; // prettier-ignore
  const deps: BackfillDeps = {
    source: store.source,
    embed,
    model: async () => 'test-model',
    secretCheck: { model: secretModel, timeoutMs: 50 },
    cursor,
  };
  return {
    ...store,
    embed,
    cursor,
    secretModel,
    deps,
    run: (o: Partial<BackfillOptions> = {}, d: Partial<BackfillDeps> = {}) =>
      backfill({ ...options, ...o }, { ...deps, ...d }),
  };
}

describe('backfill-remembered-facts', () => {
  it('dry run (the default) counts the model calls a run makes, and checks, embeds, writes and saves nothing', async () => {
    const h = harness({ dryRun: true });
    expect(await h.run()).toEqual({
      scanned: 10,
      skipped: 3,
      notKept: 1,
      notMember: 0,
      forgotten: 0,
      toCheck: 6,
      secret: 0,
      unchecked: 0,
      toWrite: 0,
      noVector: 0,
      created: 0,
      existing: 0,
      failed: 0,
      requests: 0,
    });
    expect(h.secretModel).not.toHaveBeenCalled();
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
    expect(await h.run()).toMatchObject({ forgotten: 1, toCheck: 6, toWrite: 0, created: 0 });
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
      // The word rules caught it: the model is never asked (#2514 order)
      expect(h.secretModel.mock.calls.map(([, input]) => input).join(' ')).not.toContain(content.slice(0, 8)); // prettier-ignore
      expect(h.secretModel).toHaveBeenCalledTimes(6);
    }
  );
});

describe('backfill-remembered-facts: the model secret check (#2514 secret-check.ts)', () => {
  const DOOR = 'the side gate opens with twenty twenty';
  const withDoor = (h: ReturnType<typeof harness>) => {
    h.memories.set('bogle_users/test-user-0/memories/mem_door', { content: DOOR, type: 'summary' });
    return h;
  };
  const embeddedText = (h: ReturnType<typeof harness>) => h.embed.mock.calls.flatMap(([t]) => t).join(' '); // prettier-ignore

  it('model yes: not embedded or written', async () => {
    const h = withDoor(harness());
    expect(await h.run({}, { secretCheck: { model: fakeModel(['side gate']) } })).toMatchObject({
      toCheck: 7,
      secret: 1,
      toWrite: 6,
      created: 6,
    });
    expect(embeddedText(h)).not.toContain('side gate');
    expect([...h.facts.values()].map((d) => d.value)).not.toContain(DOOR);
  });

  it('model no: embedded and written', async () => {
    const h = withDoor(harness());
    expect(await h.run()).toMatchObject({ toCheck: 7, secret: 0, unchecked: 0, created: 7 });
    expect([...h.facts.values()].map((d) => d.value)).toContain(DOOR);
  });

  const noAnswer: Array<[string, SecretModel | undefined]> = [
    ['a timeout', () => new Promise<string>(() => {})],
    ['an error', async () => Promise.reject(new Error('vertex 503'))],
    ['an unclear reply', async () => 'maybe?'],
    ['no model', undefined],
  ];
  it.each(noAnswer)(
    '%s: unchecked, nothing embedded or written (fails closed)',
    async (_, model) => {
      const h = harness();
      expect(await h.run({}, { secretCheck: { model, timeoutMs: 20 } })).toMatchObject({
        toCheck: 6,
        unchecked: 6,
        toWrite: 0,
        created: 0,
      });
      expect(h.embed).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      expect(h.cursor.write).not.toHaveBeenCalled(); // a rerun retries them
    }
  );

  it('at most 4 model calls at once', async () => {
    const h = harness({ batch: 20 }); // one group: all 6 checked together
    let inFlight = 0;
    let most = 0;
    const model = vi.fn<SecretModel>(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return '{"secret":false}';
    });
    expect(await h.run({}, { secretCheck: { model } })).toMatchObject({ created: 6 });
    expect(model).toHaveBeenCalledTimes(6);
    expect(most).toBe(4);
  });

  it('logs counts only: no fact text reaches the log', async () => {
    const lines: string[] = [];
    const h = withDoor(harness());
    await h.run({}, { log: (c) => lines.push(JSON.stringify(c)) });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toMatch(/remembered thing|side gate/);
  });
});

describe('backfill-remembered-facts: vectors', () => {
  it('an embedding outage writes nothing and is not success; a rerun embeds them', async () => {
    const h = harness();
    const down = vi.fn(async () => Promise.reject(new Error('embed down')));
    expect(await h.run({}, { embed: down })).toMatchObject({ toWrite: 6, noVector: 6, created: 0 });
    expect(h.facts.size).toBe(0);
    expect(h.cursor.write).not.toHaveBeenCalled();
    expect(await h.run()).toMatchObject({ created: 6, noVector: 0 });
    expect([...h.facts.values()].every((d) => d.embedding !== undefined)).toBe(true);
  });

  it('a fact whose vector is the wrong size is not written', async () => {
    const h = harness({ batch: 20 }); // one embedding request; its first vector is short
    const short = vi.fn(async (t: string[]) => t.map((_, i) => new Array(i === 0 ? 3 : 768).fill(0.01))); // prettier-ignore
    expect(await h.run({}, { embed: short })).toMatchObject({ requests: 1, noVector: 1, created: 5 }); // prettier-ignore
  });
});

describe('backfill-remembered-facts: the cursor file', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const fileFor = (uid?: string) => join(dir, defaultCursorFile('ferni-dev', uid));

  it('a --uid trial does not move the full run, which then writes every user', async () => {
    dir = mkdtempSync(join(tmpdir(), 'backfill-cursor-'));
    const h = harness();
    const uid = 'test-user-1';
    expect(await h.run({ uid }, { cursor: fileCursor(fileFor(uid), uid, false) })).toMatchObject({ created: 3 }); // prettier-ignore
    expect(fileFor(uid)).not.toBe(fileFor());
    expect(fileFor(uid)).not.toContain(uid);
    // The 10-23 repro: the full run skipped test-user-0 (3 of 6). Now it finds all 6.
    expect(await h.run({}, { cursor: fileCursor(fileFor(), undefined, false) })).toMatchObject({
      created: 3,
      existing: 3,
    });
    expect(h.facts.size).toBe(6);
  });

  it('a cursor saved by another scope is refused, not resumed; --restart ignores it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'backfill-cursor-'));
    const file = join(dir, 'shared.cursor');
    const h = harness();
    await h.run({ uid: 'test-user-1' }, { cursor: fileCursor(file, 'test-user-1', false) });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ uid: 'test-user-1' });
    await expect(h.run({}, { cursor: fileCursor(file, undefined, false) })).rejects.toThrow(/another run/); // prettier-ignore
    expect(h.facts.size).toBe(3);
    expect(await h.run({}, { cursor: fileCursor(file, undefined, true) })).toMatchObject({ created: 3 }); // prettier-ignore
  });

  it('end to end: dry run, a limited run, then a resume over the same file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'backfill-cursor-'));
    const h = harness();
    const cursor = () => fileCursor(fileFor(), undefined, false);
    expect(await h.run({ dryRun: true }, { cursor: cursor() })).toMatchObject({ toCheck: 6, created: 0 }); // prettier-ignore
    expect(h.facts.size).toBe(0);
    await h.run({ limit: 4 }, { cursor: cursor() });
    const first = h.facts.size;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(6);
    const resumed = await h.run({}, { cursor: cursor() });
    expect(resumed).toMatchObject({ created: 6 - first, existing: 0 });
    expect(h.create).toHaveBeenCalledTimes(6); // nothing created twice
    expect(h.secretModel).toHaveBeenCalledTimes(6); // nothing checked twice
  });
});
