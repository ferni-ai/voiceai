/**
 * MINOR_CARE in text chat: a caller held from a voice call can't save facts by chat.
 *
 * The gap (#2906 verifier): POST /api/chat/message runs tools with no sessionId, and
 * rememberAboutUser was held only by memoryHeld(ctx.sessionId), so a caller held from a voice
 * call (a hold bound to their userId for 6 h) could save a fact and its index entry by text.
 * Chat also runs in the API server, which sees a call's hold only through the shared record.
 *
 * Drives the real route, dispatcher and memory executor with the real hold. Mocked: the auth
 * verifier, the Gemini SDK (an external LLM call), Firestore, the vector index and embeddings.
 * Synthetic ids and words only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const store = vi.hoisted(() => ({ facts: [] as unknown[], indexed: [] as unknown[] }));
const llm = vi.hoisted(() => ({ prompts: [] as string[] }));

vi.mock('../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          add: async (doc: unknown) => (store.facts.push(doc), { id: `fact${store.facts.length}` }),
          doc: () => ({ set: async (doc: unknown) => void store.facts.push(doc) }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async (doc: unknown) => store.indexed.push(doc) }),
}));
vi.mock('../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2, 0.3] }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async (req: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
          llm.prompts.push(req.contents[0]?.parts[0]?.text ?? '');
          const args = { fact: 'favourite band is The Synthetics', category: 'preference' };
          return {
            response: {
              text: () => 'Love that band!',
              functionCalls: () => [{ name: 'rememberAboutUser', args }],
            },
          };
        },
      };
    }
  },
}));
// "Bearer <uid>" is a verified token for <uid>; admin-uid is an admin.
vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage) => {
    const userId = String(req.headers.authorization).slice(7);
    return { userId, isAdmin: userId === 'admin-uid' };
  }),
}));

process.env.GOOGLE_API_KEY = 'test-key';
const { handleChatRoutes } = await import('../chat-routes.js');
const { heldAfter, MINOR_CARE_NOTE, resetMinorCare } = await import('../../utils/minor-care.js');
const { setHoldStore } = await import('../../services/outreach/minor-care-shared-hold.js');

interface ChatBody {
  success: boolean;
  response: string;
  toolCalls?: Array<{ fn: string; result: unknown; success: boolean }>;
}

async function post(path: string, caller: string, payload: object): Promise<ChatBody> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = { authorization: `Bearer ${caller}` };
  stream.end(JSON.stringify(payload));
  let body: unknown;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn((chunk?: string) => (body = chunk ? JSON.parse(chunk) : undefined)),
  } as unknown as ServerResponse;
  await handleChatRoutes(req, res, path);
  return body as ChatBody;
}
const chat = (caller: string, message: string) => post('/api/chat/message', caller, { message });

const env = { ...process.env };
beforeEach(() => {
  store.facts.length = 0;
  store.indexed.length = 0;
  llm.prompts.length = 0;
  resetMinorCare();
  setHoldStore({ heldUntil: async () => undefined, write: async () => undefined });
  process.env.MINOR_CARE = 'on';
});
afterEach(() => {
  process.env = { ...env };
  setHoldStore();
});

describe('text chat and a MINOR_CARE hold from a voice call', () => {
  it('saves no fact and no index entry for a caller held on a voice call, and still replies', async () => {
    // The voice call (this process): the caller said they're 15; the hold is bound to their user.
    expect(heldAfter('voice-sess-1', "I'm 15 years old", { userId: 'teen-uid' })).toBe(true);

    const body = await chat('teen-uid', 'remember my favourite band is The Synthetics');

    expect(store.facts).toEqual([]);
    expect(store.indexed).toEqual([]);
    expect(body.success).toBe(true);
    expect(body.response).toBe('Love that band!');
    // The client is told nothing it isn't told for a saved fact; the model gets the voice note.
    expect(body.toolCalls?.[0]).toMatchObject({
      fn: 'rememberAboutUser',
      result: '',
      success: true,
    });
    expect(llm.prompts[0]).toContain(MINOR_CARE_NOTE); // "never say you'll remember it"
  });

  it('saves nothing when the hold was made in the voice process (the shared record)', async () => {
    process.env.MINOR_CARE_SHARED_HOLD = 'on';
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => undefined });

    const body = await chat('teen-uid', 'remember my favourite band is The Synthetics');

    expect(store.facts).toEqual([]);
    expect(store.indexed).toEqual([]);
    expect(body.toolCalls?.[0]).toMatchObject({ result: '', success: true });
    expect(llm.prompts[0]).toContain(MINOR_CARE_NOTE);
  });

  it('saves nothing through the direct tool route for a caller held in the voice process', async () => {
    process.env.MINOR_CARE_SHARED_HOLD = 'on';
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => undefined });

    const args = { fact: 'favourite band is The Synthetics' };
    const body = await post('/api/chat/tool', 'teen-uid', { fn: 'rememberAboutUser', args });

    expect(store.facts).toEqual([]);
    expect(store.indexed).toEqual([]);
    expect(body.success).toBe(true);
  });

  it('runs no other writer for a held caller: journal and habits (an admin acting for them)', async () => {
    process.env.MINOR_CARE_SHARED_HOLD = 'on';
    setHoldStore({
      heldUntil: async (id) => (id === 'teen-uid' ? Date.now() + 60_000 : 0),
      write: async () => undefined,
    });
    const run = (userId: string, fn: string, args: object) =>
      post('/api/chat/tool', 'admin-uid', { fn, args, userId, grant: 'admin' });
    const journal = { entry: 'had a rough day at practice', mood: 'tired' };
    const habit = { name: 'stretch every morning' };

    await run('teen-uid', 'addJournal', journal);
    await run('teen-uid', 'createHabit', habit);
    await run('teen-uid', 'journal_add', journal); // an alias: not on the read-only list either
    expect(store.facts).toEqual([]);

    await run('adult-uid', 'addJournal', journal); // the same calls store for someone not held
    await run('adult-uid', 'createHabit', habit);
    expect(store.facts).toHaveLength(2);
  });

  it("still saves a caller who isn't held, with no MINOR_CARE note", async () => {
    heldAfter('voice-sess-1', "I'm 15 years old", { userId: 'teen-uid' }); // someone else's hold

    const body = await chat('adult-uid', 'remember my favourite band is The Synthetics');

    expect(store.facts).toHaveLength(1);
    expect(store.facts[0]).toMatchObject({ fact: 'favourite band is The Synthetics' });
    expect(store.indexed).toHaveLength(1);
    expect(body.toolCalls?.[0]?.result).toBe('');
    expect(llm.prompts[0]).not.toContain(MINOR_CARE_NOTE);
  });
});
