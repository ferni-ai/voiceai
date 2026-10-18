/**
 * A handoff's wording keeps everything about the caller's safety
 * (HANDOFF_CRISIS_WORDING, fail closed). Only a bare "in a crisis context",
 * on a known call whose reads ran and found nothing, is dropped. Prod
 * 2026-10-18: Alex's handoff summary told Nayan the caller was "earlier in a
 * crisis context" after a false alarm.
 *
 * Runs the real handoff tool: it notes the reason for the multi-agent handler
 * (handoff-reasons.ts), which is what the teammate's brief is built from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  noteCrisisEscalation,
  noteCrisisRisk,
  recordedCalls,
  resetCrisisEscalations,
  trackCrisisRead,
  withoutUnescalatedCrisis,
} from '../../../services/safety/crisis-escalations.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { handoffWords, NEUTRAL_HANDOFF_REASON, takeHandoffReason } from '../handoff-reasons.js';

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<Record<string, unknown>>;
}

const ON = { HANDOFF_CRISIS_WORDING: 'on' };
const SUMMARY = 'Caller asked to be transferred to Nayan, earlier in a crisis context.';
const clean = (call: string) =>
  trackCrisisRead(call, 'what is on today', Promise.resolve({ risk: 'none' }));

const saved = process.env.HANDOFF_CRISIS_WORDING;
beforeEach(() => resetCrisisEscalations());
afterEach(() => {
  if (saved === undefined) delete process.env.HANDOFF_CRISIS_WORDING;
  else process.env.HANDOFF_CRISIS_WORDING = saved;
});

async function briefReason(sessionId: string, summary = SUMMARY): Promise<string | undefined> {
  const { tools } = await buildHandoffTools('alex-chen');
  const name = Object.keys(tools).find((n) => /nayan/i.test(n));
  if (!name) throw new Error(`no Nayan handoff tool in ${Object.keys(tools).join(', ')}`);
  await (tools[name] as HandoffTool).execute(
    { reason: 'The caller asked for Nayan', context_summary: summary },
    { ctx: { userData: { services: { sessionId } } } }
  );
  return takeHandoffReason(sessionId, 'nayan-patel');
}

describe("the handoff tool's reason for the teammate's brief", () => {
  it('drops a bare "in a crisis context" on a call whose reads found nothing', async () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    await clean('nothing-found');
    const why = await briefReason('nothing-found');
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
    await clean('flag-off');
    expect(await briefReason('flag-off')).toMatch(/earlier in a crisis context/);
  }, 30_000);

  it('keeps a persona-written safety note even on a call with nothing found', async () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    await clean('safety-note');
    const note = 'Mentioned feeling unsafe at home, earlier in a crisis context.';
    expect(await briefReason('safety-note', note)).toMatch(/feeling unsafe at home/);
  }, 30_000);
});

describe('withoutUnescalatedCrisis keeps the wording', () => {
  it('after any risk on the call: an escalation, a risky read, a soft check-in', async () => {
    noteCrisisEscalation('escalated');
    expect(withoutUnescalatedCrisis(SUMMARY, 'escalated', ON)).toBe(SUMMARY);
    await trackCrisisRead('risky', 'hm', Promise.resolve({ risk: 'crisis' }));
    expect(withoutUnescalatedCrisis(SUMMARY, 'risky', ON)).toBe(SUMMARY);
    await clean('soft');
    noteCrisisRisk('soft'); // the gate and the pipeline note every soft check-in
    expect(withoutUnescalatedCrisis(SUMMARY, 'soft', ON)).toBe(SUMMARY);
  });

  it('while a read is pending, or after one timed out', async () => {
    await clean('pending');
    void trackCrisisRead('pending', 'hm', new Promise<{ risk: string }>(() => undefined));
    expect(withoutUnescalatedCrisis(SUMMARY, 'pending', ON)).toBe(SUMMARY);
    await trackCrisisRead('timed-out', 'hm', Promise.resolve(null));
    expect(withoutUnescalatedCrisis(SUMMARY, 'timed-out', ON)).toBe(SUMMARY);
  });

  it('with no session id (the roundtable path), or no reads finished on the call', () => {
    expect(withoutUnescalatedCrisis(SUMMARY, undefined, ON)).toBe(SUMMARY);
    expect(withoutUnescalatedCrisis(SUMMARY, 'never-read', ON)).toBe(SUMMARY);
  });

  it.each([
    'Mentioned feeling unsafe at home.',
    'Earlier mentioned self-harm thoughts.',
    'In a crisis context, said they are at risk tonight.',
    'Was in crisis; in distress about the move.',
    'In crisis, worried about safety.',
    'In a crisis context: someone hurt them.',
    'In crisis over abuse at home.',
    'Told them they are not alone, in a crisis context.',
  ])('for "%s", which names something specific', async (text) => {
    await clean('specific');
    expect(withoutUnescalatedCrisis(text, 'specific', ON)).toBe(text);
  });
});

describe('withoutUnescalatedCrisis drops only the bare classifier wording', () => {
  it('drops each clause that says no more than "in a crisis context"', async () => {
    await clean('call');
    expect(withoutUnescalatedCrisis(SUMMARY, 'call', ON)).toBe(
      'Caller asked to be transferred to Nayan'
    );
    expect(withoutUnescalatedCrisis('Wants budget help. Was in a crisis state.', 'call', ON)).toBe(
      'Wants budget help.'
    );
  });

  it('returns nothing when that was all of it', async () => {
    await clean('call');
    expect(withoutUnescalatedCrisis('In a crisis context.', 'call', ON)).toBe(undefined);
  });

  it('leaves text without that wording', async () => {
    await clean('call');
    const text = 'Wants help with the retirement plan.';
    expect(withoutUnescalatedCrisis(text, 'call', ON)).toBe(text);
  });
});

describe('handoffWords', () => {
  it('gives a neutral reason when nothing is left of it', async () => {
    process.env.HANDOFF_CRISIS_WORDING = 'on';
    await clean('call');
    expect(handoffWords('call', 'In a crisis context', SUMMARY)).toEqual({
      reason: NEUTRAL_HANDOFF_REASON,
      summary: 'Caller asked to be transferred to Nayan',
    });
  });

  it('changes nothing with the flag off', async () => {
    delete process.env.HANDOFF_CRISIS_WORDING;
    await clean('call');
    expect(handoffWords('call', 'In a crisis context', SUMMARY)).toEqual({
      reason: 'In a crisis context',
      summary: SUMMARY,
    });
  });
});

describe('the per-call record', () => {
  it('never drops a call with risk while it is younger than 6 hours; risk-free calls go first', async () => {
    noteCrisisRisk('risky-first');
    for (let i = 0; i < 600; i++) await clean(`clean ${i}`);
    expect(withoutUnescalatedCrisis(SUMMARY, 'risky-first', ON)).toBe(SUMMARY);
    expect(recordedCalls()).toBeLessThanOrEqual(512);
  });

  it('moves a call it touches to the back, so it outlives older untouched calls', async () => {
    await clean('touched');
    for (let i = 0; i < 300; i++) await clean(`old ${i}`);
    await clean('touched'); // touched again: now the most recent
    for (let i = 0; i < 300; i++) await clean(`new ${i}`);
    expect(withoutUnescalatedCrisis(SUMMARY, 'touched', ON)).not.toMatch(/crisis/); // still known
    expect(withoutUnescalatedCrisis(SUMMARY, 'old 0', ON)).toBe(SUMMARY); // dropped: unknown, kept
  });

  it('forgets a call after 6 hours', () => {
    const start = 1_000_000;
    noteCrisisRisk('expired', start);
    expect(withoutUnescalatedCrisis(SUMMARY, 'expired', ON, start + 6 * 60 * 60 * 1000 + 1)).toBe(
      SUMMARY // unknown again: kept, fail closed
    );
  });
});
