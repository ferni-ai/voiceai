/**
 * CHAT_REMEMBER_TO_RECALL (#2518): what a caller asks Ferni to remember in text
 * chat is recalled by meaning on a later call.
 *
 * The chat API's entry (executeTool, as api/chat-routes.ts calls it, with
 * chatToolContext's shape: a userId, no session) runs the memory executor's
 * rememberAboutUser; the live recall hook reads the same database on the next
 * call. Only the database, the embedding models, the vector index, the
 * memory_saved sender and the cohort store are fakes (and, for corrections, the
 * Firestore side of memory-control). The first tests do not load the fact-store
 * registration: the chat path must load it itself, as the UI server does not.
 * updateMemory runs the same way; flags come from the caller's cohort, as the
 * UI server never puts them in process.env. Fictional users and facts only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A Firestore holding documents by path: add, create, get and collection reads.
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const failCreateFor = new Set<string>();
  let auto = 0;
  const depth = (p: string) => p.split('/').length;
  const ref = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name: string) => col(`${path}/${name}`),
    update: async (data: Record<string, unknown>) => {
      docs.set(path, { ...docs.get(path), ...data });
    },
    create: async (data: Record<string, unknown>) => {
      if ([...failCreateFor].some((uid) => path.includes(`/${uid}/`))) throw new Error('unavailable'); // prettier-ignore
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
        // A snapshot, as Firestore's: data() is what the doc held when read
        const found = paths.map((p) => {
          const snap = docs.get(p);
          return { id: p.split('/').pop(), data: () => snap, ref: ref(p) };
        });
        return { empty: paths.length === 0, docs: found };
      },
      doc: (id: string) => ref(`${path}/${id}`),
      add: async (data: Record<string, unknown>) => {
        const id = `auto_${++auto}`;
        docs.set(`${path}/${id}`, data);
        return { id };
      },
    };
    return q;
  };
  return { docs, failCreateFor, db: { collection: (name: string) => col(name) } };
});
const sent = vi.hoisted(() => ({ saved: [] as unknown[], indexed: 0 }));

vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fs.db }));
vi.mock('../../../../memory/embeddings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/embeddings.js')>()),
  embed: async () => [0.1, 0.2],
}));
vi.mock('../../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => void sent.indexed++ }),
}));
vi.mock('../../../../tools/domains/memory/memory-saved.js', () => ({
  announceMemorySaved: async (m: unknown) => void sent.saved.push(m),
}));
// The secret check's model clears every fact here (remember-secret-check.test.ts covers a yes)
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({
    models: { generateContent: async () => ({ text: '{"secret":false}' }) },
  }),
}));
// Cohorts, as feature_cohorts holds them: one member in a cohort that turns the flags on
const cohorts = vi.hoisted(() => ({ members: new Map<string, Record<string, string>>() }));
vi.mock('../../../../services/platform/cohort-firestore.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/platform/cohort-firestore.js')>()),
  firestoreCohortStore: {
    cohortsFor: async (uid: string) => {
      const flags = cohorts.members.get(uid);
      return flags ? [{ id: 'friends', enabled: true, flags }] : [];
    },
    overridesFor: async () => ({}),
    sampledCohorts: async () => [],
  },
}));
// The real writer, watched: did the chat path try a recall write at all?
const writer = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../../services/memory/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../services/memory/index.js')>();
  return {
    ...real,
    keepForRecall: async (...args: Parameters<typeof real.keepForRecall>) => {
      const out = await real.keepForRecall(...args);
      writer.calls.push([...args, out]);
      return out;
    },
  };
});

import { executeTool } from '../../tool-dispatcher.js';
import { createMemoryRecall } from '../../../multi-agent/memory-recall-hook.js';
import { rememberedFactDoc } from '../../../../memory/dynamic/remembered-facts.js';
import { useRememberedFactControl } from '../../../../memory/dynamic/replace-remembered.js';
import type { MemoryControlStore } from '../../../../memory/recall/memory-control.js';
import { forgetFlagCache } from '../../../../services/platform/cohort-flags.js';
import type { RetrievalEmbedder } from '../../../../memory/recall/semantic-recall.js';

const UID = 'u-chat-remember-test';
const DENVER = 'my sister Dana is moving to Denver in June';
const prefix = (uid: string, col: string) => `bogle_users/${uid}/${col}/`;
const docsIn = (col: string, uid = UID) =>
  [...fs.docs.keys()].filter((p) => p.startsWith(prefix(uid, col)));

/** The chat API's call: executeTool with chatToolContext's shape (no session). */
async function chatRemember(fact: string, userId = UID) {
  return executeTool(
    { name: 'rememberAboutUser', args: { fact, category: 'personal', importance: 'high' } },
    { userId, personaId: 'ferni', inputText: `remember that ${fact}` }
  );
}

