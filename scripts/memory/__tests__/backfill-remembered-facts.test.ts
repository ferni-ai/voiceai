import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backfill,
  databaseRefusal,
  main,
  type BackfillDeps,
  type BackfillOptions,
  type MemorySource,
} from '../backfill-remembered-facts.js';
import {
  defaultCursorFile,
  fileCursor,
  firestoreMemorySource,
} from '../backfill-remembered-facts-io.js';
import type { Firestore } from '@google-cloud/firestore';
import type { SecretModel } from '../../../src/memory/secret-check.js';
import type { FactDocWrite } from '../../../src/memory/dynamic/remembered-facts.js';
import { forgetTopic, type ForgetStore } from '../../../src/memory/recall/forget.js';

/**
 * memories in memory, in path order, and the dynamic_facts the run creates.
 * Seeds: 2 users x 3 remembered facts, plus one of each kind that is left out.
 */
function fakeStore(topics: Record<string, string[] | null | Error> = {}) {
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
    forgottenTopics: async (userId) => {
      const t = userId in topics ? topics[userId] : [];
      if (t instanceof Error) throw t;
      return t;
    },
    existing: vi.fn(async (userId: string, ids: string[]) => {
      return new Set(ids.filter((id) => facts.has(`bogle_users/${userId}/dynamic_facts/${id}`)));
    }),
  };
  return { facts, create, source, memories, topics };
}

/** The secret-check model: a clear no unless the text is in `secrets`. */
const fakeModel = (secrets: string[] = []) =>
  vi.fn<SecretModel>(async (_p, content) =>
    secrets.some((t) => content.includes(t)) ? '{"secret":true}' : '{"secret":false}'
  );

