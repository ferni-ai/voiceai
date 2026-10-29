/**
 * THIRD_PARTY_SELF_HARM at the reply's crisis gate (issue #2635): live reroutes
 * a third-party read, even when the patterns already chose "988 for them";
 * off and shadow leave the gate exactly as on main.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { BEREAVED_GUIDANCE } from '../../../services/safety/crisis-who-guidance.js';
import { WHO_PROMPT, resetWhoReads, type WhoKind } from '../../../services/safety/crisis-who.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

const generate =
  (verdict: string, who: WhoKind): CrisisGenerateFn =>
  async (system) =>
    system === WHO_PROMPT ? JSON.stringify({ who }) : verdict;

const THIRD = '{"risk":"crisis","subject":"third_party"}';
const SELF = '{"risk":"crisis","subject":"self"}';

async function gate(text: string, verdict: string, who: WhoKind, mode?: string) {
  resetCrisisClassifierCache();
  resetWhoReads();
  const env = { ...LIVE, ...(mode ? { THIRD_PARTY_SELF_HARM: mode } : {}) };
  const turn = startCrisisGate(request(text), undefined, { env, generate: generate(verdict, who) });
  return { decision: turn!.decision, escalation: await turn!.escalation };
}

const guidance = (d: CrisisGateDecision | null): string =>
  d?.action === 'guide' ? d.guidance : `<${d?.action ?? 'none'}>`;

beforeEach(() => resetWhoReads());

describe('THIRD_PARTY_SELF_HARM at the crisis gate', () => {
  it("live: own imminent risk beside a third-party clause speaks main's self-imminent script", async () => {
    // The patterns miss it in every CRISIS_MEANS_IN_HAND mode, so the who-read decides (#2717).
    const text =
      "i'm holding the pills and i'm going to swallow them and he said he'd kill himself";
    const main = await gate(text, '{"risk":"imminent","subject":"self"}', 'none');
    expect(main.escalation?.action).toBe('replace');
    const flipped = '{"risk":"imminent","subject":"third_party"}';
    expect((await gate(text, flipped, 'self')).escalation?.action).not.toBe('replace');
    expect((await gate(text, flipped, 'self', 'live')).escalation).toEqual(main.escalation);
  });

  const bereaved = "my brother wants to kill himself and now he's gone";

  it('off and shadow: the patterns\' "988 for them" stands, as on main', async () => {
    const main = await gate(bereaved, THIRD, 'bereaved');
    expect(guidance(main.decision)).toMatch(/on the person's behalf/);
    expect(main.escalation).toBeNull();
    expect(await gate(bereaved, THIRD, 'bereaved', 'off')).toEqual(main);
    expect(await gate(bereaved, THIRD, 'bereaved', 'shadow')).toEqual(main);
  });

  it('live: a bereaved caller hears grief guidance instead', async () => {
    const live = await gate(bereaved, THIRD, 'bereaved', 'live');
    expect(guidance(live.escalation)).toBe(BEREAVED_GUIDANCE);
  });

  it('live: a who read of third_party or none changes nothing', async () => {
    const main = await gate(bereaved, THIRD, 'third_party');
    expect(await gate(bereaved, THIRD, 'third_party', 'live')).toEqual(main);
    expect(await gate(bereaved, THIRD, 'none', 'live')).toEqual(main);
  });

  it("live: the caller's own risk beside a third-party clause puts the caller first", async () => {
    const text = "he said he'd kill himself and i bought a gun to end it";
    const main = await gate(text, THIRD, 'self');
    expect(guidance(main.escalation)).toMatch(/on the person's behalf/);
    const live = await gate(text, THIRD, 'self', 'live');
    expect(guidance(live.escalation)).toMatch(/988[\s\S]*for the user themselves/);
    expect(guidance(live.escalation)).toMatch(/on their behalf/);
  });

  it("live: the classifier's self read replaces the patterns' third-party guidance", async () => {
    const main = await gate(bereaved, SELF, 'none');
    expect(main.escalation).toBeNull();
    expect(await gate(bereaved, SELF, 'none', 'shadow')).toEqual(main);
    const live = await gate(bereaved, SELF, 'none', 'live');
    expect(guidance(live.escalation)).toMatch(/Acknowledge their pain/);
  });
});
