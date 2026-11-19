/**
 * Every twin route acts only on the signed-in caller's own twin (#3871). Two synthetic
 * users, Riley and Jordan, sign in by token. Jordan asks each route for Riley's twin, its
 * memories, its journal and its Chronicle, and is refused, with no model asked and nothing
 * transcribed. Afterwards
 * the database holds exactly what it held before. Riley's own requests through the same
 * routes succeed, so a refusal can't come from a broken setup.
 *
 * The real routers, auth middleware, agent store, journal store and journal service run on
 * one in-memory database. Token checks, rate limits, the model and the crisis read (covered
 * in journal-twin-crisis.test.ts and chat-routes-crisis.test.ts) are faked.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  callLLM: vi.fn<(prompt: string, opts?: unknown) => Promise<string | null>>(),
  transcribe: vi.fn(async () => 'Sat on the dock at sunset.'),
}));

/** A path-keyed Firestore with just what the agent and journal stores use. */
const db = (() => {
  const snap = (path: string) => {
    const data = h.docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      ref: ref(path),
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
    };
  };
  function ref(path: string) {
    return {
      id: path.split('/').pop() ?? '',
      path,
      collection: (name: string) => collection(`${path}/${name}`),
      get: async () => snap(path),
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        const base = opts?.merge ? (h.docs.get(path) ?? {}) : {};
        h.docs.set(path, structuredClone({ ...base, ...data }));
      },
      update: async (data: Doc) => {
        if (!h.docs.has(path)) throw new Error(`no document at ${path}`);
        h.docs.set(path, structuredClone({ ...h.docs.get(path), ...data }));
      },
      delete: async () => {
        h.docs.delete(path);
      },
    };
  }
  type Filter = [string, string, unknown];
  function query(path: string, filters: Filter[], limit?: number) {
    return {
      where: (field: string, op: string, value: unknown) =>
        query(path, [...filters, [field, op, value]], limit),
      orderBy: () => query(path, filters, limit),
      limit: (n: number) => query(path, filters, n),
      get: async () => {
        const docs = [...h.docs.keys()]
          .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
          .filter((p) => filters.every(([f, op, v]) => op === '==' && h.docs.get(p)?.[f] === v))
          .slice(0, limit)
          .map(snap);
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: docs.forEach.bind(docs),
        };
      },
    };
  }
  function collection(path: string) {
    return { doc: (id: string) => ref(`${path}/${id}`), ...query(path, []) };
  }
  type Ref = ReturnType<typeof ref>;
  /** One request at a time here, so a transaction reads and writes straight through. */
  const runTransaction = async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: (r: Ref) => r.get(),
      update: (r: Ref, data: Doc) => r.update(data),
      delete: (r: Ref) => r.delete(),
    });
  return { collection, doc: ref, runTransaction };
})();

vi.mock('../../utils/firebase-admin-app.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAdminFirestore: () => db,
}));
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../services/superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
// "tok-<name>" verifies as uid-<name>
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));
vi.mock('../../services/llm-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callLLM: h.callLLM,
}));
// The voice journal's speech-to-text and recording upload.
vi.mock('../../services/custom-agent/memory-capture-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  transcribeAudioBuffer: h.transcribe,
  extractMetadata: vi.fn(async () => ({ themes: [], emotions: [], keyPhrases: [] })),
}));
vi.mock('../../services/custom-agent/gcs-storage-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  uploadVoiceJournalEntry: vi.fn(async () => null),
  deleteVoiceJournalAudio: vi.fn(async () => undefined),
}));
vi.mock('../../agents/personas/crisis-gate-text.js', () => ({
  readTypedMessageForCrisis: vi.fn(async (message: string) => ({ action: 'pass', message })),
}));

const { handleCustomAgentRoutes } = await import('../custom-agent/index.js');
const { handleJournalRoutes } = await import('../journal-routes.js');
const { addMemoryToAgent, createCustomAgent, updateAgentVoice } =
  await import('../../services/custom-agent/custom-agent-persistence-service.js');
const { DEFAULT_CUSTOM_AGENT_VOICE_ID: STOCK_VOICE } =
  await import('../../services/custom-agent/custom-agent-voice-catalog.js');
const { addJournalEntry } = await import('../../services/stores/journal-store.js');

