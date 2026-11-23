/**
 * CHAT_REMEMBER_TO_RECALL (#2518): what a caller asks Ferni to remember in text
 * chat is recalled by meaning on a later call.
 *
 * The chat API's entry (executeTool, as api/chat-routes.ts calls it, with
 * chatToolContext's shape: a userId, no session) runs the memory executor's
 * rememberAboutUser; the live recall hook reads the same database on the next
 * call. Only the database, the embedding models, the vector index and the
 * memory_saved sender are fakes. This file does not load the fact-store
 * registration: the chat path must load it itself, as the UI server does not.
 * Fictional user and facts only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

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
        const found = paths.map((p) => ({ id: p.split('/').pop(), data: () => docs.get(p) }));
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
