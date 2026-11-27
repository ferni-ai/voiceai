/**
 * CRISIS_GATE_TURN_READS (#4004): a pipeline read that STARTS after the gate's own read is in.
 *
 * LiveKit starts a preemptive reply, and so the reply gate and its read, at the final transcript
 * (agent_activity onPreemptiveGeneration). The turn pipeline's read starts later, at the end of
 * the turn (onUserTurnCompleted, processTurn). When the preemptive reply is kept the gate never
 * runs again, so the pipeline's read of that turn must reach the gate's decision late or not at
 * all. Through the real gate and the real pipeline on one call, with a stub classifier. All lines
 * are fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    debug: () => undefined,
    info: (fields: Record<string, unknown>, message: string) => logged.push([fields, message]),
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return { ...actual, createLogger: () => logger };
});

import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { nextTurnRead, noteTurnRead } from '../../../services/safety/crisis-turn-read-arrival.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate } from '../crisis-gate.js';

const R = (risk: string) => JSON.stringify({ risk, subject: 'self' });
const NONE = R('none');
const IMMINENT = R('imminent');
const FAILED = 'not json';

const ON = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_GATE_TURN_READS: 'on',
};

const EARLIER = ['Hey Ferni.', 'Not much, a long week at work.'];
const FERNI = 'That sounds like a lot. What has been the hardest part?';
/** A check-in word the patterns do not read (crisis-timeout-checkin.ts). */
const CHECKIN_WORDS = 'Some nights I feel unsafe in my own head';
/** No check-in word and no pattern: only a classifier could read risk in it. */
const EVERYDAY = 'Okay, I should head to bed soon';

let n = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetMinorCare();
  logged.length = 0;
});

/** The fields of each log line with this message. */
const lines = (message: string) => logged.filter(([, m]) => m === message).map(([f]) => f);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function request(words: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const line of EARLIER) ctx.addMessage({ role: 'user', content: line });
  ctx.addMessage({ role: 'assistant', content: FERNI });
  ctx.addMessage({ role: 'user', content: words });
  return ctx;
}

interface LateTurn {
  words: string;
  /** The gate's read, then the pipeline's. */
  reads: [string, string];
  /** How long after the gate's read is in the pipeline's read starts. */
  pipelineAfterMs?: number;
  /** How long the gate's own read takes to answer. */
  gateMs?: number;
  env?: Record<string, string>;
}

/** The gate first; the pipeline's read of the same turn starts once the gate's read is in. */
async function lateTurn(t: LateTurn) {
  const env = t.env ?? ON;
  const call = `late-read-${++n}`;
  let gateRead!: () => void;
  const gateAnswered = new Promise<void>((resolve) => {
    gateRead = resolve;
  });
  const gateGenerate: CrisisGenerateFn = async () => {
    if (t.gateMs) await sleep(t.gateMs);
    void Promise.resolve().then(gateRead); // once the read is in
    return t.reads[0];
  };
  const gate = startCrisisGate(
    request(t.words),
    { services: { sessionId: call } },
    { env, generate: gateGenerate }
  );
  await gateAnswered;
  await sleep(t.pipelineAfterMs ?? 5);
  const words = t.words.toLowerCase(); // a transcript may differ in case
  const pipe = startTurnCrisis(
    words,
    { recentTranscripts: [...EARLIER, words], lastAgentResponse: FERNI },
    { sessionId: call, env, generate: async () => t.reads[1] }
  );
  const [escalation] = await Promise.all([gate?.escalation, pipe.summary()]);
  return escalation ?? gate?.decision ?? null;
}

