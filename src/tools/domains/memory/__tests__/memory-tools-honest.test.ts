/**
 * MEMORY_TOOLS_HONEST: no memory tool claims to remember what the store recall reads
 * doesn't hold. The live tools write; the call-start recall's own reader
 * (loadRecallSnapshot over firestoreRecallStore) reads the same database. Only the
 * database, the memories service, the secret-check model and the search indexes are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A Firestore holding documents by path: create, get, update, batches, and (unordered)
// collection reads, which is all the remember write, the update and recall use.
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const depth = (p: string) => p.split('/').length;
  const apply = (path: string, data: Record<string, unknown>) => {
    const next = { ...docs.get(path) };
    // FieldValue.delete() and other sentinels: the field goes
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && v.constructor?.name !== 'Object') delete next[k];
      else next[k] = v;
    }
    docs.set(path, next);
  };
  const ref = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name: string) => col(`${path}/${name}`),
    create: async (data: Record<string, unknown>) => {
      if (docs.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
      docs.set(path, data);
    },
    set: async (data: Record<string, unknown>) => docs.set(path, data),
    update: async (data: Record<string, unknown>) => apply(path, data),
  });
  const col = (path: string) => {
    const eq: Array<[string, unknown]> = []; // where(field, '==', value), as the copies read uses
    const rows = () =>
      [...docs.keys()].filter(
        (p) =>
          p.startsWith(`${path}/`) &&
          depth(p) === depth(path) + 1 &&
          eq.every(([f, v]) => docs.get(p)?.[f] === v)
      );
    const q: Record<string, unknown> = {
      orderBy: () => q,
      where: (field: string, _op: string, value: unknown) => {
        eq.push([field, value]);
        return q;
      },
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
  const batch = () => {
    const ops: Array<() => void> = [];
    return {
      update: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => apply(r.path, data)),
      create: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => docs.set(r.path, data)),
      commit: async () => ops.forEach((op) => op()),
    };
  };
  return { docs, db: { collection: (name: string) => col(name), batch } };
});
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));
const memories = vi.hoisted(() => ({
  write: vi.fn(async () => ({ success: true, memoryId: 'mem_1' })),
  search: vi.fn(async (): Promise<string | null> => null),
  recordFeedback: vi.fn(),
}));
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => memories,
}));
// The secret check's model clears every fact here (remember-secret-check.test.ts)
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({
    models: { generateContent: async () => ({ text: '{"secret":false}' }) },
  }),
}));
// A forgotten fact's copies leave the search indexes; there are none here
vi.mock('../../../../memory/retrieval/conversation-index.js', () => ({
  removeConversationDocument: async () => undefined,
}));
vi.mock('../../../../memory/retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async () => undefined,
}));

// The agent process wires the Firestore fact store (gce/job-executor.ts loads this).
import '../../../../agents/remembered-fact-store-register.js';
import { firestoreRecallStore } from '../../../../agents/multi-agent/recall-firestore-store.js';
import { loadRecallSnapshot } from '../../../../memory/recall/session-recall.js';
import { rememberAboutUserUnifiedDef, rememberImportantFactUnifiedDef } from '../tools-unified.js';
import { predictUserNeedUnifiedDef } from '../tools-unified.js';
import { updateMemoryDef } from '../tools.js';
import { AMBIGUOUS, NO_MATCH, UPDATED } from '../honest-memory.js';
import { REMEMBERED, REMEMBERED_THIS_CALL } from '../remember-results.js';
import type { ToolDefinition } from '../../../registry/types.js';

let uid = 'u-honest-0';
let n = 0;

/** Runs the live tool as the agent would, for this test's caller. */
async function run(def: ToolDefinition, args: Record<string, unknown>): Promise<string> {
  const tool = def.create({ agentId: 'ferni' } as never) as unknown as {
    execute: (a: Record<string, unknown>, o: unknown) => Promise<string>;
  };
  return tool.execute(args, { ctx: { userData: { userId: uid } } });
}
const remember = async (fact: string) =>
  run(rememberAboutUserUnifiedDef, { fact, category: 'personal', importance: 'high' });

/** What the next call's recall holds: the call-start reader, over the same database. */
async function recalled(): Promise<string[]> {
  const snap = await loadRecallSnapshot(firestoreRecallStore, uid);
  return snap.facts.map((f) => f.value);
}
const factDocs = () => [...fs.docs.keys()].filter((p) => p.includes(`${uid}/dynamic_facts/`));

beforeEach(() => {
  uid = `u-honest-${++n}`; // the shared forgotten-topics read is per caller
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fs.docs.clear();
});

