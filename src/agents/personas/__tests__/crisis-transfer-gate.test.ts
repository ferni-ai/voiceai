/**
 * The 2026-10-18 prod call, through the live reply gate: "Can you pass me to
 * 9?" (STT for Nayan) with a classifier-only crisis read. With
 * CRISIS_TRANSFER_EVERYDAY on, the reply goes out as the model wrote it; off,
 * it is replaced with crisis guidance as in prod. Risky lines still escalate.
 * The gate also records which calls really escalated, for the handoff wording
 * (services/safety/crisis-escalations.ts).
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  crisisEscalatedThisCall,
  resetCrisisEscalations,
} from '../../../services/safety/crisis-escalations.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_TRANSFER_EVERYDAY: 'on' };
const crisisRead: CrisisGenerateFn = async () => '{"risk":"crisis","subject":"self"}';

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
  env: Record<string, string>
): Promise<CrisisGateDecision['action']> {
  const gate = startCrisisGate(ctx, userData(sessionId), { env, generate: crisisRead });
  if (!gate) throw new Error('gate off');
  const stronger = await gate.escalation;
  return (stronger ?? gate.decision).action;
}

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
  it('passes "Can you pass me to 9?" with CRISIS_TRANSFER_EVERYDAY on', async () => {
    expect(await effective(PROD, 'prod-on', ON)).toBe('pass');
  });

  it('gives crisis guidance with the flag off, as the prod call did', async () => {
    expect(await effective(PROD, 'prod-off', LIVE)).toBe('guide');
  });

  it.each([
    "pass me to someone, I can't do this anymore",
    'transfer me to 9, I took pills',
    'can I talk to Maya, I want to die',
    'pass me to 988',
  ])('still escalates "%s"', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    expect(await effective(ctx, `neg ${line}`, ON)).not.toBe('pass');
  });

  it('still escalates a transfer request after an earlier risk turn', async () => {
    const ctx = request(
      ['user', "Honestly I don't see the point of anything anymore."],
      ['assistant', "I'm really glad you told me. I'm here."],
      ['user', 'Can you pass me to Maya?']
    );
    expect(await effective(ctx, 'after-risk', ON)).not.toBe('pass');
  });
});

describe('which calls really escalated', () => {
  it('a classifier-only crisis guide is not a real escalation', async () => {
    const gate = startCrisisGate(PROD, userData('classifier-only'), {
      env: LIVE,
      generate: crisisRead,
    });
    expect(gate?.decision.action).toBe('pass');
    expect((await gate?.escalation)?.action).toBe('guide');
    expect(crisisEscalatedThisCall('classifier-only')).toBe(false);
  });

  it('a pattern match is', async () => {
    const ctx = request(['user', 'I want to kill myself.']);
    expect(await effective(ctx, 'pattern', LIVE)).not.toBe('pass');
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
