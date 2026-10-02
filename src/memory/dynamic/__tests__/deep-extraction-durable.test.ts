/**
 * Deep extraction worker with the durable queue and fact upserts, against an
 * in-memory Firestore double and a scripted text generator.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const l = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createLogger: () => l, getLogger: () => l };
});
vi.mock('../async-events-config.js', () => ({
  safeOnEvent: vi.fn(() => true),
  safeEmitEvent: vi.fn(() => true),
}));
vi.mock('../../firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => null),
}));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => null) }));

import * as asyncEvents from '../async-events-config.js';
import { DeepExtractionWorker, type DeepExtractionJob } from '../deep-extraction-worker.js';
import { factIdForExtracted } from '../fact-identity.js';
import { FirestoreExtractionQueue } from '../extraction-queue.js';
import { FakeFirestore } from './helpers/fake-firestore.js';

const UID = 'u1';
const FACTS = `bogle_users/${UID}/dynamic_facts`;
const JOBS = `bogle_users/${UID}/extraction_jobs`;

function makeJob(id: string, overrides: Partial<DeepExtractionJob> = {}): DeepExtractionJob {
  return {
    jobId: id,
    userId: UID,
    sessionId: 'sess-1',
    conversationId: 'conv-1',
    turnNumber: 2,
    transcript: "Yes, she's seven now.",
    timestamp: new Date('2026-10-01T10:00:10Z'),
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [{ name: 'daughter', type: 'person', context: '', confidence: 0.8 }],
      emotionSignals: [],
      topicHints: ['family'],
      dateSignals: [],
      relationshipSignals: [],
    },
    ...overrides,
  };
}

/** A generator that answers each extraction step and records the prompts. */
function scriptedGenerator() {
  const prompts: string[] = [];
  const generate = vi.fn(async (prompt: string) => {
    prompts.push(prompt);
    if (prompt.includes('identifying entities'))
      return '[{"name":"Lily","type":"person","attributes":{},"confidence":0.9}]';
    if (prompt.includes('extracting factual information'))
      return '[{"entityName":"Lily","factType":"attribute","key":"age","value":"7","confidence":0.9}]';
    return 'no refinement';
  });
  return { generate, prompts };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

let db: FakeFirestore;
let handler: (job: unknown) => void;
let worker: DeepExtractionWorker | undefined;

beforeEach(() => {
  db = new FakeFirestore();
  (asyncEvents.safeOnEvent as Mock).mockImplementation((_e: string, h: (job: unknown) => void) => {
    handler = h;
    return true;
  });
});

afterEach(() => {
  worker?.stop();
  worker = undefined;
});

describe('DeepExtractionWorker (durable)', () => {
  it('queues the job in Firestore, upserts facts with provenance, and deletes the job', async () => {
    const { generate } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    handler(makeJob('j1'));
    await flush();

    expect(worker.getHealthStatus().queue.durable).toBe(true);
    expect(worker.getStats().completedJobs).toBe(1);
    expect(db.list(JOBS)).toHaveLength(0);
    const id = factIdForExtracted({
      entityName: 'Lily',
      key: 'age',
      value: '7',
      factType: 'attribute',
    });
    expect(db.get(`${FACTS}/${id}`)).toMatchObject({
      text: 'Lily: age is 7',
      sourceConversationIds: ['conv-1'],
      userEdited: false,
    });
    expect(db.get(`bogle_users/${UID}/extraction_history/j1`)).toMatchObject({
      conversationId: 'conv-1',
    });
  });

  it('learning the same fact in two conversations leaves one fact', async () => {
    const { generate } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    handler(makeJob('j1'));
    await flush();
    handler(makeJob('j2', { conversationId: 'conv-2' }));
    await flush();
    const facts = db.list(FACTS);
    expect(facts).toHaveLength(1);
    expect(facts[0].data.sourceConversationIds).toEqual(['conv-1', 'conv-2']);
  });

  it('gives the extractor the preceding assistant turn as context', async () => {
    const turns = `bogle_users/${UID}/conversations/conv-1/turns`;
    db.docs.set(`${turns}/t1`, {
      role: 'assistant',
      text: 'How old is your daughter Lily?',
      timestamp: new Date('2026-10-01T10:00:05Z'),
      turnNumber: 1,
    });
    db.docs.set(`${turns}/t2`, {
      role: 'user',
      content: "Yes, she's seven now.",
      timestamp: new Date('2026-10-01T10:00:10Z'),
      turnNumber: 2,
    });
    const { generate, prompts } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    handler(makeJob('j1'));
    await flush();
    expect(prompts[0]).toContain('ASSISTANT: "How old is your daughter Lily?"');
    expect(prompts[0]).toContain('USER: "Yes, she\'s seven now."');
  });

  it('uses context passed with the job, and none when the conversation has no assistant turns', async () => {
    const { generate, prompts } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    handler(makeJob('j1', { context: { previousAssistantTurn: 'Tell me about your kids.' } }));
    await flush();
    expect(prompts[0]).toContain('ASSISTANT: "Tell me about your kids."');

    prompts.length = 0;
    handler(makeJob('j2', { conversationId: 'conv-empty' }));
    await flush();
    expect(prompts[0]).not.toContain('ASSISTANT:');
  });

  it('drains jobs left from before a restart when it starts', async () => {
    const earlier = new FirestoreExtractionQueue<DeepExtractionJob>(db);
    await earlier.enqueue(makeJob('left-over-1'));
    await earlier.enqueue(makeJob('left-over-2', { conversationId: 'conv-2' }));
    expect(db.list(JOBS)).toHaveLength(2);

    const { generate } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    await flush();
    expect(worker.getStats().completedJobs).toBe(2);
    expect(db.list(JOBS)).toHaveLength(0);
  });

  it('retries a job whose writes fail and keeps it durable', async () => {
    const { generate } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    handler(makeJob('j1'));
    // Memory writes fail (queue writes still work).
    const write = db.write.bind(db);
    vi.spyOn(db, 'write').mockImplementation((path, data, merge, mustExist) => {
      if (path.includes('/dynamic_')) throw new Error('UNAVAILABLE');
      write(path, data, merge, mustExist);
    });
    await flush();
    const health = worker.getHealthStatus();
    expect(health.stats.failedJobs).toBeGreaterThanOrEqual(1);
    expect(health.queue.retriedJobs).toBeGreaterThanOrEqual(1);
    const pending = db.list(JOBS);
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toMatchObject({ status: 'pending' });
    expect(String(pending[0].data.lastError)).toContain('UNAVAILABLE');
  });

  it('keeps a job in memory when Firestore refuses the enqueue', async () => {
    const { generate } = scriptedGenerator();
    worker = new DeepExtractionWorker({ db, generate, pollIntervalMs: 0 });
    worker.start();
    db.failWrites = true;
    handler(makeJob('j1'));
    await flush();
    expect(worker.getHealthStatus().queue.fallbackJobs).toBe(1);
    // Processed from memory; persistence failed too, so it is retried later rather than lost.
    expect(worker.getStats().totalJobs).toBe(1);
  });
});
