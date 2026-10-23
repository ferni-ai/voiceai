/**
 * THIRD_PARTY_SELF_HARM through the real turn pipeline (#2635): live gives a third-party worry the
 * third-party guidance and keeps the router off the turn; off and shadow settle every turn exactly
 * as the flag unset does; shadow logs the turns live would change, once each.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/safe-logger.js', async (load) => {
  const real = await load<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: { module?: string }) => {
      const base = real.createLogger(bindings as never);
      return bindings?.module === 'CrisisThirdParty' ? { ...base, info } : base;
    },
  };
});

import { buildCrisisGuidance } from '../../../../services/safety/crisis-guard.js';
import { resetCrisisCallRisk } from '../../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../turn-crisis.js';

const EARLIER = ["Hey Ferni, it's me.", "It's my brother. He's been really low."];
const COMPANION = "I'm sorry, that sounds heavy. What's been going on with him?";
const LINES = [
  "he keeps saying he'll hurt himself",
  'kill himself',
  'my brother wants to kill himself',
  'he hurt himself playing soccer',
  'I had a long week at work.',
  'I want to kill myself.',
];
const noRead: CrisisGenerateFn = async () => JSON.stringify({ risk: 'none', subject: 'self' });

let n = 0;
beforeEach(() => {
  info.mockReset();
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});
afterEach(() => vi.unstubAllEnvs());

async function settle(text: string) {
  const pipe = startTurnCrisis(
    text,
    { recentTranscripts: [...EARLIER, text], lastAgentResponse: COMPANION },
    { sessionId: `tp-${++n}`, env: { CRISIS_CLASSIFIER_MODE: 'live' }, generate: noRead }
  );
  const [summary, bypass] = await Promise.all([pipe.summary(), pipe.bypassAllowed()]);
  return { summary, bypass, shouldBlock: pipe.shouldBlock };
}

describe('turn pipeline, THIRD_PARTY_SELF_HARM', () => {
  it('live: "he keeps saying he\'ll hurt himself" gets the third-party guidance, no router bypass', async () => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'live');
    const { summary, bypass, shouldBlock } = await settle("he keeps saying he'll hurt himself");
    expect(summary.isCrisis).toBe(true);
    expect(summary.subject).toBe('third_party');
    expect(summary.shouldOverrideLLM).toBe(false);
    expect(shouldBlock).toBe(false);
    expect(bypass).toBe(false);
    expect(buildCrisisGuidance(summary as never)).toContain('on the person');
  });

  it.each(['off', 'shadow'])('%s: every turn settles exactly as with the flag unset', async (mode) => {
    const unset = [];
    for (const text of LINES) unset.push(JSON.stringify(await settle(text)));
    vi.stubEnv('THIRD_PARTY_SELF_HARM', mode);
    const got = [];
    for (const text of LINES) got.push(JSON.stringify(await settle(text)));
    expect(got).toEqual(unset);
    expect(JSON.parse(got[0]).summary.isCrisis).toBe(false);
  });

  it('shadow: logs only the turns live would change, once each', async () => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'shadow');
    for (const text of LINES) await settle(text);
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls.every((c) => c[1] === 'THIRD_PARTY_SELF_HARM_SHADOW')).toBe(true);
  });

  it.each(['off', 'live'])('%s: logs nothing', async (mode) => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', mode);
    for (const text of LINES) await settle(text);
    expect(info).not.toHaveBeenCalled();
  });
});