/** A recording, as the voice journal posts it. */
const AUDIO = Buffer.from('a short recording').toString('base64');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.startsWith('/api/custom-agents')
      ? handleCustomAgentRoutes(req, res, url.pathname, url)
      : handleJournalRoutes(req, res, url.pathname);
    void route.then((handled) => {
      if (!handled && !res.headersSent) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

async function call(who: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer tok-${who}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Doc };
}

/**
 * Every document but the auth middleware's sign-in audit records (security_events, ids
 * hashed), which each signed-in request adds whoever it is from.
 */
const userData = () =>
  [...h.docs]
    .filter(([path]) => !path.startsWith('security_events/'))
    .sort(([a], [b]) => a.localeCompare(b));

let twinId = '';
let memoryId = '';

beforeEach(async () => {
  h.docs.clear();
  h.callLLM.mockReset().mockResolvedValue('We kept walking by the lake, remember?');
  h.transcribe.mockClear();
  const twin = await createCustomAgent('uid-riley', {
    name: 'Riley Test',
    description: 'Riley Test at twenty',
    type: 'twin',
  });
  twinId = twin.id;
  const withStory = await addMemoryToAgent('uid-riley', twinId, 'stories', {
    content: 'The summer we walked by the lake.',
  });
  memoryId = withStory?.memories.stories[0]?.id ?? '';
  expect(memoryId, "Riley's story was saved").not.toBe('');
  await addMemoryToAgent('uid-riley', twinId, 'journalEntries', {
    content: 'Walked by the lake again this morning.',
  });
  // A ready stock voice, so the twin could be activated: a refused activation is the owner
  // check, not the readiness check.
  await updateAgentVoice('uid-riley', twinId, {
    voiceId: STOCK_VOICE,
    status: 'ready',
    type: 'selected',
  });
});

/** Each twin route, as [label, method, path, body, what Jordan gets]. */
const routes = (): Array<[string, string, string, unknown, number]> => {
  const agent = `/api/custom-agents/${twinId}`;
  return [
    ['the twin', 'GET', agent, undefined, 404],
    ['its memories', 'GET', `${agent}/memories`, undefined, 404],
    ['its journal entries', 'GET', `${agent}/journal/entries`, undefined, 404],
    ['a change to the twin', 'PUT', agent, { name: 'Changed' }, 404],
    ['a chat with the twin', 'POST', `${agent}/chat`, { message: 'hi' }, 404],
    ['a memory added', 'POST', `${agent}/memories`, { type: 'story', content: 'x' }, 404],
    ['a memory deleted', 'DELETE', `${agent}/memories/${memoryId}`, undefined, 404],
    ['the twin deleted', 'DELETE', agent, undefined, 404],
    ['its voice status', 'GET', `${agent}/voice/status`, undefined, 404],
    ['a voice picked', 'PUT', `${agent}/voice/select-premade`, { voiceId: STOCK_VOICE }, 404],
    ['a status change', 'PUT', `${agent}/status`, { status: 'paused' }, 404],
    ['an activation', 'POST', `${agent}/activate`, undefined, 404],
    ['its system prompt', 'POST', `${agent}/generate-prompt`, undefined, 404],
    ['a voice journal entry', 'POST', `${agent}/journal/entry`, { audio: AUDIO }, 404],
    [
      'a twin reply',
      'POST',
      '/api/journal/twin-response',
      { userMessage: 'Do you remember the lake?', agentId: twinId },
      400,
    ],
    ['the Chronicle', 'GET', '/api/journal/chronicle?userId=uid-riley', undefined, 403],
  ];
};
// The ids exist only once beforeEach runs, so the rows are named by label.
const LABELS = routes().map(([label]) => label);

describe("another user can't reach Riley's twin", () => {
  it.each(LABELS)('%s is refused', async (label) => {
    const route = routes().find(([l]) => l === label);
    if (!route) throw new Error(`no route named ${label}`);
    const [, method, path, body, refused] = route;
    const before = structuredClone(userData());

    const { status } = await call('jordan', method, path, body);

    expect(status, label).toBe(refused);
    expect(h.callLLM, label).not.toHaveBeenCalled();
    expect(h.transcribe, label).not.toHaveBeenCalled();
    expect(userData(), label).toEqual(before);
    expect(before.length, 'Riley has a twin with memories to protect').toBeGreaterThan(0);
  });

  it("Jordan's own list doesn't show Riley's twin", async () => {
    const { status, body } = await call('jordan', 'GET', '/api/custom-agents');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe('Riley reaches the same routes', () => {
  it('reads the twin, its memories and its journal entries', async () => {
    const twin = await call('riley', 'GET', `/api/custom-agents/${twinId}`);
    expect(twin.status).toBe(200);
    expect(twin.body.name).toBe('Riley Test');

    const memories = await call('riley', 'GET', `/api/custom-agents/${twinId}/memories`);
    expect(memories.status).toBe(200);
    expect(JSON.stringify(memories.body)).toContain('The summer we walked by the lake.');

    const journal = await call('riley', 'GET', `/api/custom-agents/${twinId}/journal/entries`);
    expect(journal.status).toBe(200);
    expect(JSON.stringify(journal.body)).toContain('Walked by the lake again this morning.');

    const list = await call('riley', 'GET', '/api/custom-agents');
    expect((list.body as unknown as Doc[]).map((a) => a.id)).toEqual([twinId]);
  });

  it('chats with the twin and gets a twin reply, each from one model call', async () => {
    const chat = await call('riley', 'POST', `/api/custom-agents/${twinId}/chat`, {
      message: 'hi',
    });
    expect(chat.status).toBe(200);

    const reply = await call('riley', 'POST', '/api/journal/twin-response', {
      userMessage: 'Do you remember the lake?',
      agentId: twinId,
    });
    expect(reply.status).toBe(200);
    expect(h.callLLM).toHaveBeenCalledTimes(2);
  });

  it('reads the Chronicle, then changes and deletes', async () => {
    expect((await call('riley', 'GET', '/api/journal/chronicle?userId=uid-riley')).status).toBe(
      200
    );
    const put = await call('riley', 'PUT', `/api/custom-agents/${twinId}`, { name: 'Changed' });
    expect(put.status).toBe(200);
    expect(
      (await call('riley', 'DELETE', `/api/custom-agents/${twinId}/memories/${memoryId}`)).status
    ).toBe(204);
    expect((await call('riley', 'DELETE', `/api/custom-agents/${twinId}`)).status).toBeLessThan(
      300
    );
    expect([...h.docs.keys()].filter((p) => p.includes(twinId))).toEqual([]);
  });

  it('reads the voice status, picks a voice, activates and pauses the twin', async () => {
    const agent = `/api/custom-agents/${twinId}`;
    const voice = await call('riley', 'GET', `${agent}/voice/status`);
    expect(voice.status).toBe(200);
    expect(voice.body).toMatchObject({ voiceId: STOCK_VOICE, isReady: true });
    expect(
      (await call('riley', 'PUT', `${agent}/voice/select-premade`, { voiceId: STOCK_VOICE })).status
    ).toBe(200);
    expect((await call('riley', 'POST', `${agent}/activate`)).body.status).toBe('active');
    const paused = await call('riley', 'PUT', `${agent}/status`, { status: 'paused' });
    expect(paused.status).toBe(200);
    expect((await call('riley', 'GET', agent)).body.status).toBe('paused');
  });

  it('generates the system prompt and records a voice journal entry', async () => {
    const agent = `/api/custom-agents/${twinId}`;
    const prompt = await call('riley', 'POST', `${agent}/generate-prompt`);
    expect(prompt.status).toBe(200);
    expect(String(prompt.body.systemPrompt)).toContain('Riley Test');

    expect((await call('riley', 'POST', `${agent}/journal/entry`, { audio: AUDIO })).status).toBe(
      201
    );
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    const journal = await call('riley', 'GET', `${agent}/journal/entries`);
    expect(JSON.stringify(journal.body)).toContain('Sat on the dock at sunset.');
  });
});

describe("Riley's Chronicle entry (the one journal store, JOURNAL_ONE_STORE on)", () => {
  let entryPath = '';
  let entryDoc = '';
  beforeEach(async () => {
    vi.stubEnv('JOURNAL_ONE_STORE', 'on');
    const entry = await addJournalEntry('uid-riley', { content: 'Rained all afternoon.' });
    entryPath = `/api/journal/chronicle/entry/${entry.id}`;
    entryDoc = `bogle_users/uid-riley/journal/${entry.id}`;
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['an edit', 'PUT', { content: 'Changed' }],
    ['a delete', 'DELETE', undefined],
  ])('%s by another user is refused', async (label, method, body) => {
    const before = structuredClone(userData());

    const { status } = await call('jordan', method, entryPath, body);

    expect(status, label).toBe(404);
    expect(userData(), label).toEqual(before);
    expect(h.docs.get(entryDoc)?.content, label).toBe('Rained all afternoon.');
  });

  it('Riley edits it, then deletes it', async () => {
    const edit = await call('riley', 'PUT', entryPath, { content: 'Rained, then cleared.' });
    expect(edit.status).toBe(200);
    expect(h.docs.get(entryDoc)?.content).toBe('Rained, then cleared.');
    expect((await call('riley', 'DELETE', entryPath)).status).toBe(200);
    expect(h.docs.has(entryDoc)).toBe(false);
  });
});
