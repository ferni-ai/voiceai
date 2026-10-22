/**
 * extraction_history keeps the transcript's length, never its text (#2385).
 *
 * A caller's first words can be a door code or a password. The record is
 * pipeline bookkeeping, nothing reads the text back, so the worker's real
 * persist path must write no part of it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepExtractionWorker, type DeepExtractionJob } from '../deep-extraction-worker.js';

interface WrittenDoc {
  path: string;
  data: Record<string, unknown>;
}

const written: WrittenDoc[] = [];

interface FakeRef {
  path: string;
  collection: (name: string) => { doc: (id?: string) => FakeRef };
}

let autoId = 0;
function fakeRef(path: string): FakeRef {
  return {
    path,
    collection: (name: string) => ({
      doc: (id?: string) => fakeRef(`${path}/${name}/${id ?? `auto-${++autoId}`}`),
    }),
  };
}

const fakeDb = {
  collection: (name: string) => ({ doc: (id: string) => fakeRef(`${name}/${id}`) }),
  batch: () => ({
    set: (ref: FakeRef, data: Record<string, unknown>) => {
      written.push({ path: ref.path, data });
    },
    commit: async () => undefined,
  }),
};

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/firestore-utils.js')>();
  return { ...actual, getFirestoreDb: vi.fn(() => fakeDb) };
});

// No vector store: that write is separate and already wrapped in its own catch.
vi.mock('../../firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => null),
}));

const TRANSCRIPT =
  'Okay so the door code is 4821, the wifi password is sunshine42, and my pin is 9087. ' +
  'Anyway my sister Dana is coming over on Friday.';

function job(): DeepExtractionJob {
  return {
    jobId: 'job-privacy-1',
    userId: 'user-privacy-1',
    sessionId: 'session-privacy-1',
    turnNumber: 3,
    transcript: TRANSCRIPT,
    timestamp: new Date('2026-10-21T12:00:00Z'),
    priority: 'normal',
    fastCaptureHints: {
      // The hint-only fallback yields one entity, so the job is worth persisting.
      mentionedEntities: [{ name: 'Dana', type: 'person', context: 'sister', confidence: 0.9 }],
      emotionSignals: [],
      topicHints: ['family'],
      dateSignals: [],
      relationshipSignals: [],
    },
  };
}

async function runThroughPersist(): Promise<WrittenDoc> {
  const worker = new DeepExtractionWorker();
  const internals = worker as unknown as {
    getGeminiModel: () => Promise<unknown>;
    processJob: (j: DeepExtractionJob) => Promise<void>;
  };
  internals.getGeminiModel = async () => null; // hint-only extraction, no LLM
  await internals.processJob(job());
  const history = written.filter((w) => w.path.includes('/extraction_history/'));
  expect(history).toHaveLength(1);
  const [only] = history;
  if (!only) throw new Error('no extraction_history doc was written');
  return only;
}

describe('extraction_history record', () => {
  beforeEach(() => {
    written.length = 0;
  });

  it('is written for the job, under the user, keyed by the job id', async () => {
    const doc = await runThroughPersist();
    expect(doc.path).toBe('bogle_users/user-privacy-1/extraction_history/job-privacy-1');
    expect(doc.data).toMatchObject({ jobId: 'job-privacy-1', turnNumber: 3, entityCount: 1 });
  });

  it('keeps the transcript length and no transcript field', async () => {
    const doc = await runThroughPersist();
    expect(doc.data).not.toHaveProperty('transcript');
    expect(doc.data.transcriptChars).toBe(TRANSCRIPT.length);
  });

  it('holds no part of the spoken text in any field', async () => {
    const serialized = JSON.stringify((await runThroughPersist()).data);
    for (const secret of ['door code is 4821', '4821', 'sunshine42', '9087']) {
      expect(serialized).not.toContain(secret);
    }
    // Every 6-character window of the transcript: no substring survives anywhere.
    const leaked: string[] = [];
    for (let i = 0; i + 6 <= TRANSCRIPT.length; i++) {
      const window = TRANSCRIPT.slice(i, i + 6);
      if (serialized.includes(window)) leaked.push(window);
    }
    expect(leaked).toEqual([]);
  });
});
