/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN off: the turn pipeline never reaches the
 * shadow hook, so no .then is attached to the settled turn. Shadow reaches it
 * once per turn, however often the turn is read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/safety/crisis-classifier-only.js', async (load) => {
  const real = await load<typeof import('../../../../services/safety/crisis-classifier-only.js')>();
  return {
    ...real,
    shadowClassifierOnly: (...args: Parameters<typeof real.shadowClassifierOnly>) => {
      hook(...args);
      return real.shadowClassifierOnly(...args);
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
const COMPANION = "You mentioned it's been a long week. What's been going on?";
const LATEST = 'The running, not so much. Once. maybe.';
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
  const pipe = startTurnCrisis(
    LATEST,
    { recentTranscripts: [...EARLIER, LATEST], lastAgentResponse: COMPANION },
    { sessionId: `off-hook-${++n}`, env, generate: crisisRead }
  );
  await Promise.all([pipe.summary(), pipe.softCheck(), pipe.bypassAllowed(), pipe.resolve()]);
}

describe('turn pipeline shadow hook', () => {
  it('off (unset or any other value): never called, so nothing is attached to the turn', async () => {
    for (const value of [undefined, 'off', 'live', 'SHADOWY', '']) {
      const env: Record<string, string> = { ...ENV };
      if (value !== undefined) env.CRISIS_CLASSIFIER_ONLY_CHECKIN = value;
      await settleTurn(env);
    }
    expect(hook).toHaveBeenCalledTimes(0);
  });

  it('shadow: called once for the turn, with the settled turn', async () => {
    await settleTurn({ ...ENV, CRISIS_CLASSIFIER_ONLY_CHECKIN: 'shadow' });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });
});
