/**
 * processTurn's person mentions, its capture and its knowledge-graph queue (process-turn.ts:
 * relationship-network-extraction, dynamic-memory-capture, knowledge-graph-capture) wait, off the
 * reply path, for the turn's crisis read and the call's reads to settle (crisis-memory-hold.ts
 * crisisTurnSettled). A read that finds risk, or no read at all, keeps nothing: no person
 * mention, no fast capture, no short-term record, no queued turn. A clean read keeps them.
 * The turn never waits: with the read held open, processTurn is done before anything is kept
 * (were the wait inline, the turn would stall for it; this replaces
 * crisis-memory-hold-latency.test.ts, whose probe sat behind the wait). The real processTurn
 * runs; only the writers are faked (the knowledge-graph batch is real, its extraction a spy).
 * Plain, invented words: the crisis is the classifier read's, not a pattern's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], topicHints: [] })),
  recordTurn: vi.fn(),
  /** Every name the turn would keep, in one call (relationship-network.ts recordNamesSaid). */
  recordNamesSaid: vi.fn(async (_userId: string, names: Array<{ name: string }>) =>
    names.map((n) => n.name)
  ),
  /** The turn's own read note (turn-crisis.ts) is dropped: no read of the turn starts. */
  noRead: false,
  /** Knowledge graph: off unless a row turns it on; queued lines and the batch they go to. */
  kgReady: false,
  queued: [] as string[],
  batch: undefined as { queue: (input: never) => void } | undefined,
}));
vi.mock('../../../../memory/knowledge-graph/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isKnowledgeCaptureReady: () => w.kgReady,
  queueTurnCapture: (input: { transcript: string }) => {
    w.queued.push(input.transcript);
    w.batch?.queue(input as never);
  },
}));
vi.mock('../../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: w.recordTurn,
}));
vi.mock('../../../../services/superhuman/relationship-network.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordNamesSaid: w.recordNamesSaid,
}));
vi.mock('../../../../utils/crisis-memory-hold.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/crisis-memory-hold.js')>();
  return {
    ...real,
    noteCrisisTurnRead: (sessionId: string | undefined, words: string) =>
      w.noRead ? undefined : real.noteCrisisTurnRead(sessionId, words),
  };
});

