/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN not live: the turn pipeline never reaches the
 * easing hook, so nothing is chained onto the settled turn. Live reaches it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/safety/crisis-classifier-only-live.js', async (load) => {
  const real =
    await load<typeof import('../../../../services/safety/crisis-classifier-only-live.js')>();
  return {
    ...real,
    easingCheckin: async (...args: Parameters<typeof real.easingCheckin>) => {
      hook(...args);
      return real.easingCheckin(...args);
    },
  };
});

import { resetCrisisCallRisk } from '../../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../turn-crisis.js';

const EARLIER = [
  "Hey Ferni, it's me.",
  'Not much, just a long week.',
  'I did send it Wednesday night.',
];
const ENV = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
};
const crisisRead: CrisisGenerateFn = async () =>
  JSON.stringify({ risk: 'crisis', subject: 'self' });

let n = 0;
beforeEach(() => {
  hook.mockClear();
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

async function settleTurn(env: Record<string, string>): Promise<void> {
  const latest = 'The running, not so much. Once. maybe.';
  const pipe = startTurnCrisis(
    latest,
    { recentTranscripts: [...EARLIER, latest], lastAgentResponse: 'What has been going on?' },
    { sessionId: `easing-off-${++n}`, env, generate: crisisRead, adjudicate: async () => '' }
  );
  await Promise.all([pipe.summary(), pipe.softCheck(), pipe.bypassAllowed(), pipe.resolve()]);
}

describe('turn pipeline easing hook', () => {
  it('unset, off, shadow or junk: never reached', async () => {
    for (const value of [undefined, 'off', 'shadow', 'LIVELY', '']) {
      const env: Record<string, string> = { ...ENV };
      if (value !== undefined) env.CRISIS_CLASSIFIER_ONLY_CHECKIN = value;
      await settleTurn(env);
    }
    expect(hook).toHaveBeenCalledTimes(0);
  });

  it('live: reached once for a classifier crisis guide', async () => {
    await settleTurn({ ...ENV, CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' });
    expect(hook).toHaveBeenCalledTimes(1);
  });
});
