/**
 * "What Ferni Knows" (MEMORY_VIEW): what a call taught Ferni shows in the panel, and a
 * forget there sticks: the panel drops it, the agent's next call doesn't recall it, and
 * hearing it again doesn't bring it back.
 *
 * Real writer, real route, real Firestore (the emulator):
 * - the agent's writer: DeepExtractionWorker.persistExtraction, the write a call's
 *   extraction makes after the model has read the transcript (the model is not run);
 * - the panel's own requests: GET /api/memories/known and
 *   POST /api/memories/known/fact/:id { action: 'forget' } (apps/web/src/ui/memory/known.ts);
 * - the agent's recall: loadRecallSnapshot over firestoreRecallStore, as
 *   memory-recall-hook.ts loads it at the start of a call;
 * - the after-call "I'll remember" card, GET /api/memories/from-call, the other reader of
 *   listRemembered (memory-control.ts) the caller sees.
 * The agent is its own module graph (vi.resetModules), as it is its own process in
 * production, so a forget the web process remembers in memory can't stand in for the
 * one it wrote.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from '@google-cloud/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractedFact } from '../../memory/dynamic/deep-extraction-worker.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writer, the
// route and recall all read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
process.env.GCLOUD_PROJECT ??= 'demo-menu-known';
process.env.MEMORY_VIEW = 'on'; // as on john-bogle-ui (deploy/ui-server/env.yaml)

// The door verifies the caller's token; the card's route reads who it named
vi.mock('../auth-middleware.js', async (importActual) => ({
  ...(await importActual<object>()),
  optionalAuthAsync: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-firebase-uid'],
    authMethod: 'firebase',
  })),
}));

let server: Server;
let base: string;
let db: Firestore;
const newUser = () => `menu-known-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleKnownRoutes } = await import('../routes/known.js');
  const { handleCallRememberedRoute } = await import('../routes/call-remembered.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void (async () => {
      if (await handleKnownRoutes(req, res, url.pathname, url)) return;
      if (await handleCallRememberedRoute(req, res, url.pathname, url)) return;
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  db = getFirestoreDb() as Firestore;
});

afterAll(() => server?.close());

interface Item {
  id: string;
  kind: string;
  text: string;
  about?: string;
}

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Every fact the panel shows, whichever section it lands in. */
async function shown(uid: string): Promise<string[]> {
  const { status, body } = await call(uid, 'GET', '/api/memories/known');
  expect(status).toBe(200);
  return Object.values(body)
    .flatMap((items) => (Array.isArray(items) ? (items as Item[]) : []))
    .filter((i) => i.kind === 'fact')
    .map((i) => `${i.about ?? 'you'} | ${i.text}`);
}

/** The after-call card for a call that started at `since`. */
async function card(uid: string, since: number): Promise<string[]> {
  const { status, body } = await call(uid, 'GET', `/api/memories/from-call?since=${since}`);
  expect(status).toBe(200);
  return (body.items as Array<{ subject: string; detail: string }>)
    .map((i) => `${i.subject} | ${i.detail}`)
    .sort();
}

async function factId(uid: string, line: string): Promise<string> {
  const { body } = await call(uid, 'GET', '/api/memories/known');
  const item = Object.values(body)
    .flatMap((items) => (Array.isArray(items) ? (items as Item[]) : []))
    .find((i) => `${i.about ?? 'you'} | ${i.text}` === line);
  if (!item) throw new Error(`the panel does not show "${line}"`);
  return item.id;
}

const fact = (entityName: string, key: string, value: string): ExtractedFact => ({
  entityName,
  key,
  value,
  factType: 'attribute',
  confidence: 0.9,
});

/** A call's extraction, written the way the agent writes it, from its own module graph. */
async function agentLearns(userId: string, facts: ExtractedFact[]): Promise<void> {
  vi.resetModules();
  const { DeepExtractionWorker } = await import('../../memory/dynamic/deep-extraction-worker.js');
  const worker = new DeepExtractionWorker();
  const job = {
    jobId: `job-${Math.random().toString(36).slice(2)}`,
    userId,
    sessionId: 'menu-known-call',
    turnNumber: 4,
    transcript: '(not stored)',
    timestamp: new Date(),
    priority: 'normal' as const,
    fastCaptureHints: {
      mentionedEntities: [],
      emotionSignals: [],
      topicHints: [],
      dateSignals: [],
      relationshipSignals: [],
    },
  };
  const result = { entities: [], facts, relationships: [], categories: [] };
  await worker['persistExtraction'](
    userId,
    { ...result, importanceScore: 0.8, shouldPersist: true },
    job
  );
}