/** The chat API's correction: updateMemory, as the model calls it. */
async function chatCorrect(oldFact: string, newFact: string, userId = UID) {
  return executeTool({ name: 'updateMemory', args: { oldFact, newFact } }, { userId, personaId: 'ferni' }); // prettier-ignore
}

/** memory-control-store.ts over the fake database: facts, copies, and a forget that marks. */
const control: MemoryControlStore = {
  facts: async (uid) => docsIn('dynamic_facts', uid).map((p) => ({ id: p.split('/').pop() as string, data: fs.docs.get(p) ?? {} })), // prettier-ignore
  fact: async (uid, id) => fs.docs.get(`${prefix(uid, 'dynamic_facts')}${id}`) ?? null,
  copies: async (uid, d) =>
    (await control.facts(uid)).filter(
      (f) => f.data.entityName === d.entityName && f.data.key === d.key && f.data.value === d.value
    ),
  forgotten: async () => [],
  forget: async (uid, id, data, at) => void fs.docs.set(`${prefix(uid, 'dynamic_facts')}${id}`, { ...data, forgottenAt: at }), // prettier-ignore
  correct: async () => {
    throw new Error('not used by replaceRemembered');
  },
};
const live = (uid = UID) =>
  docsIn('dynamic_facts', uid)
    .map((p) => fs.docs.get(p) ?? {})
    .filter((d) => d.forgottenAt === undefined)
    .map((d) => d.value);

/** Texts about the same thing share an axis, whatever words they use. */
const TOPICS: RegExp[] = [
  /moving to (?:Denver|Austin)|relocat/i,
  /retriever|pup/i,
  /pottery|clay/i,
];
const fakeEmbed: RetrievalEmbedder = async (texts) =>
  texts.map((t) => {
    const hit = TOPICS.findIndex((re) => re.test(t));
    return [...TOPICS.map((_, i) => (i === hit ? 1 : 0.05)), 0.05, 0.05, 0.05, 0.05];
  });
const settle = async () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

/** The next voice call: what the recall note holds for this turn. */
async function nextCall(said: string): Promise<string> {
  const recall = createMemoryRecall({
    userId: UID,
    userName: 'Sam',
    semantic: true,
    embed: fakeEmbed,
    episodes: false,
    summaries: false,
  });
  await recall.ready;
  await settle(); // the call-start index
  recall.noteFor('hey there');
  recall.newTurn();
  const parts = [recall.noteFor(said, { final: false })];
  await settle(); // the turn's embedding
  parts.push(recall.noteFor(said));
  return parts.filter(Boolean).join('\n');
}

afterEach(() => {
  vi.unstubAllEnvs();
  fs.docs.clear();
  fs.failCreateFor.clear();
  sent.saved.length = 0;
  sent.indexed = 0;
  writer.calls.length = 0;
  cohorts.members.clear();
  forgetFlagCache();
});

describe('CHAT_REMEMBER_TO_RECALL: remembered in text chat, recalled on a later call', () => {
  it('off (the default): only the extracted_facts write, and no recall write is tried', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on'); // on in dev: this flag alone must change nothing
    const got = await chatRemember(DENVER);
    expect(got).toMatchObject({ success: true, result: '' });
    expect(docsIn('extracted_facts')).toHaveLength(1);
    expect(fs.docs.get(docsIn('extracted_facts')[0])).toMatchObject({ fact: DENVER, source: 'explicit_mention' }); // prettier-ignore
    expect(sent.saved).toHaveLength(1);
    expect(sent.indexed).toBe(1);
    expect(writer.calls).toEqual([]);
    expect(docsIn('dynamic_facts')).toEqual([]);
  });

  it('on, with REMEMBER_TO_RECALL: the fact is written as the voice tool writes it', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    const got = await chatRemember(DENVER);
    expect(got).toMatchObject({ success: true, result: '' }); // the chat reply is unchanged
    const [extracted] = docsIn('extracted_facts');
    const memoryId = extracted.split('/').pop() as string;
    const voice = rememberedFactDoc({ fact: DENVER, memoryId, category: 'personal' }, 'at');
    expect(docsIn('dynamic_facts')).toEqual([`${prefix(UID, 'dynamic_facts')}${voice?.id}`]);
    expect(fs.docs.get(docsIn('dynamic_facts')[0])).toEqual({
      ...voice?.data,
      extractedAt: expect.any(String),
    });
    expect(fs.docs.get(docsIn('dynamic_facts')[0])).toMatchObject({ source: 'caller_asserted', value: DENVER }); // prettier-ignore
    expect(sent.saved).toHaveLength(1); // memory_saved, as before
  });

  it('on, and recalled by meaning on the next voice call', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    expect(await nextCall('where is my sister relocating')).not.toContain('moving to Denver');
    await chatRemember(DENVER);
    expect(await nextCall('where is my sister relocating')).toContain('moving to Denver');
  });

  it('on, with REMEMBER_TO_RECALL off: the writer refuses and nothing is written for recall', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'off');
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'off');
    const got = await chatRemember(DENVER);
    expect(got).toMatchObject({ success: true, result: '' });
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].at(-1)).toEqual({ kind: 'refused', reason: 'off' });
    expect(docsIn('dynamic_facts')).toEqual([]);
    expect(docsIn('extracted_facts')).toHaveLength(1);
  });

  it('on: a PIN asked to be remembered never becomes a recallable fact', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on'); // SPOKEN_CREDENTIAL_FILTER left off
    await chatRemember("User's PIN is 4321");
    expect(writer.calls[0].at(-1)).toEqual({ kind: 'refused', reason: 'credential' });
    expect(docsIn('dynamic_facts')).toEqual([]);
  });

  it('on: a recall write that fails leaves the chat reply and memory_saved as they were', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    fs.failCreateFor.add('u-chat-store-down');
    const got = await chatRemember(DENVER, 'u-chat-store-down');
    expect(got).toMatchObject({ success: true, result: '' });
    expect(writer.calls[0].at(-1)).toEqual({ kind: 'failed' });
    expect(docsIn('extracted_facts', 'u-chat-store-down')).toHaveLength(1);
    expect(sent.saved).toHaveLength(1);
    expect(sent.indexed).toBe(1);
  });
});