describe('rememberAboutUser', () => {
  it('on: what it remembers is what the next call recalls, and only there', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    expect(await recalled()).toEqual([]);
    expect(await remember('my sister Dana is moving to Denver in June')).toBe(REMEMBERED);
    expect(await recalled()).toEqual(['my sister Dana is moving to Denver in June']);
    expect(memories.write).not.toHaveBeenCalled(); // one copy, where recall reads
  });

  it('off (the default): written to memories, and the next call recalls nothing', async () => {
    expect(await remember('my sister Dana is moving to Denver in June')).toBe(REMEMBERED);
    expect(memories.write).toHaveBeenCalledTimes(1);
    expect(await recalled()).toEqual([]);
  });

  it('on: a phone number is not kept, and the tool says so', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    const said = await remember("Dana's new number is (202) 555-0147");
    expect(said).toMatch(/^Not saved: phone numbers and emails/);
    expect(factDocs()).toEqual([]);
    expect(memories.write).not.toHaveBeenCalled();
  });

  it('on: a fact about a forgotten topic is not kept, and the tool says so', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    fs.docs.set(`bogle_users/${uid}/memory_state/forgotten`, { topics: ['divorce'] });
    const said = await remember('the divorce papers came through');
    expect(said).toMatch(/^Not saved: it's about something they asked you to forget/);
    expect(factDocs()).toEqual([]);
  });

  it('on: an anonymous caller is told it is kept for this call only', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    uid = 'anon:caller-1';
    expect(await remember('likes jazz')).toBe(REMEMBERED_THIS_CALL);
    expect(factDocs()).toEqual([]);
  });
});

describe('rememberImportantFact', () => {
  const important = async (fact: string) =>
    run(rememberImportantFactUnifiedDef, { fact, type: 'milestone', emotionalWeight: 'heavy' });

  it('on: the next call recalls it, and memories gets no copy', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    await important('finished chemo in March');
    expect(await recalled()).toEqual(['finished chemo in March']);
    expect(memories.write).not.toHaveBeenCalled();
  });

  it('off: written to memories only, as before', async () => {
    await important('finished chemo in March');
    expect(memories.write).toHaveBeenCalledTimes(1);
    expect(await recalled()).toEqual([]);
  });
});

describe('updateMemory', () => {
  const update = async (originalFact: string, updatedFact: string) =>
    run(updateMemoryDef, { originalFact, updatedFact, reason: 'correction' });

  it('on: replaces the fact recall holds; the next call recalls the new one only', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    await remember('my sister Dana lives in Denver');
    expect(await recalled()).toEqual(['my sister Dana lives in Denver']);
    expect(await update('her sister lives in Denver', 'my sister Dana lives in Boston now')).toBe(
      UPDATED
    );
    expect(await recalled()).toEqual(['my sister Dana lives in Boston now']);
  });

  it('on: nothing matches, nothing is written, and it says so', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    await remember('my sister Dana lives in Denver');
    const before = new Map(fs.docs);
    expect(await update('his dog is a beagle', 'his dog is a corgi')).toBe(NO_MATCH);
    expect(fs.docs).toEqual(before);
    expect(await recalled()).toEqual(['my sister Dana lives in Denver']);
  });

  it('on: two facts match equally, nothing is changed', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    await remember('my sister Dana lives in Denver');
    await remember('my sister Mia lives in Austin');
    expect(await update('my sister lives', 'my sister lives in Boston')).toBe(AMBIGUOUS);
    expect((await recalled()).sort()).toEqual([
      'my sister Dana lives in Denver',
      'my sister Mia lives in Austin',
    ]);
  });

  it('off: changes nothing recall reads and returns nothing, as before', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on'); // so there is a fact to (not) update
    await remember('my sister Dana lives in Denver');
    await vi.waitFor(() => expect(factDocs()).toHaveLength(1));
    expect(await update('sister lives in Denver', 'my sister Dana lives in Boston')).toBe('');
    expect(await recalled()).toEqual(['my sister Dana lives in Denver']);
  });
});

describe('predictUserNeed', () => {
  const predict = async () =>
    run(predictUserNeedUnifiedDef, {
      context: 'mentioned a long day',
      prediction: 'might want help winding down',
      confidence: 'medium',
    });

  it('on: writes nothing anywhere, and labels the guess as a guess', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    const said = await predict();
    expect(said).toMatch(/^A guess, not something they told you: might want help winding down\./);
    expect(memories.write).not.toHaveBeenCalled();
    expect([...fs.docs.keys()]).toEqual([]);
  });

  it('off: stores the guess as a memory, as before', async () => {
    await predict();
    expect(memories.write).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/^Prediction: /) })
    );
  });
});
