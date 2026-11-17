/**
 * Knowledge capture (knowledge-capture.ts captureTurn) extracts nothing for a call a crisis read
 * held: no entity extraction, which is a model call on the caller's words, and so no write.
 * Turns queue per call and are captured a few at a time (knowledge-capture-batch.ts), so a held
 * call's whole pending batch is dropped, its calm turns with it. A call no read held is captured
 * as before. The real capture and queue run; only the entity extractor is faked. Plain, invented
 * words: the crisis is the classifier read's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({ extract: vi.fn(async (_words: string) => ({ entities: [] })) }));
vi.mock('../../extractors/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  extractEntities: w.extract,
}));

import { captureTurn, type TurnCaptureInput } from '../knowledge-capture.js';
import { createKnowledgeCaptureQueue } from '../knowledge-capture-batch.js';
import { crisisMemoryHeld } from '../../../../utils/crisis-memory-hold.js';
import {
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../../services/safety/crisis-call-risk.js';

const CALM = [
  'We drove out to the lake on Saturday and the water was freezing but fun.',
  'My cousin Tamsin Reed is bringing her two dogs over on Sunday afternoon.',
  'The garden had a good week, the tomatoes finally came in.',
];
const PLAIN = 'I gave my bike and my records to my neighbour Odile this week.';
let n = 0;

function call() {
  const sessionId = `kg-crisis-hold-${++n}`;
  const userId = `user-${sessionId}`; // one per row: the capture's per-user rate limit
  const input = (turnNumber: number, transcript: string): TurnCaptureInput => ({
    userId,
    sessionId,
    turnNumber,
    transcript,
  });
  return { sessionId, input };
}

/** A classifier read of these words finds risk; once it settles, the call is held. */
async function readFindsRisk(sessionId: string, words: string): Promise<void> {
  await trackCrisisRead(sessionId, words, Promise.resolve({ risk: 'crisis' }));
}

/** The queue with its idle timer never firing: a row flushes it with drain(). */
const queue = () => createKnowledgeCaptureQueue({ setTimer: () => 0, clearTimer: () => undefined });

beforeEach(() => w.extract.mockClear());
afterEach(() => resetCrisisCallRisk()); // also the memory hold

describe('knowledge capture: a call a crisis read held', () => {
  it('a call no read held: the turn is extracted, as before', async () => {
    const { input } = call();
    await captureTurn(input(1, CALM[0]));
    expect(w.extract).toHaveBeenCalledTimes(1);
    expect(w.extract.mock.calls[0][0]).toBe(CALM[0]);
  });

  it('a read finds risk in plain words: the turn is not extracted', async () => {
    const { sessionId, input } = call();
    expect(crisisMemoryHeld(sessionId)).toBe(false);
    await readFindsRisk(sessionId, PLAIN);
    expect(crisisMemoryHeld(sessionId)).toBe(true);
    await captureTurn(input(1, PLAIN));
    expect(w.extract).not.toHaveBeenCalled();
  });
});

describe('knowledge capture batch: a held call drops its whole pending batch', () => {
  it('calm, calm, then a crisis line queued for one call: nothing is extracted', async () => {
    const { sessionId, input } = call();
    const q = queue();
    q.queue(input(1, CALM[0]));
    q.queue(input(2, CALM[1]));
    await readFindsRisk(sessionId, PLAIN);
    q.queue(input(3, PLAIN));
    await q.drain(2_000);
    expect(crisisMemoryHeld(sessionId)).toBe(true);
    expect(w.extract).not.toHaveBeenCalled();
  });

  it('three calm turns for one call: one extraction of the merged batch, as before', async () => {
    const { input } = call();
    const q = queue();
    CALM.forEach((said, i) => q.queue(input(i + 1, said)));
    await q.drain(2_000);
    expect(w.extract).toHaveBeenCalledTimes(1);
    expect(w.extract.mock.calls[0][0]).toBe(CALM.join('\n'));
  });
});