describe('CHAT_REMEMBER_TO_RECALL: a correction in chat replaces the recall copy', () => {
  const AUSTIN = 'my sister Dana is moving to Austin in June';
  beforeAll(async () => {
    await import('../../../remembered-fact-store-register.js'); // then its Firestore side is faked
  });
  beforeEach(() => useRememberedFactControl(control));
  afterEach(() => useRememberedFactControl(null));

  it('on: "actually Austin" replaces Denver, and the next call recalls only Austin', async () => {
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    await chatRemember(DENVER);
    expect(live()).toEqual([DENVER]);
    expect(await chatCorrect('Denver', AUSTIN)).toMatchObject({ success: true, result: '' });
    expect(live()).toEqual([AUSTIN]);
    const [extracted] = docsIn('extracted_facts');
    expect(fs.docs.get(extracted)).toMatchObject({ fact: AUSTIN, previousVersion: 'Denver' }); // as before
    const note = await nextCall('where is my sister relocating');
    expect(note).toContain('moving to Austin');
    expect(note).not.toContain('moving to Denver');
  });

  it('on: a fact remembered before the flag has no recall copy; the correction is kept for recall', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    await chatRemember(DENVER); // CHAT_REMEMBER_TO_RECALL off: extracted_facts only
    vi.stubEnv('CHAT_REMEMBER_TO_RECALL', 'on');
    await chatCorrect('Denver', AUSTIN);
    expect(live()).toEqual([AUSTIN]);
    expect(fs.docs.get(docsIn('dynamic_facts')[0])).toMatchObject({ category: 'correction' });
  });

  it('off: a correction touches only extracted_facts', async () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    await chatRemember(DENVER);
    await chatCorrect('Denver', AUSTIN);
    expect(writer.calls).toEqual([]);
    expect(docsIn('dynamic_facts')).toEqual([]);
  });
});

describe("CHAT_REMEMBER_TO_RECALL: flags are the caller's own (the UI server never applies cohorts)", () => {
  const MEMBER = 'u-chat-cohort-member';
  const OTHER = 'u-chat-cohort-other';

  it('a cohort member with neither flag in process.env gets the write; someone outside it does not', async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    cohorts.members.set(MEMBER, { CHAT_REMEMBER_TO_RECALL: 'on', REMEMBER_TO_RECALL: 'on' });
    expect(process.env.CHAT_REMEMBER_TO_RECALL).toBeUndefined();
    expect(process.env.REMEMBER_TO_RECALL).toBeUndefined();
    await chatRemember(DENVER, MEMBER);
    expect(live(MEMBER)).toEqual([DENVER]);
    await chatRemember(DENVER, OTHER);
    expect(docsIn('extracted_facts', OTHER)).toHaveLength(1);
    expect(docsIn('dynamic_facts', OTHER)).toEqual([]);
    expect(writer.calls).toHaveLength(1); // the member's only
  });

  it("a cohort's MEMORY_TOOLS_HONEST guards apply: a phone number is not kept", async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    cohorts.members.set(MEMBER, { CHAT_REMEMBER_TO_RECALL: 'on', MEMORY_TOOLS_HONEST: 'on' });
    await chatRemember('my sister Dana is at 555-0142', MEMBER);
    expect(writer.calls[0].at(-1)).toEqual({ kind: 'refused', reason: 'contact' });
    expect(docsIn('dynamic_facts', MEMBER)).toEqual([]);
  });
});
