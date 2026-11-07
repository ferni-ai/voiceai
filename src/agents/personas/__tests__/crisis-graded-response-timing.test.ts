/**
 * CRISIS_GRADED_RESPONSE=shadow stays off the reply path (#3488 review): a slow grade never
 * delays the gate's decision or the pipeline's summary. The grade here takes 50 ms of
 * synchronous work, and in the pipeline's check every turnVerdicts read 50 ms more, so a seam
 * that waits on either shows it. Each check warms up once, then compares shadow with off, and
 * proves the grade still ran. All lines are fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (load) => {
  const real = await load<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: { module?: string }) => {
      const base = real.createLogger(bindings as never);
      return bindings?.module === 'CrisisGradedResponse' ? { ...base, info } : base;
    },
  };
});
const SLOW_MS = 50;
/** Whether turnVerdicts reads are slow too (the pipeline's check). */
const slow = vi.hoisted(() => ({ reads: false }));
vi.mock('../../../services/safety/crisis-graded-response.js', async (load) => {
  const real = await load<typeof import('../../../services/safety/crisis-graded-response.js')>();
  return {
    ...real,
    gradeTurn: (...args: Parameters<typeof real.gradeTurn>) => {
      const until = performance.now() + SLOW_MS;
      while (performance.now() < until); // a grade that blocks for SLOW_MS
      return real.gradeTurn(...args);
    },
  };
});
vi.mock('../../../services/safety/crisis-classifier.js', async (load) => {
  const real = await load<typeof import('../../../services/safety/crisis-classifier.js')>();
  return {
    ...real,
    turnVerdicts: async (...args: Parameters<typeof real.turnVerdicts>) => {
      const reads = await real.turnVerdicts(...args);
      if (slow.reads) {
        await new Promise((r) => {
          setTimeout(r, SLOW_MS);
        });
      }
      return reads;
    },
  };
});

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetGradedResponse } from '../../../services/safety/crisis-graded-shadow.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate } from '../crisis-gate.js';

const CRISIS = JSON.stringify({ risk: 'crisis', subject: 'self' });
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const PROD = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' };
const SHADOW = { ...PROD, CRISIS_GRADED_RESPONSE: 'shadow' };
const EARLIER = ['Hey Ferni.', 'Not much, long day at work.'];
const FERNI = 'Long days add up. What would help you wind down tonight?';
const LATEST = 'Okay, I should head to bed';
const generate: CrisisGenerateFn = async () => CRISIS;
const grades = () => info.mock.calls.filter((c) => c[1] === 'CRISIS_GRADE');
const drain = () =>
  new Promise<void>((r) => {
    setTimeout(r, SLOW_MS * 4);
  });

let n = 0;
beforeEach(async () => {
  await drain();
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetMinorCare();
  resetGradedResponse();
  info.mockReset();
});

/** Milliseconds from the gate's start to its decision. */
async function gateMs(env: Record<string, string>): Promise<number> {
  const ctx = llm.ChatContext.empty();
  for (const l of EARLIER) ctx.addMessage({ role: 'user', content: l });
  ctx.addMessage({ role: 'assistant', content: FERNI });
  ctx.addMessage({ role: 'user', content: LATEST });
  const userData = { services: { sessionId: `timing-gate-${++n}` } };
  const t0 = performance.now();
  const gate = startCrisisGate(ctx, userData, { env, generate });
  const decided = await gate?.escalation;
  const ms = performance.now() - t0;
  expect(decided).toMatchObject({ action: 'guide' });
  return ms;
}

/** Milliseconds from the pipeline's start to its summary. */
async function pipelineMs(env: Record<string, string>): Promise<number> {
  const t0 = performance.now();
  const pipe = startTurnCrisis(
    LATEST,
    { recentTranscripts: [...EARLIER, LATEST], lastAgentResponse: FERNI },
    { sessionId: `timing-pipe-${++n}`, env, generate }
  );
  const summary = await pipe.summary();
  const ms = performance.now() - t0;
  expect(summary).toBeTruthy();
  return ms;
}

describe('CRISIS_GRADED_RESPONSE=shadow: a slow grade never delays the reply', () => {
  it("the gate's decision does not wait for a 50 ms grade, and the grade still runs", async () => {
    slow.reads = false;
    await gateMs(PROD); // warm up
    const off = await gateMs(PROD);
    await drain();
    expect(grades()).toEqual([]);
    const shadow = await gateMs(SHADOW);
    expect(shadow - off).toBeLessThan(SLOW_MS / 2);
    await drain();
    expect(grades().map((c) => c[0])).toEqual([expect.objectContaining({ source: 'gate' })]);
  });

  it("the pipeline's summary does not wait for the grader's reads, and the grade still runs", async () => {
    slow.reads = true;
    await pipelineMs(PROD); // warm up
    const off = await pipelineMs(PROD);
    await drain();
    expect(grades()).toEqual([]);
    const shadow = await pipelineMs(SHADOW);
    expect(shadow - off).toBeLessThan(SLOW_MS / 2);
    await drain();
    expect(grades().map((c) => c[0])).toEqual([expect.objectContaining({ source: 'pipeline' })]);
  });
});
