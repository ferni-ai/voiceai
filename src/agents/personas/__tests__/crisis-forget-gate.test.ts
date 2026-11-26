/**
 * The #4159 dev call, through the live reply gate and the turn pipeline: a request to forget a
 * named thing with a classifier-only crisis read. With CRISIS_FORGET_EVERYDAY on, the caller
 * gets the soft check-in (never nothing); off, or set to any word but "on", crisis guidance as
 * today. Risky lines, imminent reads, an earlier risky read, a check that throws and a live
 * adjudicator that escalates all keep full crisis guidance. Lines are fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A step inside the forget check throwing (the risk list here).
const h = vi.hoisted(() => ({ breaks: false }));
vi.mock('../../../services/safety/crisis-agreement.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../services/safety/crisis-agreement.js')>(); // prettier-ignore
  return {
    ...real,
    hasRiskContent: (text: string) => {
      if (h.breaks) throw new Error('risk list broke');
      return real.hasRiskContent(text);
    },
  };
});

import { allowCrisisAdjudicatorLiveForTests } from '../../../services/safety/crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import {
  crisisRiskThisCall,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_FORGET_EVERYDAY: 'on' };
const read =
  (risk: string, subject = 'self'): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"${subject}"}`;
const crisisRead = read('crisis');

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const escalate: CrisisGenerateFn = async () =>
  '{"caller_risk":"","decision":"escalate","confidence":"high"}';
/** The adjudicator truly live (it is held as shadow outside tests). */
const LIVE_ADJUDICATOR = { ...ON, CRISIS_ADJUDICATOR: 'live' };

async function effective(
  ctx: llm.ChatContext,
  sessionId: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn = crisisRead
): Promise<CrisisGateDecision> {
  const options = { env, generate, adjudicate: escalate };
  const gate = startCrisisGate(ctx, { services: { sessionId } }, options);
  if (!gate) throw new Error('gate off');
  return (await gate.escalation) ?? gate.decision;
}

const soft = { action: 'guide', guidance: SOFT_CRISIS_CHECK };
const full = (d: CrisisGateDecision): boolean =>
  d.action === 'replace' || (d.action === 'guide' && d.guidance !== SOFT_CRISIS_CHECK);

beforeEach(() => {
  h.breaks = false;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});
afterEach(() => allowCrisisAdjudicatorLiveForTests(false));

const COMPANION = 'Two meetings today, and a call at four.';
const FORGET = "And forget Theo's number too. I'll just keep it in my phone.";
const DEV = request(['user', 'What do I have today?'], ['assistant', COMPANION], ['user', FORGET]);

describe('a forget request through the crisis gate', () => {
  it('gets the soft check-in, not crisis guidance, with CRISIS_FORGET_EVERYDAY on', async () => {
    expect(await effective(DEV, 'dev-on', ON)).toEqual(soft);
    expect(crisisRiskThisCall('dev-on')).toBe(true); // a soft check-in is still risk on the call
  });

  it.each([undefined, 'off', 'live', 'true', '1'])(
    'gets crisis guidance with the flag %s, as the dev call did',
    async (word) => {
      const env = word === undefined ? LIVE : { ...LIVE, CRISIS_FORGET_EVERYDAY: word };
      expect(full(await effective(DEV, `dev-${word}`, env))).toBe(true);
    }
  );

  it('keeps crisis guidance when a step inside the forget check throws', async () => {
    h.breaks = true;
    expect(full(await effective(DEV, 'dev-breaks', ON))).toBe(true);
  });

  it('leaves the turn to a live adjudicator, which keeps crisis guidance when it escalates', async () => {
    allowCrisisAdjudicatorLiveForTests(true);
    expect(full(await effective(DEV, 'dev-adjudicated', LIVE_ADJUDICATOR))).toBe(true);
  });

  it('never softens an imminent read', async () => {
    expect((await effective(DEV, 'imminent', ON, read('imminent'))).action).toBe('replace');
  });

  it.each([
    'forget about me',
    'please forget I exist',
    'forget the Denver job, I want to die',
    "forget the Denver job I'm so tired",
    'Forget it.',
  ])('keeps crisis guidance for "%s"', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    expect(full(await effective(ctx, `neg ${line}`, ON))).toBe(true);
  });

  it('after a turn read as risk on the same call, a forget request gets crisis guidance', async () => {
    const said = "I gave my dog to my sister, she'll take better care of him";
    await effective(request(['user', said]), 'read-risk', ON);
    const ctx = request(['user', said], ['assistant', 'Oh, okay.'], ['user', FORGET]);
    expect(full(await effective(ctx, 'read-risk', ON))).toBe(true);
  });
});

describe('a forget request through the turn pipeline (startTurnCrisis)', () => {
  const turnFor = (sessionId: string, env: Record<string, string>, line = FORGET) =>
    startTurnCrisis(
      line,
      { recentTranscripts: ['What do I have today?'], lastAgentResponse: COMPANION },
      { sessionId, env, generate: crisisRead, adjudicate: escalate }
    );

  it('gets the soft check-in with the flag on', async () => {
    const turn = turnFor('pipe-on', ON);
    expect(await turn.softCheck()).toBe(true);
    expect((await turn.resolve()).isCrisis).toBe(false);
  });

  it('keeps crisis handling with the flag off, or for a line about the caller', async () => {
    const off = turnFor('pipe-off', LIVE);
    expect(await off.softCheck()).toBe(false);
    expect((await off.resolve()).isCrisis).toBe(true);
    const self = turnFor('pipe-self', ON, 'forget about me');
    expect(await self.softCheck()).toBe(false);
    expect((await self.resolve()).isCrisis).toBe(true);
  });

  it('keeps crisis handling when a step inside the forget check throws', async () => {
    h.breaks = true;
    const turn = turnFor('pipe-breaks', ON);
    expect(await turn.softCheck()).toBe(false);
    expect((await turn.resolve()).isCrisis).toBe(true);
  });

  it('leaves the turn to a live adjudicator, which keeps crisis handling when it escalates', async () => {
    allowCrisisAdjudicatorLiveForTests(true);
    const turn = turnFor('pipe-adjudicated', LIVE_ADJUDICATOR);
    expect(await turn.softCheck()).toBe(false);
    expect((await turn.resolve()).isCrisis).toBe(true);
  });
});
