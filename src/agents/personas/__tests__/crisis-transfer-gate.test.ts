/**
 * The 2026-10-18 prod call, through the live reply gate and the turn pipeline:
 * "Can you pass me to 9?" (STT for Nayan) with a classifier-only crisis read.
 * With CRISIS_TRANSFER_EVERYDAY on, the caller gets the soft check-in (never
 * nothing); off, crisis guidance as in prod. Risky lines keep full crisis
 * guidance. The gate also records which calls really escalated, for the
 * handoff wording (services/safety/crisis-escalations.ts).
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';

import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  crisisEscalatedThisCall,
  crisisRiskThisCall,
  resetCrisisEscalations,
} from '../../../services/safety/crisis-escalations.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_TRANSFER_EVERYDAY: 'on' };
const crisisRead: CrisisGenerateFn = async () => '{"risk":"crisis","subject":"self"}';
const imminentRead: CrisisGenerateFn = async () => '{"risk":"imminent","subject":"self"}';

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Alex.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const userData = (sessionId: string) => ({ services: { sessionId } });

/** What the caller ends up with: the patterns' decision, or the classifier's stronger one. */
async function effective(
  ctx: llm.ChatContext,
  sessionId: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn = crisisRead
): Promise<CrisisGateDecision> {
  const gate = startCrisisGate(ctx, userData(sessionId), { env, generate });
  if (!gate) throw new Error('gate off');
  return (await gate.escalation) ?? gate.decision;
}

const soft = { action: 'guide', guidance: SOFT_CRISIS_CHECK };
/** Crisis guidance, not the soft check-in. */
const full = (d: CrisisGateDecision): boolean =>
  d.action === 'replace' || (d.action === 'guide' && d.guidance !== SOFT_CRISIS_CHECK);

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisEscalations();
});

const PROD = request(
  ['user', 'What do I have today?'],
  ['assistant', 'Two meetings, and a call with Mindy at four. Want me to text her?'],
  ['user', 'Can you pass me to 9?']
);

describe('a transfer request through the crisis gate', () => {
  it('gets the soft check-in, not crisis guidance, with CRISIS_TRANSFER_EVERYDAY on', async () => {
    expect(await effective(PROD, 'prod-on', ON)).toEqual(soft);
    expect(crisisRiskThisCall('prod-on')).toBe(true); // a soft check-in is risk on the call
  });

  it('gets crisis guidance with the flag off, as the prod call did', async () => {
    expect(full(await effective(PROD, 'prod-off', LIVE))).toBe(true);
  });

  it('never softens an imminent read', async () => {
    expect((await effective(PROD, 'imminent', ON, imminentRead)).action).toBe('replace');
  });

  it.each([
    "pass me to someone, I can't do this anymore",
    'transfer me to 9, I took pills',
    'can I talk to Maya, I want to die',
    'pass me to 988',
    'pass me to nine. one one',
  ])('keeps crisis guidance for "%s"', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    expect(full(await effective(ctx, `neg ${line}`, ON))).toBe(true);
  });

  it.each([
    'let me talk to Maya one last time',
    "put Ferni on, I'm done",
    'transfer me to Nayan, I just want to say goodbye to everyone',
  ])('keeps crisis guidance for "%s", which no pattern matches', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    const gate = startCrisisGate(ctx, userData(`guard ${line}`), { env: ON, generate: crisisRead });
    expect(gate?.decision.action).toBe('pass'); // the exemption's own guards are what is tested
    const stronger = await gate?.escalation;
    expect(stronger && full(stronger)).toBe(true);
  });

  it.each([
    "I gave my dog to my sister, she'll take better care of him",
    'I wont be a problem much longer',
  ])(
    'after "%s" (not on the risk list, not read as risk) a transfer gets the soft check-in, never nothing',
    async (earlier) => {
      const ctx = request(
        ['user', earlier],
        ['assistant', 'Oh, okay.'],
        ['user', 'Can you pass me to Maya?']
      );
      expect(await effective(ctx, `earlier ${earlier}`, ON)).toEqual(soft);
    }
  );

  it('after a turn read as risk on the same call, a transfer gets crisis guidance', async () => {
    const said = "I gave my dog to my sister, she'll take better care of him";
    await effective(request(['user', said]), 'read-risk', ON);
    const ctx = request(['user', said], ['assistant', 'Oh, okay.'], ['user', 'Put Maya on.']);
    expect(full(await effective(ctx, 'read-risk', ON))).toBe(true);
  });
});

describe('a transfer request through the turn pipeline (startTurnCrisis)', () => {
  const userTurn = {
    recentTranscripts: ['What do I have today?'],
    lastAgentResponse: 'Want me to text her?',
  };
  const opts = (sessionId: string, env: Record<string, string>) => ({
    sessionId,
    env,
    generate: crisisRead,
  });

  it('gives the soft check-in with the flag on', async () => {
    const turn = startTurnCrisis('Can you pass me to 9?', userTurn, opts('pipe-on', ON));
    expect(await turn.softCheck()).toBe(true);
    expect((await turn.resolve()).isCrisis).toBe(false);
  });

  it('gives crisis handling with the flag off, and for a risky line', async () => {
    const off = startTurnCrisis('Can you pass me to 9?', userTurn, opts('pipe-off', LIVE));
    expect(await off.softCheck()).toBe(false);
    expect((await off.resolve()).isCrisis).toBe(true);
    resetCrisisClassifierCache();
    const risky = startTurnCrisis(
      'let me talk to Maya one last time',
      userTurn,
      opts('pipe-risk', ON)
    );
    expect(await risky.softCheck()).toBe(false);
    expect((await risky.resolve()).isCrisis).toBe(true);
  });
});

describe('which calls really escalated', () => {
  it('a classifier-only crisis guide is not a real escalation (but is risk on the call)', async () => {
    const gate = startCrisisGate(PROD, userData('classifier-only'), {
      env: LIVE,
      generate: crisisRead,
    });
    expect(gate?.decision.action).toBe('pass');
    expect((await gate?.escalation)?.action).toBe('guide');
    expect(crisisEscalatedThisCall('classifier-only')).toBe(false);
    expect(crisisRiskThisCall('classifier-only')).toBe(true);
  });

  it('a pattern match is', async () => {
    const ctx = request(['user', 'I want to kill myself.']);
    expect((await effective(ctx, 'pattern', LIVE)).action).not.toBe('pass');
    expect(crisisEscalatedThisCall('pattern')).toBe(true);
  });

  it('a classifier read the agreement gate let stand is', async () => {
    const ctx = request(
      ['assistant', 'How was the weekend?'],
      ['user', 'It made me feel calm for the first time all week.']
    );
    const env = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' };
    const gate = startCrisisGate(ctx, userData('agreed'), { env, generate: crisisRead });
    expect(gate?.decision.action).toBe('pass'); // no pattern: the classifier's read alone
    expect((await gate?.escalation)?.action).toBe('guide');
    expect(crisisEscalatedThisCall('agreed')).toBe(true);
  });
});