describe('CRISIS_GATE_TURN_READS: a pipeline read that starts after the gate read', () => {
  it('check-in words, gate none, the pipeline reads imminent once the gate read is in: on, the gate replaces', async () => {
    expect(await lateTurn({ words: CHECKIN_WORDS, reads: [NONE, IMMINENT] })).toMatchObject({
      action: 'replace',
    });
    expect(lines('CRISIS_GATE_TURN_READS')).toEqual([
      expect.objectContaining({ waitedForPipeline: true, reads: 2, raised: true }),
    ]);
  });

  it('flag off: the same turn passes, as main', async () => {
    const env = { ...ON, CRISIS_GATE_TURN_READS: 'off' };
    const off = await lateTurn({ words: CHECKIN_WORDS, reads: [NONE, IMMINENT], env });
    expect(off).toMatchObject({ action: 'pass' });
    expect(lines('CRISIS_GATE_TURN_READS')).toEqual([]);
  });

  it('an ordinary line never waits: the gate decides on its own read, the shadow logs the wait', async () => {
    expect(await lateTurn({ words: EVERYDAY, reads: [NONE, IMMINENT] })).toMatchObject({
      action: 'pass',
    });
    expect(lines('CRISIS_GATE_TURN_READS')).toEqual([
      expect.objectContaining({ waitedForPipeline: false, reads: 1 }),
    ]);
    expect(lines('CRISIS_GATE_TURN_READS_LATE_SHADOW')).toEqual([
      { wouldWait: true, arrived: true, wouldAddMs: expect.any(Number) },
    ]);
  });

  it('a pipeline read that starts past the bound: the gate decides as main (pass)', async () => {
    const env = { ...ON, CRISIS_CLASSIFIER_TIMEOUT_MS: '100' }; // bound: 100 ms from the gate's ask
    const past = await lateTurn({
      words: CHECKIN_WORDS,
      reads: [NONE, IMMINENT],
      pipelineAfterMs: 500,
      env,
    });
    expect(past).toMatchObject({ action: 'pass' });
    const [line] = lines('CRISIS_GATE_TURN_READS');
    expect(line).toMatchObject({ waitedForPipeline: true, reads: 1, raised: false });
    expect(line?.waitedMs).toBeGreaterThanOrEqual(90);
    expect(line?.waitedMs).toBeLessThan(250); // never the 250 ms grace on top
  });

  it("the bound runs from the gate's ask: a slow gate read leaves only the rest of the timeout", async () => {
    const env = { ...ON, CRISIS_CLASSIFIER_TIMEOUT_MS: '200' };
    // The gate's read answers at 120 ms; the pipeline's starts 120 ms later, past 200 from the ask.
    const slow = await lateTurn({
      words: CHECKIN_WORDS,
      reads: [NONE, IMMINENT],
      gateMs: 120,
      pipelineAfterMs: 120,
      env,
    });
    expect(slow).toMatchObject({ action: 'pass' });
    const [line] = lines('CRISIS_GATE_TURN_READS');
    expect(line).toMatchObject({ waitedForPipeline: true, raised: false });
    expect(line?.waitedMs).toBeLessThan(110);
  });

  it('a gate read that already holds risk never waits: it acts at once', async () => {
    const env = { ...ON, CRISIS_CLASSIFIER_TIMEOUT_MS: '100' }; // bound: 100 + 250 ms
    const risk = await lateTurn({
      words: CHECKIN_WORDS,
      reads: [IMMINENT, NONE],
      pipelineAfterMs: 400,
      env,
    });
    expect(risk).toMatchObject({ action: 'replace' });
    const [line] = lines('CRISIS_GATE_TURN_READS');
    expect(line).toMatchObject({ waitedForPipeline: false });
    expect(line?.waitedMs).toBeLessThan(100);
  });

  it('a late read that fails, on check-in words: the check-in with 988 decides, never a script', async () => {
    const env = { ...ON, CRISIS_TIMEOUT_CHECKIN: 'on' };
    const late = await lateTurn({ words: CHECKIN_WORDS, reads: [NONE, FAILED], env });
    expect(late).toMatchObject({ action: 'guide' });
    const guidance = (late as { guidance?: string }).guidance ?? '';
    expect(guidance).toContain('[SAFETY - CHECK-IN]');
    expect(guidance).toMatch(/\b988\b/);
  });

  it("a late read of none: the gate's own read stands (pass)", async () => {
    expect(await lateTurn({ words: CHECKIN_WORDS, reads: [NONE, NONE] })).toMatchObject({
      action: 'pass',
    });
    expect(lines('CRISIS_GATE_TURN_READS')).toEqual([
      expect.objectContaining({ waitedForPipeline: true }),
    ]);
  });
});

describe('crisis-turn-read-arrival: the waiter', () => {
  it('wakes on the next read of its call only; a read before it waited never wakes it', async () => {
    const woken = nextTurnRead('call-x', 1000);
    const timedOut = nextTurnRead('call-y', 20);
    noteTurnRead('call-z');
    noteTurnRead('call-x');
    expect(await woken).toBe(true);
    expect(await timedOut).toBe(false);
    expect(await nextTurnRead('call-x', 30)).toBe(false);
    expect(await nextTurnRead('call-x', 0)).toBe(false);
  });
});
