/**
 * A crisis read holds the call's memory (utils/crisis-memory-hold.ts), on by default. The real turn
 * pipeline reads the turn (turn-crisis.ts startTurnCrisis, with every model call stubbed), then
 * the real fastCapture runs as process-turn.ts runs it, before the verdict is awaited. Each crisis
 * read (pattern or classifier, either side of a soft check-in, a timeout, a failed read) leaves no
 * deep extraction queued, and a job queued earlier in the call makes no model call and writes
 * nothing; an ordinary turn still queues, calls the model and writes. Storage and the event bus are
 * faked; nothing reaches a network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emitted = vi.hoisted(() => [] as string[]);
vi.mock('../async-events-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  safeEmitEvent: (event: string) => {
    emitted.push(event);
    return true;
  },
}));
vi.mock('../../firestore-vector-store/index.js', () => ({ getFirestoreVectorStore: () => null }));

const written = vi.hoisted(() => [] as string[]);
/** A fake Firestore that records every write path (src/tests/setup.ts mocks getFirestoreDb). */
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        id: path.split('/').at(-1),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async () => void written.push(path),
        update: async () => void written.push(path),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }) => void written.push(r.path);
  return Object.assign(ref(''), {
    batch: () => ({ set: tx, update: tx, delete: tx, commit: async () => undefined }),
  });
});

import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { memoryHeld } from '../../../utils/minor-care.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { fastCapture } from '../fast-capture.js';
import { clearAllSTMBuffers, getRecentTurns, recordTurn } from '../stm-buffer.js';
import { DeepExtractionWorker, type DeepExtractionJob } from '../deep-extraction-worker.js';

const LIVE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '50',
};
/** Invented lines. The ordinary one has a person in it, so its capture would queue. */
const ORDINARY = 'My friend Sam Rivera and I fixed up the garden shed today, it looks great.';
const PATTERN = 'My friend Sam Rivera stopped calling and I want to kill myself tonight.';
const GOODBYE = 'Okay, goodnight, talk to you later.';
const reply =
  (risk: string): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"self"}`;
const never: CrisisGenerateFn = () => new Promise<string>(() => undefined);
const fails: CrisisGenerateFn = async () => {
  throw new Error('invented outage');
};

type Turn = [name: string, words: string, generate: CrisisGenerateFn];
const CRISIS_TURNS: Turn[] = [
  ['a crisis pattern, the classifier none (reads disagree: soft check-in)', PATTERN, reply('none')],
  ['a classifier crisis read, the pattern none (reads disagree)', ORDINARY, reply('crisis')],
  ['a lone imminent goodbye (classifier imminent, a plain sign-off)', GOODBYE, reply('imminent')],
  ['a classifier timeout (no verdict)', ORDINARY, never],
  ['a missing read (the classifier call fails)', ORDINARY, fails],
];

let n = 0;
function call(): { sessionId: string; userId: string } {
  n++;
  return { sessionId: `crisis-hold-${n}`, userId: `user-crisis-hold-${n}` };
}

/** The turn pipeline's read of this turn, as process-turn.ts starts it (process-turn.ts:196). */
function readTurn(sessionId: string, words: string, generate: CrisisGenerateFn): void {
  startTurnCrisis(words, { recentTranscripts: [words] }, {
    sessionId,
    env: LIVE,
    generate,
    adjudicate: generate,
    groundedReads: [],
  });
}

/** A deep extraction job queued on an earlier turn of the call, run by the real worker. */
async function workerRuns(
  sessionId: string,
  userId: string
): Promise<{ writes: string[]; modelCalls: number }> {
  const worker = new DeepExtractionWorker();
  const internals = worker as unknown as {
    getGeminiModel: () => Promise<unknown>;
    processJob: (j: DeepExtractionJob) => Promise<void>;
  };
  let modelCalls = 0;
  internals.getGeminiModel = async () => {
    modelCalls++;
    return null; // hint-only extraction, no model
  };
  await internals.processJob({
    jobId: `deep-${userId}-${sessionId}-1`,
    userId,
    sessionId,
    turnNumber: 1,
    transcript: ORDINARY,
    timestamp: new Date('2026-11-15T12:00:00Z'),
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [{ name: 'Sam Rivera', type: 'person', context: 'friend', confidence: 0.9 }],
      emotionSignals: [],
      topicHints: ['home'],
      dateSignals: [],
      relationshipSignals: [],
    },
  });
  return { writes: written.filter((p) => p.includes(userId)), modelCalls };
}

beforeEach(() => {
  vi.mocked(getFirestoreDb).mockReturnValue(fakeDb as never);
  written.length = 0;
  emitted.length = 0;
  resetCrisisClassifierCache();
  resetCrisisCallRisk(); // also resets the memory hold
});
afterEach(() => {
  resetCrisisCallRisk();
  clearAllSTMBuffers();
  vi.restoreAllMocks();
});

describe('crisis memory hold: the turn pipeline, then fast capture and the worker', () => {
  it.each(CRISIS_TURNS)('%s: nothing queued or buffered, the call held', async (_n, words, gen) => {
    const { sessionId, userId } = call();
    expect(memoryHeld(sessionId)).toBe(false);
    readTurn(sessionId, words, gen);
    const result = await fastCapture({ transcript: words, userId, sessionId, turnNumber: 2 });
    recordTurn(sessionId, userId, result, words, 2); // as process-turn.ts does, after the capture
    expect(result.asyncJobId).toBeNull();
    expect(emitted).toEqual([]);
    expect(getRecentTurns(sessionId)).toEqual([]);
    expect(memoryHeld(sessionId)).toBe(true);
  });

  it.each(CRISIS_TURNS)('%s: an earlier job makes no model call, writes nothing', async (_n, w, g) => {
    const { sessionId, userId } = call();
    readTurn(sessionId, w, g);
    await fastCapture({ transcript: w, userId, sessionId, turnNumber: 2 });
    expect(await workerRuns(sessionId, userId)).toEqual({ writes: [], modelCalls: 0 });
  });

  it('an ordinary turn (a clean none) still queues; the worker calls the model, writes', async () => {
    const { sessionId, userId } = call();
    readTurn(sessionId, ORDINARY, reply('none'));
    const result = await fastCapture({ transcript: ORDINARY, userId, sessionId, turnNumber: 2 });
    recordTurn(sessionId, userId, result, ORDINARY, 2);
    expect(getRecentTurns(sessionId)).toHaveLength(1);
    expect(result.asyncJobId).toEqual(expect.stringContaining(sessionId));
    expect(emitted).toEqual(['memory:deep-extraction']);
    expect(memoryHeld(sessionId)).toBe(false);
    const { writes, modelCalls } = await workerRuns(sessionId, userId);
    expect(modelCalls).toBeGreaterThan(0);
    expect(writes.filter((p) => p.includes('/dynamic_entities/')).length).toBeGreaterThan(0);
  });
});