function harness(
  opts: Partial<BackfillOptions> = {},
  topics: Record<string, string[] | null | Error> = {}
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
      unreadUsers: 0,
      existing: 0,
      toCheck: 6,
      secret: 0,
      unchecked: 0,
      toWrite: 0,
      noVector: 0,
      created: 0,
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
    expect(await again.run()).toMatchObject({ toCheck: 0, created: 0, existing: 6 });
    // Found before the model call: a rerun re-sends nothing to the model or the embedder
    expect(again.secretModel).not.toHaveBeenCalled();
    expect(again.embed).not.toHaveBeenCalled();
    expect(again.create).not.toHaveBeenCalled();
  });

  it('a fact already there (live or forgotten one by one) is never sent to the model, embedded or written over', async () => {
    const h = harness();
    await h.run({ limit: 4 });
    const [path] = [...h.facts.keys()];
    h.facts.set(path!, { value: 'forgotten', forgottenAt: '2026-10-01' });
    const sent = h.secretModel.mock.calls.length;
    const again = harness();
    for (const [p, d] of h.facts) again.facts.set(p, d);
    expect(await again.run()).toMatchObject({ existing: h.facts.size, created: 6 - h.facts.size });
    expect(again.secretModel).toHaveBeenCalledTimes(6 - sent);
    expect(again.facts.get(path!)).toEqual({ value: 'forgotten', forgottenAt: '2026-10-01' });
  });

  it('when the existing facts cannot be read, nothing is sent and the cursor holds', async () => {
    const h = harness();
    h.source.existing = async () => Promise.reject(new Error('unavailable'));
    expect(await h.run()).toMatchObject({ failed: 6, toCheck: 0, created: 0 });
    expect(h.secretModel).not.toHaveBeenCalled();
    expect(h.embed).not.toHaveBeenCalled();
    expect(h.cursor.write).not.toHaveBeenCalled();
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

describe('backfill-remembered-facts: forgotten, always (no flag)', () => {
  const DANA = 'my sister Dana is moving to Denver';
  const DIVORCE = 'the divorce papers are with my lawyer';
  const withDana = (h: ReturnType<typeof harness>) => {
    h.memories.set('bogle_users/test-user-0/memories/mem_dana', { content: DANA, type: 'summary' });
    return h;
  };
  const written = (h: ReturnType<typeof harness>) => [...h.facts.values()].map((d) => d.value);
  const embedded = (h: ReturnType<typeof harness>) => h.embed.mock.calls.flatMap(([t]) => t).join(' '); // prettier-ignore
  const sent = (h: ReturnType<typeof harness>) => h.secretModel.mock.calls.map(([, t]) => t).join(' '); // prettier-ignore
  afterEach(() => vi.unstubAllEnvs());

  it.each(['on', 'off', undefined])(
    'FORGET_EVERY_READER=%s: a fact forgotten with the real forgetTopic is never checked, embedded or written',
    async (flag) => {
      if (flag !== undefined) vi.stubEnv('FORGET_EVERY_READER', flag);
      else vi.stubEnv('FORGET_EVERY_READER', '');
      const h = harness();
      h.memories.set('bogle_users/test-user-0/memories/mem_div', { content: DIVORCE, type: 'summary' }); // prettier-ignore
      // The 10-24 repro: the fact lived only in memories, so forgetTopic marked nothing
      const store: ForgetStore = {
        facts: async () => [],
        markForgotten: async () => {},
        addTopic: async (u, topic) => void (h.topics[u] = [...((h.topics[u] as string[]) ?? []), topic]), // prettier-ignore
        topics: async () => [],
      };
      expect(await forgetTopic('test-user-0', 'the divorce', store)).toEqual({ kind: 'forgotten', marked: 0 }); // prettier-ignore
      expect(await h.run()).toMatchObject({ forgotten: 1, toWrite: 6, created: 6, failed: 0 });
      expect(written(h)).not.toContain(DIVORCE);
      expect(embedded(h)).not.toMatch(/divorce/);
      expect(sent(h)).not.toMatch(/divorce/);
    }
  );

  it("a name forgotten with forgetTopic: what forgetTopic itself would have marked stays out ('marked')", async () => {
    const h = harness();
    const MARKED = 'I marked the calendar for the trip';
    h.memories.set('bogle_users/test-user-0/memories/mem_mark', { content: MARKED, type: 'summary' }); // prettier-ignore
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => {},
      addTopic: async (u, topic) => void (h.topics[u] = [topic]),
      topics: async () => [],
    };
    await forgetTopic('test-user-0', 'Mark', store);
    expect(await h.run()).toMatchObject({ forgotten: 1, created: 6 });
    expect(written(h)).not.toContain(MARKED);
  });

  it("a forgotten topic leaves the user's other facts and other users alone", async () => {
    const h = withDana(harness({}, { 'test-user-0': ['dana'] }));
    expect(await h.run()).toMatchObject({ forgotten: 1, toWrite: 6, created: 6, failed: 0 });
    expect(written(h)).not.toContain(DANA);
    expect(embedded(h)).not.toMatch(/Dana/);
  });

  it('a dry run counts it too', async () => {
    const h = withDana(harness({ dryRun: true }, { 'test-user-0': ['dana'] }));
    expect(await h.run()).toMatchObject({ forgotten: 1, toCheck: 6, toWrite: 0, created: 0 });
    expect(h.embed).not.toHaveBeenCalled();
  });

  it.each([
    ['unreadable', null],
    ['a failed read', new Error('deadline exceeded')],
  ])(
    'topics %s: the whole user is skipped, counted, and the cursor holds (fails closed)',
    async (_, t) => {
      const h = withDana(harness({}, { 'test-user-0': t }));
      expect(await h.run()).toMatchObject({ unreadUsers: 1, forgotten: 5, created: 3 });
      expect([...h.facts.keys()].every((p) => p.startsWith('bogle_users/test-user-1/'))).toBe(true);
      expect(sent(h)).not.toMatch(/Dana|number 0|number 2|number 4/);
      expect(h.cursor.write).not.toHaveBeenCalled();
    }
  );

  it('a memory marked forgottenAt is never copied', async () => {
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

  it('each verdict stays with its own fact when the model answers out of order', async () => {
    const h = withDoor(harness({ batch: 20 }));
    // The first text sent answers last; only the door text is a secret
    let sentSoFar = 0;
    const model = vi.fn<SecretModel>(async (_p, content) => {
      await new Promise((r) => setTimeout(r, 40 - 5 * sentSoFar++));
      return content.includes('side gate') ? '{"secret":true}' : '{"secret":false}';
    });
    expect(await h.run({}, { secretCheck: { model, timeoutMs: 500 } })).toMatchObject({ secret: 1, created: 6 }); // prettier-ignore
    expect([...h.facts.values()].map((d) => d.value)).not.toContain(DOOR);
    expect(embeddedText(h)).not.toContain('side gate');
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

  it('the default file is per database and per --uid', () => {
    expect(defaultCursorFile('ferni-dev')).not.toBe(defaultCursorFile('ferni-staging'));
    expect(defaultCursorFile('ferni-dev', 'u1')).not.toBe(defaultCursorFile('ferni-staging', 'u1'));
    expect(defaultCursorFile('ferni-dev', 'u1')).not.toBe(defaultCursorFile('ferni-dev', 'u2'));
  });

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

describe('backfill-remembered-facts: main() exit codes', () => {
  let dir = '';
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const ENV = { GOOGLE_CLOUD_PROJECT: 'test-project' };
  const runMain = (
    h: ReturnType<typeof harness>,
    extra: string[] = [],
    env: Record<string, string | undefined> = ENV
  ) => {
    // prettier-ignore
    dir ||= mkdtempSync(join(tmpdir(), 'backfill-main-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cursor: _c, ...connected } = h.deps;
    const argv = ['--database=ferni-dev', '--dry-run=false', '--rate=1000', `--cursor=${join(dir, 'c')}`, ...extra]; // prettier-ignore
    return main(argv, env, () => connected);
  };

  it('0 when everything is written, and a rerun (all existing) is 0 too', async () => {
    const h = harness();
    expect(await runMain(h)).toBe(0);
    expect(h.facts.size).toBe(6);
    expect(await runMain(h, ['--restart'])).toBe(0);
    expect(h.create).toHaveBeenCalledTimes(6);
  });

  it.each<[string, (h: ReturnType<typeof harness>) => void]>([
    ['a fact left unchecked', (h) => void (h.deps.secretCheck = { model: async () => 'maybe', timeoutMs: 20 })], // prettier-ignore
    ['a fact with no vector', (h) => void (h.deps.embed = async () => Promise.reject(new Error('down')))], // prettier-ignore
    ['a failed create', (h) => void (h.source.create = async () => Promise.reject(new Error('x')))],
    ['a user whose topics cannot be read', (h) => void (h.topics['test-user-1'] = null)],
    ['existing facts that cannot be read', (h) => void (h.source.existing = async () => Promise.reject(new Error('x')))], // prettier-ignore
  ])('1 with %s', async (_, breakIt) => {
    const h = harness();
    breakIt(h);
    expect(await runMain(h)).toBe(1);
  });

  it('1 on a refusal or a missing project, touching nothing', async () => {
    const refused = harness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['--database=(default)'], ENV, () => refused.deps)).toBe(1);
    expect(await main(['--database=ferni-dev'], {}, () => refused.deps)).toBe(1);
    expect(refused.source.existing).not.toHaveBeenCalled();
  });
});

describe('backfill-remembered-facts: the Firestore source reads --database', () => {
  /** Just the paths the source walks: docs by path, as --database holds them. */
  function fakeDb(docs: Record<string, Record<string, unknown>>) {
    const ref = (path: string): Record<string, unknown> => ({
      path,
      id: path.split('/').pop(),
      collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
      get: async () => ({ exists: path in docs, data: () => docs[path] }),
    });
    const getAll = vi.fn(
      async (...refs: Array<{ path: string; id: string } | object>) =>
      (refs.filter((r) => 'path' in r) as Array<{ path: string; id: string }>).map((r) => ({ id: r.id, exists: r.path in docs })) // prettier-ignore
    );
    const db = { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }), getAll }; // prettier-ignore
    return { db: db as unknown as Firestore, getAll };
  }

  it("forgotten topics come from the user's memory_state/forgotten (malformed reads as null)", async () => {
    const { db } = fakeDb({
      'bogle_users/u1/memory_state/forgotten': { topics: ['dana'] },
      'bogle_users/u2/memory_state/forgotten': { topics: 'dana' },
    });
    const source = firestoreMemorySource(db);
    expect(await source.forgottenTopics('u1')).toEqual(['dana']);
    expect(await source.forgottenTopics('u2')).toBeNull();
    expect(await source.forgottenTopics('u3')).toEqual([]);
  });

  it("existing: which ids are already in the user's dynamic_facts", async () => {
    const { db, getAll } = fakeDb({ 'bogle_users/u1/dynamic_facts/a': { value: 'x' } });
    expect(await firestoreMemorySource(db).existing('u1', ['a', 'b'])).toEqual(new Set(['a']));
    expect(getAll.mock.calls[0]!.at(-1)).toEqual({ fieldMask: [] }); // reads no fact text
  });
});
