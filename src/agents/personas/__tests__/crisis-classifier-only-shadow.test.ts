/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN=shadow changes nothing a caller hears:
 * through the real reply gate and turn pipeline, across lines, reads and
 * crisis configurations, shadow gives the same decisions, summaries and model
 * calls as off, and it does log the turns it measures.
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
      if (bindings?.module !== 'CrisisClassifierOnly') return base;
      return { ...base, info };
    },
  };
});

import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate } from '../crisis-gate.js';

const R = (risk: string, subject = 'self') => JSON.stringify({ risk, subject });
const EARLIER = [
  "Hey Ferni, it's me.",
  'Not much, just a long week.',
  'I did send it Wednesday night.',
];
const COMPANION = "You mentioned it's been a long week. What's been going on?";
const LATESTS = [
  'The running, not so much. Once. maybe.',
  "I'm just so tired. like bone tired.",
  "Honestly I don't want to be alive anymore.",
  'Tell my mom I love her. Bye.',
  'I have the pills here.',
  'Make sure my brother gets my guitar.',
];
const READS: Array<[string, string]> = [
  [R('crisis'), R('crisis')],
  [R('crisis'), R('none')],
  [R('imminent'), R('crisis')],
  [R('crisis', 'third_party'), R('crisis')],
  [R('none'), R('none')],
  ['garbage', R('crisis')],
];
const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const ENVS: Record<string, Record<string, string>> = {
  prod: { ...BASE, CRISIS_AGREEMENT_GATE: 'on' },
  noAgreement: { ...BASE },
  adjShadow: { ...BASE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_ADJUDICATOR: 'shadow' },
};

let n = 0;
beforeEach(() => {
  info.mockClear();
});

async function turn(latest: string, reads: [string, string], env: Record<string, string>) {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  const session = `shadow-eq-${++n}`;
  let gen = 0;
  let adj = 0;
  const g =
    (r: string): CrisisGenerateFn =>
    async () => {
      gen++;
      return r;
    };
  const adjudicate: CrisisGenerateFn = async () => {
    adj++;
    return '{"caller_risk":"","decision":"checkin","confidence":"high"}';
  };
  const ctx = llm.ChatContext.empty();
  for (const l of EARLIER) ctx.addMessage({ role: 'user', content: l });
  ctx.addMessage({ role: 'assistant', content: COMPANION });
  ctx.addMessage({ role: 'user', content: latest });
  const gate = startCrisisGate(
    ctx,
    { services: { sessionId: session } },
    {
      env,
      generate: g(reads[0]),
      adjudicate,
    }
  );
  const pipe = startTurnCrisis(
    latest,
    { recentTranscripts: ['Morning.', ...EARLIER, latest], lastAgentResponse: COMPANION },
    { sessionId: session, env, generate: g(reads[1]), adjudicate }
  );
  const [escalation, summary, soft, bypass] = await Promise.all([
    gate?.escalation,
    pipe.summary(),
    pipe.softCheck(),
    pipe.bypassAllowed(),
  ]);
  await new Promise<void>((r) => {
    setTimeout(r, 5); // let shadow work finish, so any extra call would be counted
  });
  return {
    decision: gate?.decision ?? null,
    escalation: escalation ?? null,
    summary,
    soft,
    bypass,
    gen,
    adj,
  };
}

describe('shadow equals off', () => {
  for (const [envName, env] of Object.entries(ENVS)) {
    it(`${envName}: every line and read pair`, async () => {
      for (const latest of LATESTS) {
        for (const reads of READS) {
          const off = await turn(latest, reads, env);
          const shadow = await turn(latest, reads, {
            ...env,
            CRISIS_CLASSIFIER_ONLY_CHECKIN: 'shadow',
          });
          expect(shadow, `${latest} | ${reads.join(',')}`).toEqual(off);
        }
      }
    });
  }

  it('shadow logs the canary turn; off logs nothing', async () => {
    const reads: [string, string] = [R('crisis'), R('crisis')];
    await turn(LATESTS[0], reads, ENVS.prod);
    expect(info).not.toHaveBeenCalled();
    await turn(LATESTS[0], reads, { ...ENVS.prod, CRISIS_CLASSIFIER_ONLY_CHECKIN: 'shadow' });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'shadow', why: 'eligible' }),
      'CRISIS_CLASSIFIER_ONLY'
    );
  });

  it('a logger that throws in shadow leaves the turn exactly as off', async () => {
    const reads: [string, string] = [R('crisis'), R('crisis')];
    const off = await turn(LATESTS[0], reads, ENVS.prod);
    info.mockImplementation(() => {
      throw new Error('logger down');
    });
    const shadow = await turn(LATESTS[0], reads, {
      ...ENVS.prod,
      CRISIS_CLASSIFIER_ONLY_CHECKIN: 'shadow',
    });
    info.mockReset();
    expect(shadow).toEqual(off);
  });
});
