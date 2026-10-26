/**
 * REMEMBER_TO_RECALL (#2474): what a caller asks Ferni to remember on one call
 * is recalled by meaning on the next. The live rememberAboutUser tool writes on
 * call 1; the live recall hook, over the same database, reads on call 2. Only
 * the database, the memories write and the embedding model are fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// A Firestore holding documents by path: create, get, subcollections, and
// (unordered) collection reads, which is all the remember write and recall use.
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const depth = (p: string) => p.split('/').length;
  const ref = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name: string) => col(`${path}/${name}`),
    create: async (data: Record<string, unknown>) => {
      if (docs.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
      docs.set(path, data);
    },
  });
  const col = (path: string) => {
    const rows = () =>
      [...docs.keys()].filter((p) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1);
    const q: Record<string, unknown> = {
      orderBy: () => q,
      where: () => q,
      limit: () => q,
      get: async () => {
        const paths = rows();
        const found = paths.map((p) => ({ id: p.split('/').pop(), data: () => docs.get(p) }));
        return { empty: paths.length === 0, docs: found };
      },
      doc: (id: string) => ref(`${path}/${id}`),
    };
    return q;
  };
  return { docs, db: { collection: (name: string) => col(name) } };
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));
vi.mock('../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write: async () => ({ success: true, memoryId: 'mem_1' }) }),
}));
// The secret check's model (remember-secret-check.test.ts) clears every fact here
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({
    models: { generateContent: async () => ({ text: '{"secret":false}' }) },
  }),
}));

// The agent process wires the Firestore fact store (gce/job-executor.ts loads this).
import '../../remembered-fact-store-register.js';
import { createMemoryRecall } from '../memory-recall-hook.js';
import { rememberAboutUserUnifiedDef } from '../../../tools/domains/memory/tools-unified.js';
import type { RetrievalEmbedder } from '../../../memory/recall/semantic-recall.js';

/** Texts about the same thing share an axis, whatever words they use. */
const TOPICS: RegExp[] = [/moving to Denver|relocat/i, /retriever|pup/i, /pottery|clay/i];
const fakeEmbed: RetrievalEmbedder = async (texts) =>
  texts.map((t) => {
    const hit = TOPICS.findIndex((re) => re.test(t));
    return [...TOPICS.map((_, i) => (i === hit ? 1 : 0.05)), 0.05, 0.05, 0.05, 0.05];
  });
const settle = async () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });
const UID = 'u-remember-test';
const FACTS = `bogle_users/${UID}/dynamic_facts/`;

/** Call 1: the caller asks Ferni to remember something. */
async function remember(fact: string) {
  const tool = rememberAboutUserUnifiedDef.create({ agentId: 'ferni' } as never) as unknown as {
    execute: (args: Record<string, string>, opts: unknown) => Promise<string>;
  };
  await tool.execute(
    { fact, category: 'personal', importance: 'high' },
    { ctx: { userData: { userId: UID } } }
  );
}

/** Call 2: what the recall note holds for each of these turns. */
async function nextCall(turns: string[], semantic = true): Promise<string[]> {
  const recall = createMemoryRecall({
    userId: UID,
    userName: 'Sam',
    semantic,
    embed: fakeEmbed,
    episodes: false,
    summaries: false,
  });
  await recall.ready;
  await settle(); // the call-start index
  recall.noteFor('hey there');
  recall.newTurn();
  const notes: string[] = [];
  for (const said of turns) {
    const parts = [recall.noteFor(said, { final: false })];
    await settle(); // the turn's embedding
    parts.push(recall.noteFor(said));
    recall.newTurn();
    notes.push(parts.filter(Boolean).join('\n'));
  }
  return notes;
}

const factDocs = () => [...fs.docs.keys()].filter((p) => p.startsWith(FACTS));

afterEach(() => {
  vi.unstubAllEnvs();
  fs.docs.clear();
});

describe('REMEMBER_TO_RECALL: remembered on call 1, recalled by meaning on call 2', () => {
  it('on: a remembered fact comes back for a turn that means it', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    await remember('my sister Dana is moving to Denver in June');
    await vi.waitFor(() => expect(factDocs()).toHaveLength(1));
    expect(fs.docs.get(factDocs()[0])).toMatchObject({
      source: 'caller_asserted',
      memoryId: 'mem_1',
      value: 'my sister Dana is moving to Denver in June',
    });

    const [asked] = await nextCall(['where is my sister relocating']);
    expect(asked).toContain('moving to Denver');
    // No word in common with the fact: only its meaning finds it.
    const [paraphrase] = await nextCall(['any news on that big relocation']);
    expect(paraphrase).toContain('moving to Denver');
    const [byWordsOnly] = await nextCall(['any news on that big relocation'], false);
    expect(byWordsOnly).not.toContain('moving to Denver');
  });

  it('on: a PIN the caller asked to remember never becomes a recallable fact', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on'); // SPOKEN_CREDENTIAL_FILTER left off
    await remember("User's PIN is 4321");
    await settle();
    expect(factDocs()).toEqual([]);
  });

  it('off (the default): the remember tool writes no fact, and the next call recalls nothing', async () => {
    await remember('my sister Dana is moving to Denver in June');
    await settle();
    expect(factDocs()).toEqual([]);
    const [asked] = await nextCall(['where is my sister relocating']);
    expect(asked).not.toContain('Denver');
  });
});
