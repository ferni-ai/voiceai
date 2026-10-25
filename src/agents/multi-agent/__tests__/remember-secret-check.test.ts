/**
 * REMEMBER_TO_RECALL (#2514 round 3), end to end through the live
 * rememberAboutUser tool and the agent process's own wiring
 * (remembered-fact-store-register.ts): a remembered fact the model reads as a
 * secret never reaches dynamic_facts or the embedder; one it clears does; a
 * failed read keeps nothing. Only Firestore, the memories write, the Gemini
 * client and the embedding model are fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
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
    const q: Record<string, unknown> = {
      orderBy: () => q,
      where: () => q,
      limit: () => q,
      get: async () => ({ empty: true, docs: [] }),
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

// The Gemini client the crisis classifier's call uses: answers per fact, or fails.
const gemini = vi.hoisted(() => ({
  secret: [] as string[],
  fail: null as null | 'error' | 'garbage',
  requests: [] as Array<{ model: string; text: string; system: string }>,
}));
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({
    models: {
      generateContent: async (req: {
        model: string;
        contents: Array<{ parts: Array<{ text: string }> }>;
        config: { systemInstruction: string };
      }) => {
        const { text } = JSON.parse(req.contents[0].parts[0].text) as { text: string };
        gemini.requests.push({ model: req.model, text, system: req.config.systemInstruction });
        if (gemini.fail === 'error') throw new Error('RESOURCE_EXHAUSTED');
        if (gemini.fail === 'garbage') return { text: 'Sure!' };
        return { text: JSON.stringify({ secret: gemini.secret.includes(text) }) };
      },
    },
  }),
}));
const embedded = vi.hoisted(() => [] as string[]);
vi.mock('../../../memory/recall/semantic-recall.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../memory/recall/semantic-recall.js')>()),
  defaultEmbedder: async (texts: string[]) => {
    embedded.push(...texts);
    return texts.map(() => new Array<number>(768).fill(0.1)); // FACT_VECTOR_DIMENSION
  },
  defaultEmbeddingModel: async () => 'fake-embedder',
}));

import '../../remembered-fact-store-register.js';
import { CLASSIFICATION_MODEL } from '../../../config/gemini-config.js';
import { SECRET_CHECK_PROMPT } from '../../../memory/secret-check.js';
import { rememberAboutUserUnifiedDef } from '../../../tools/domains/memory/tools-unified.js';

const UID = 'u-secret-e2e';
const FACTS = `bogle_users/${UID}/dynamic_facts/`;
// No credential word in either: the word rules keep both, so the model decides
const GARAGE = 'the garage opens with 2 9 0 4';
const POTTERY = 'I started a pottery class on Tuesdays';

async function remember(fact: string) {
  const tool = rememberAboutUserUnifiedDef.create({ agentId: 'ferni' } as never) as unknown as {
    execute: (args: Record<string, string>, opts: unknown) => Promise<string>;
  };
  return tool.execute(
    { fact, category: 'personal', importance: 'high' },
    { ctx: { userData: { userId: UID } } }
  );
}
const factDocs = () => [...fs.docs.entries()].filter(([p]) => p.startsWith(FACTS)).map(([, d]) => d); // prettier-ignore
const settle = async () =>
  new Promise((r) => {
    setTimeout(r, 20);
  });

afterEach(() => {
  vi.unstubAllEnvs();
  fs.docs.clear();
  embedded.length = 0;
  gemini.requests.length = 0;
  gemini.secret = [];
  gemini.fail = null;
});

describe('rememberAboutUser with REMEMBER_TO_RECALL and RECALL_VECTOR_INDEX on', () => {
  const on = () => {
    vi.stubEnv('REMEMBER_TO_RECALL', 'on');
    vi.stubEnv('RECALL_VECTOR_INDEX', 'on');
  };

  it('a fact the model reads as a secret: no dynamic_facts doc, nothing embedded', async () => {
    on();
    gemini.secret = [GARAGE];
    await remember(GARAGE);
    await vi.waitFor(() => expect(gemini.requests).toHaveLength(1));
    await settle();
    expect(gemini.requests[0]).toEqual({ model: CLASSIFICATION_MODEL, text: GARAGE, system: SECRET_CHECK_PROMPT }); // prettier-ignore
    expect(factDocs()).toEqual([]);
    expect(embedded.join('\n')).not.toContain('2 9 0 4');
  });

  it('a fact the model clears: stored with its vector, the embedder given its text', async () => {
    on();
    gemini.secret = [GARAGE];
    await remember(POTTERY);
    await vi.waitFor(() => expect(factDocs()).toHaveLength(1));
    expect(factDocs()[0]).toMatchObject({ value: POTTERY, embeddingModel: 'fake-embedder' });
    expect(embedded.join('\n')).toContain(POTTERY);
  });

  it.each(['error', 'garbage'] as const)(
    'a model %s keeps nothing (fails closed)',
    async (fail) => {
      on();
      gemini.fail = fail;
      await remember(POTTERY);
      await vi.waitFor(() => expect(gemini.requests).toHaveLength(1));
      await settle();
      expect(factDocs()).toEqual([]);
      expect(embedded).toEqual([]);
    }
  );

  it('flag off: the model is never asked, nothing stored or embedded', async () => {
    vi.stubEnv('RECALL_VECTOR_INDEX', 'on');
    await remember(GARAGE);
    await settle();
    expect(gemini.requests).toEqual([]);
    expect(factDocs()).toEqual([]);
    expect(embedded).toEqual([]);
  });
});
