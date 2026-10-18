/**
 * The handoff brief carries no crisis wording unless the crisis gate really
 * escalated on the call (HANDOFF_CRISIS_WORDING). Prod 2026-10-18: after a
 * classifier-only crisis read of "Can you pass me to 9?", Alex's handoff
 * summary told Nayan the caller was "earlier in a crisis context".
 *
 * Runs the real handoff tool: it notes the reason for the multi-agent handler
 * (handoff-reasons.ts), which is what the teammate's brief is built from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  noteCrisisEscalation,
  resetCrisisEscalations,
  withoutUnescalatedCrisis,
} from '../../../services/safety/crisis-escalations.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { handoffWords, NEUTRAL_HANDOFF_REASON, takeHandoffReason } from '../handoff-reasons.js';

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<Record<string, unknown>>;
}

const ON = { HANDOFF_CRISIS_WORDING: 'on' };
const SUMMARY = 'Caller asked to be transferred to Nayan, earlier in a crisis context.';

const saved = process.env.HANDOFF_CRISIS_WORDING;
beforeEach(() => resetCrisisEscalations());
afterEach(() => {
  if (saved === undefined) delete process.env.HANDOFF_CRISIS_WORDING;
  else process.env.HANDOFF_CRISIS_WORDING = saved;
});

async function briefReason(sessionId: string): Promise<string | undefined> {
  const { tools } = await buildHandoffTools('alex-chen');
  const name = Object.keys(tools).find((n) => /nayan/i.test(n));
  if (!name) throw new Error(`no Nayan handoff tool in ${Object.keys(tools).join(', ')}`);
  await (tools[name] as HandoffTool).execute(
    { reason: 'The caller asked for Nayan', context_summary: SUMMARY },
    { ctx: { userData: { services: { sessionId } } } }
  );
  return takeHandoffReason(sessionId, 'nayan-patel');
}

describe("the handoff tool's reason for the teammate's brief", () => {
  it('drops the crisis clause when the call never really escalated', async () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    const why = await briefReason('no-escalation');
    expect(why).toBeDefined();
    expect(why).toMatch(/asked for Nayan/);
    expect(why).not.toMatch(/crisis/i);
  }, 30_000);

  it('keeps it when the call really escalated', async () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    noteCrisisEscalation('escalated');
    expect(await briefReason('escalated')).toMatch(/earlier in a crisis context/);
  }, 30_000);

  it('keeps it with the flag off (the prod behaviour)', async () => {
    delete process.env.HANDOFF_CRISIS_WORDING;
    expect(await briefReason('flag-off')).toMatch(/earlier in a crisis context/);
  }, 30_000);
});

describe('withoutUnescalatedCrisis', () => {
  it('drops each clause with crisis wording and keeps the rest', () => {
    expect(withoutUnescalatedCrisis(SUMMARY, 'call', ON)).toBe(
      'Caller asked to be transferred to Nayan'
    );
    expect(
      withoutUnescalatedCrisis('Wants budget help. Seemed at risk; offered 988.', 'call', ON)
    ).toBe('Wants budget help.');
  });

  it('returns nothing when every clause was crisis wording', () => {
    expect(withoutUnescalatedCrisis('Crisis context, gave the 988 line.', 'call', ON)).toBe(
      undefined
    );
  });

  it('leaves wording with no crisis in it, and anything without a call id', () => {
    expect(withoutUnescalatedCrisis('Wants help with the retirement plan.', 'call', ON)).toBe(
      'Wants help with the retirement plan.'
    );
    expect(withoutUnescalatedCrisis(SUMMARY, undefined, ON)).toBe(SUMMARY);
  });

  it('keeps every word after a real escalation on that call only', () => {
    noteCrisisEscalation('real');
    expect(withoutUnescalatedCrisis(SUMMARY, 'real', ON)).toBe(SUMMARY);
    expect(withoutUnescalatedCrisis(SUMMARY, 'other', ON)).not.toMatch(/crisis/);
  });
});

describe('handoffWords', () => {
  it('gives a neutral reason when nothing is left of it', () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    expect(handoffWords('call', 'Crisis support', SUMMARY)).toEqual({
      reason: NEUTRAL_HANDOFF_REASON,
      summary: 'Caller asked to be transferred to Nayan',
    });
  });

  it('changes nothing with the flag off', () => {
    delete process.env.HANDOFF_CRISIS_WORDING;
    expect(handoffWords('call', 'Crisis support', SUMMARY)).toEqual({
      reason: 'Crisis support',
      summary: SUMMARY,
    });
  });
});
