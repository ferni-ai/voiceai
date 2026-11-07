/**
 * K1e: the turn pipeline's crisis read is what the call's outreach hold waits on. While a turn's
 * read is out, outreach for the call waits; a benign read lets it go, and a turn that tells of
 * someone hurting the caller holds the call from the start. Every line here is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const classifier = vi.hoisted(() => {
  const state = { settle: (_v: unknown) => undefined as void };
  const start = vi.fn(() => ({
    mode: 'live' as const,
    verdict: new Promise((resolve) => {
      state.settle = resolve;
    }),
  }));
  return { state, start };
});
vi.mock('../../../../services/safety/crisis-classifier.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  startCrisisClassifier: classifier.start,
}));

import { startTurnCrisis } from '../turn-crisis.js';
import {
  abuseHoldNow,
  abuseHoldsOutreach,
  resetAbuseOutreachHold,
} from '../../../../services/safety/abuse-outreach-hold.js';
import { resetCrisisCallRisk } from '../../../../services/safety/crisis-call-risk.js';

let n = 0;
beforeEach(() => {
  resetAbuseOutreachHold();
  resetCrisisCallRisk();
});

describe('the turn read the outreach hold waits on', () => {
  it('outreach waits while the turn read is out, then goes once it reads none', async () => {
    const sessionId = `turn-hold-${++n}`;
    const turn = startTurnCrisis("I'll call the landlord tomorrow about the lease.", undefined, {
      sessionId,
    });
    expect(abuseHoldNow({ sessionId })).toBe(false); // nothing out before the read is asked for
    const read = turn.resolve();
    expect(abuseHoldNow({ sessionId })).toBe(true); // a read in flight holds a writer that can't wait
    const waiting = abuseHoldsOutreach({ sessionId });
    classifier.state.settle({ risk: 'none', subject: 'self' });
    await read;
    expect(await waiting).toBe(false);
    expect(abuseHoldNow({ sessionId })).toBe(false);
  });

  it('a turn that tells of someone hurting the caller holds the call before any read settles', async () => {
    const sessionId = `turn-hold-${++n}`;
    startTurnCrisis('my husband hits me', undefined, { sessionId });
    expect(abuseHoldNow({ sessionId })).toBe(true);
    expect(await abuseHoldsOutreach({ sessionId })).toBe(true);
  });

  it('a suicidal-only turn does not hold the call once its read settles', async () => {
    const sessionId = `turn-hold-${++n}`;
    const turn = startTurnCrisis('I want to end my life.', undefined, { sessionId });
    const read = turn.resolve();
    classifier.state.settle({ risk: 'crisis', subject: 'self' });
    await read;
    expect(await abuseHoldsOutreach({ sessionId })).toBe(false);
  });
});