import { processTurn } from '../process-turn.js';
import { extractNames } from '../../../../services/superhuman/relationship-network.js';
import { CRISIS_READ_WAIT, crisisReadsSettled } from '../../../../utils/crisis-memory-hold.js';
import { memoryHeld, resetMinorCare } from '../../../../utils/minor-care.js';
import { createKnowledgeCaptureQueue } from '../../../../memory/knowledge-graph/services/knowledge-capture-batch.js';
import {
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../../services/safety/crisis-call-risk.js';
import {
  getFireAndForgetMetrics,
  resetFireAndForgetMetrics,
} from '../../../../utils/safe-fire-and-forget.js';

const SAID = 'My friend Sam Rivera and I fixed up the garden shed today, it looks great.';
const NAMES = extractNames(SAID).length;
/** A line a classifier reads as a crisis, naming someone; no crisis pattern in it. */
const NAMED = 'My sister Nadia keeps asking if I am okay and I do not know what to say anymore.';
/** Plain words; on the crisis turn the risk comes from the classifier read, not a pattern. */
const CALM = ['We planted tomatoes.', 'The neighbor lent us a ladder.', 'Dinner was tacos.'];
const LAST = 'I put the last of the paint away tonight and cleaned the brushes.';
const SITES = [
  'relationship-network-extraction',
  'dynamic-memory-capture',
  'knowledge-graph-capture',
];
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;

const ran = (context: string): number => {
  const m = getFireAndForgetMetrics().byContext.find((c) => c.context === context);
  return m ? m.successes + m.failures : 0;
};
const sleep = (ms: number, value: string) =>
  new Promise<string>((resolve) => {
    setTimeout(resolve, ms, value);
  });

/** A real processTurn on `said`; the tail needs a live session, so its throw is ignored. */
function startTurn(
  before: (sessionId: string) => void = () => undefined,
  said = SAID,
  sessionId = `turn-capture-hold-${++n}`
) {
  const userId = `user-${sessionId}`;
  before(sessionId);
  const ctx = {
    userText: said,
    userData: { userId, turnCount: 3, recentTranscripts: [said] },
    services: { sessionId, userId },
    persona: { id: 'ferni', name: 'Ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  };
  const done = processTurn(ctx as never).then(
    () => 'turn done',
    () => 'turn done'
  );
  return { sessionId, userId, done };
}

/** One turn, read once every detached site has run to the end (`runs` turns so far). */
async function turn(
  before?: (sessionId: string) => void,
  said = SAID,
  sessionId?: string,
  runs = 1
) {
  const t = startTurn(before, said, sessionId);
  await t.done;
  await vi.waitFor(() => {
    for (const site of SITES) expect(ran(site), site).toBe(runs);
  });
  return t;
}

beforeEach(() => {
  for (const fn of [w.fastCapture, w.recordTurn, w.recordNamesSaid]) fn.mockClear();
  Object.assign(w, { noRead: false, kgReady: false, queued: [], batch: undefined });
  resetFireAndForgetMetrics();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 2000 });
});
afterEach(() => {
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk(); // also the memory hold
  resetMinorCare();
});

describe('processTurn: person mentions and capture wait for the turn crisis read', () => {
  it('a clean read of the turn: the people and the capture are kept, as before', async () => {
    const { userId } = await turn();
    expect(NAMES).toBeGreaterThan(0);
    expect(w.recordNamesSaid).toHaveBeenCalledTimes(1);
    expect(w.recordNamesSaid).toHaveBeenCalledWith(userId, extractNames(SAID));
    expect(w.fastCapture).toHaveBeenCalledTimes(1);
    expect(w.fastCapture).toHaveBeenCalledWith(expect.objectContaining({ transcript: SAID }));
    expect(w.recordTurn).toHaveBeenCalledTimes(1);
  });

  it('a classifier read finds risk in plain words: no person, no capture, no record', async () => {
    const late = new Promise<{ risk: string }>((resolve) => {
      setTimeout(resolve, 150, { risk: 'crisis' });
    });
    const { sessionId } = await turn((id) => {
      expect(memoryHeld(id)).toBe(false);
      void trackCrisisRead(id, SAID, late);
    });
    expect(memoryHeld(sessionId)).toBe(true);
    expect(w.recordNamesSaid).not.toHaveBeenCalled();
    expect(w.fastCapture).not.toHaveBeenCalled();
    expect(w.recordTurn).not.toHaveBeenCalled();
  });

  it('a crisis line that names someone: no person mention is recorded', async () => {
    expect(extractNames(NAMED).length).toBeGreaterThan(0); // it does name someone
    const crisis = Promise.resolve({ risk: 'crisis' });
    const { sessionId } = await turn((id) => void trackCrisisRead(id, NAMED, crisis), NAMED);
    expect(memoryHeld(sessionId)).toBe(true);
    expect(w.recordNamesSaid).not.toHaveBeenCalled();
    expect(w.fastCapture).not.toHaveBeenCalled();
  });

  it('no crisis read of the turn starts: nothing kept (fail closed), call not held', async () => {
    w.noRead = true;
    const { sessionId } = await turn();
    expect(w.recordNamesSaid).not.toHaveBeenCalled();
    expect(w.fastCapture).not.toHaveBeenCalled();
    expect(w.recordTurn).not.toHaveBeenCalled();
    expect(memoryHeld(sessionId)).toBe(false);
  });
});

describe('processTurn: a crisis line never enters the knowledge-graph batch', () => {
  it('3 calm turns, then a crisis line with its read held open: never queued', async () => {
    Object.assign(CRISIS_READ_WAIT, { settleMs: 15_000 });
    const extract = vi.fn(async (_input: { transcript: string }) => ({}));
    const batch = createKnowledgeCaptureQueue({
      capture: extract,
      setTimer: () => 0,
      clearTimer: () => undefined,
    });
    Object.assign(w, { kgReady: true, batch });
    const call = `turn-capture-hold-${++n}`;
    for (const [i, said] of CALM.entries()) await turn(undefined, said, call, i + 1);
    expect(w.queued).toEqual(CALM); // the calm turns are queued, as before
    let release: (v: { risk: string }) => void = () => undefined;
    const open = new Promise<{ risk: string }>((resolve) => {
      release = resolve;
    });
    const t = startTurn((id) => void trackCrisisRead(id, LAST, open), LAST, call);
    expect(await Promise.race([t.done, sleep(5_000, 'still waiting')])).toBe('turn done');
    await sleep(500, 'the detached work has had its chance');
    expect(w.queued).not.toContain(LAST); // not queued while the read is open
    release({ risk: 'crisis' });
    await vi.waitFor(() => expect(ran('knowledge-graph-capture')).toBe(4), { timeout: 5_000 });
    expect(memoryHeld(call)).toBe(true);
    expect(w.queued).toEqual(CALM); // nor after the read finds risk
    await batch.drain(2_000);
    expect(extract).toHaveBeenCalledTimes(1); // the calm turns are still extracted
    for (const [input] of extract.mock.calls) expect(input.transcript).not.toContain(LAST);
  }, 30_000);
});

describe('processTurn: the wait is never on the turn path', () => {
  it('the read held open: the turn is done first, the capture runs once it settles', async () => {
    Object.assign(CRISIS_READ_WAIT, { settleMs: 15_000 });
    let release: (v: { risk: string }) => void = () => undefined;
    const open = new Promise<{ risk: string }>((resolve) => {
      release = resolve;
    });
    const t = startTurn((id) => void trackCrisisRead(id, SAID, open));
    const first = await Promise.race([t.done, sleep(5_000, 'still waiting on the read')]);
    expect(first).toBe('turn done');
    expect(crisisReadsSettled(t.sessionId)).not.toBeNull(); // the read is still open
    expect(w.fastCapture).not.toHaveBeenCalled();
    expect(w.recordNamesSaid).not.toHaveBeenCalled();
    release({ risk: 'none' });
    await vi.waitFor(() => expect(w.fastCapture).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    await vi.waitFor(() => expect(w.recordNamesSaid).toHaveBeenCalledTimes(1));
  }, 30_000);
});