/** What the agent recalls at the start of the next call, from its own module graph. */
async function agentRecalls(userId: string): Promise<string[]> {
  vi.resetModules();
  const { loadRecallSnapshot } = await import('../../memory/recall/session-recall.js');
  const { firestoreRecallStore } =
    await import('../../agents/multi-agent/recall-firestore-store.js');
  const { facts } = await loadRecallSnapshot(firestoreRecallStore, userId);
  return facts.map((f) => `${f.entity} | ${f.key}: ${f.value}`);
}

describe.skipIf(!emulator)('What Ferni Knows: a forget that sticks (Firestore emulator)', () => {
  it('a call fact shows, is forgotten from the panel, and stays out of recall', async () => {
    const uid = newUser();
    const other = newUser();
    const callStart = Date.now() - 1_000;
    await agentLearns(uid, [
      fact('Biscuit', 'breed', 'golden retriever'),
      fact('Jo', 'age', '7'), // too few words for a forgotten topic: only its mark keeps it out
      fact('user', 'hometown', 'Asheville'),
    ]);
    await agentLearns(other, [fact('Pepper', 'breed', 'border collie')]);

    expect((await shown(uid)).sort()).toEqual([
      'Biscuit | breed: golden retriever',
      'Jo | age: 7',
      'you | hometown: Asheville',
    ]);
    // Another caller's facts never show, and theirs never shows ours
    expect(await shown(other)).toEqual(['Pepper | breed: border collie']);
    expect(await card(uid, callStart)).toEqual([
      'Biscuit | breed: golden retriever',
      'Jo | age: 7',
      'you | hometown: Asheville',
    ]);

    for (const line of ['Biscuit | breed: golden retriever', 'Jo | age: 7']) {
      const id = await factId(uid, line);
      expect(
        await call(uid, 'POST', `/api/memories/known/fact/${id}`, { action: 'forget' })
      ).toEqual({ status: 200, body: { success: true, kind: 'done' } });
      // Kept, not deleted (a misread tap is recoverable), but marked: recall skips the mark
      const doc = await db.doc(`bogle_users/${uid}/dynamic_facts/${id}`).get();
      expect(typeof doc.get('forgottenAt')).toBe('string');
    }

    expect(await shown(uid)).toEqual(['you | hometown: Asheville']);
    expect(await agentRecalls(uid)).toEqual(['user | hometown: Asheville']);
    expect(await card(uid, callStart)).toEqual(['you | hometown: Asheville']);

    // The next call hears it again, in the same words and in others: it stays forgotten
    await agentLearns(uid, [
      fact('Biscuit', 'breed', 'golden retriever'),
      fact('Biscuit', 'breed', 'a golden retriever pup'),
      fact('Jo', 'age', '7'),
    ]);
    expect(await shown(uid)).toEqual(['you | hometown: Asheville']);
    expect(await agentRecalls(uid)).toEqual(['user | hometown: Asheville']);
    expect(await card(uid, callStart)).toEqual(['you | hometown: Asheville']);

    // The other caller's facts are untouched, in the panel and in recall
    expect(await shown(other)).toEqual(['Pepper | breed: border collie']);
    expect(await agentRecalls(other)).toEqual(['Pepper | breed: border collie']);
  });

  it("one caller can't forget another's fact", async () => {
    const uid = newUser();
    const other = newUser();
    await agentLearns(other, [fact('Pepper', 'breed', 'border collie')]);
    const id = await factId(other, 'Pepper | breed: border collie');

    const res = await call(uid, 'POST', `/api/memories/known/fact/${id}`, { action: 'forget' });

    expect(res.status).toBe(404);
    expect(await shown(other)).toEqual(['Pepper | breed: border collie']);
    expect(await agentRecalls(other)).toEqual(['Pepper | breed: border collie']);
  });
});
