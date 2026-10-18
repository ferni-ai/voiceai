/**
 * The crisis adjudicator as production runs it: live held back (this file
 * never lifts it), shadow off the escalation path (it may never delay the 988
 * line), and shared runs kept within one call. Synthetic lines, stub models.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import {
  resetCrisisAdjudicatorCache,
  resolveCrisisAdjudicatorMode,
  startCrisisAdjudicator,
  type AdjudicatorLine,
} from '../crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';

const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const CLASSIFIER_CRISIS = '{"risk":"crisis","subject":"self"}';
const LIVE_CLASSIFIER = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const reply =
  (text: string): CrisisGenerateFn =>
  async () =>
    text;
/** A model call that answers after `ms` (fake timers). */
const slow =
  (text: string, ms: number): CrisisGenerateFn =>
  () =>
    new Promise<string>((resolve) => {
      setTimeout(() => resolve(text), ms);
    });

function call(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}
const MOM_CALL = call(
  ['assistant', 'Hey! What can I do for you?'],
  ['user', 'Can you call my mom for me?'],
  ['assistant', "Sure, I don't have her number yet."],
  ['user', 'Can I give you her number?']
);
const LINES: AdjudicatorLine[] = [
  { speaker: 'ferni', text: 'Hey! What can I do for you?' },
  { speaker: 'caller', text: 'Can you call my mom for me?' },
  { speaker: 'ferni', text: "Sure, I don't have her number yet." },
  { speaker: 'caller', text: 'Can I give you her number?' },
];

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
});

describe('production default: live is held back', () => {
  it('CRISIS_ADJUDICATOR=live resolves to shadow without the test override', () => {
    expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'live' })).toBe('shadow');
  });

  it('live + a confident checkin still gets crisis guidance, not the soft check', async () => {
    const turn = startCrisisGate(
      MOM_CALL,
      { services: { sessionId: 'call-held' } },
      {
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live' },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: reply(CHECKIN),
      }
    );
    const escalation = await turn?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('the turn pipeline keeps the crisis reading too', async () => {
    const t = startTurnCrisis(
      'Can I give you her number?',
      {
        recentTranscripts: ['Can you call my mom for me?'],
        lastAgentResponse: "Sure, I don't have her number yet.",
      },
      {
        sessionId: 'call-held-2',
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live' },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: reply(CHECKIN),
      }
    );
    expect(await t.softCheck()).toBe(false);
    expect((await t.resolve()).isCrisis).toBe(true);
  });
});

/** Whether a promise has settled after the timers advance by `ms`. */
async function settledAfter(
  promise: Promise<unknown> | null | undefined,
  ms: number
): Promise<boolean> {
  let settled = false;
  void promise?.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(ms);
  return settled;
}

describe('shadow never delays the escalation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Another read of the same caller words, in the same call, still in flight:
  // whatever waits for the turn's reads waits ~900 ms for it.
  const slowOtherRead = (sessionId: string, env: Record<string, string> = {}): void => {
    startTurnCrisis(
      'Can I give you her number?',
      { lastAgentResponse: 'other line' },
      { sessionId, env: { ...LIVE_CLASSIFIER, ...env }, generate: slow(CLASSIFIER_CRISIS, 900) }
    );
  };
  const gate = (env: Record<string, string>, sessionId: string) =>
    startCrisisGate(
      MOM_CALL,
      { services: { sessionId } },
      {
        env: { ...LIVE_CLASSIFIER, ...env },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: slow(CHECKIN, 300),
      }
    );

  it('reply gate: shadow escalates as soon as the flags-off gate does', async () => {
    slowOtherRead('call-t1');
    const off = gate({}, 'call-t1');
    expect(await settledAfter(off?.escalation, 0)).toBe(true);

    resetCrisisClassifierCache();
    resetCrisisAdjudicatorCache();
    slowOtherRead('call-t2', { CRISIS_ADJUDICATOR: 'shadow' });
    const shadow = gate({ CRISIS_ADJUDICATOR: 'shadow' }, 'call-t2');
    expect(await settledAfter(shadow?.escalation, 0)).toBe(true);
    expect(await shadow?.escalation).toEqual(await off?.escalation);
  });

  it('reply gate: the agreement gate does wait for the reads (the test can see a delay)', async () => {
    slowOtherRead('call-t3', { CRISIS_AGREEMENT_GATE: 'on' });
    const held = gate({ CRISIS_AGREEMENT_GATE: 'on' }, 'call-t3');
    expect(await settledAfter(held?.escalation, 0)).toBe(false);
    expect(await settledAfter(held?.escalation, 1000)).toBe(true);
  });

  it('turn pipeline: shadow resolves as soon as flags-off does', async () => {
    const pipeline = (env: Record<string, string>, sessionId: string) =>
      startTurnCrisis(
        'Can I give you her number?',
        {
          recentTranscripts: ['Can you call my mom for me?'],
          lastAgentResponse: "Sure, I don't have her number yet.",
        },
        {
          sessionId,
          env: { ...LIVE_CLASSIFIER, ...env },
          generate: reply(CLASSIFIER_CRISIS),
          adjudicate: slow(CHECKIN, 300),
        }
      );
    // The reply gate's read of the same words, still in flight.
    const slowGateRead = (sessionId: string, env: Record<string, string> = {}): void => {
      startCrisisGate(
        call(
          ['user', 'Can you call my mom for me?'],
          ['assistant', 'On it.'],
          ['user', 'Can I give you her number?']
        ),
        { services: { sessionId } },
        { env: { ...LIVE_CLASSIFIER, ...env }, generate: slow(CLASSIFIER_CRISIS, 900) }
      );
    };

    slowGateRead('call-t4');
    const off = pipeline({}, 'call-t4');
    expect(await settledAfter(off.resolve(), 0)).toBe(true);

    resetCrisisClassifierCache();
    resetCrisisAdjudicatorCache();
    slowGateRead('call-t5', { CRISIS_ADJUDICATOR: 'shadow' });
    const shadow = pipeline({ CRISIS_ADJUDICATOR: 'shadow' }, 'call-t5');
    expect(await settledAfter(shadow.resolve(), 0)).toBe(true);
    expect((await shadow.resolve()).isCrisis).toBe(true);
    expect(await shadow.softCheck()).toBe(false);

    // Control: the agreement gate does wait for the reads, so a delay would show.
    resetCrisisClassifierCache();
    slowGateRead('call-t6', { CRISIS_AGREEMENT_GATE: 'on' });
    const held = pipeline({ CRISIS_AGREEMENT_GATE: 'on' }, 'call-t6');
    expect(await settledAfter(held.resolve(), 0)).toBe(false);
    expect(await settledAfter(held.resolve(), 1000)).toBe(true);
  });
});

describe('agreement gate + shadow waits no longer than the agreement gate alone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The other read lands at 900 ms; a shadow adjudicator that held the turn
  // would add its own 300 ms on top. Both settle-by checks are at 950 ms.
  const AGREE = { CRISIS_AGREEMENT_GATE: 'on' };
  const AGREE_SHADOW = { ...AGREE, CRISIS_ADJUDICATOR: 'shadow' };
  const reset = (): void => {
    resetCrisisClassifierCache();
    resetCrisisAdjudicatorCache();
  };

  it('reply gate', async () => {
    const otherRead = (sessionId: string, env: Record<string, string>): void => {
      startTurnCrisis(
        'Can I give you her number?',
        { lastAgentResponse: 'other line' },
        { sessionId, env: { ...LIVE_CLASSIFIER, ...env }, generate: slow(CLASSIFIER_CRISIS, 900) }
      );
    };
    const gate = (env: Record<string, string>, sessionId: string, adjudicate: CrisisGenerateFn) =>
      startCrisisGate(
        MOM_CALL,
        { services: { sessionId } },
        { env: { ...LIVE_CLASSIFIER, ...env }, generate: reply(CLASSIFIER_CRISIS), adjudicate }
      );

    otherRead('call-a1', AGREE);
    const alone = gate(AGREE, 'call-a1', slow(CHECKIN, 300));
    expect(await settledAfter(alone?.escalation, 0)).toBe(false);
    expect(await settledAfter(alone?.escalation, 950)).toBe(true);

    reset();
    const adjudicate = vi.fn(slow(CHECKIN, 300));
    otherRead('call-a2', AGREE_SHADOW);
    const shadow = gate(AGREE_SHADOW, 'call-a2', adjudicate);
    expect(await settledAfter(shadow?.escalation, 0)).toBe(false);
    expect(await settledAfter(shadow?.escalation, 950)).toBe(true);
    // The shadow adjudicator did run, and the reply is the agreement gate's alone.
    expect(adjudicate).toHaveBeenCalledTimes(1);
    expect(await shadow?.escalation).toEqual(await alone?.escalation);
  });

  it('turn pipeline', async () => {
    const otherRead = (sessionId: string, env: Record<string, string>): void => {
      startCrisisGate(
        call(
          ['user', 'Can you call my mom for me?'],
          ['assistant', 'On it.'],
          ['user', 'Can I give you her number?']
        ),
        { services: { sessionId } },
        { env: { ...LIVE_CLASSIFIER, ...env }, generate: slow(CLASSIFIER_CRISIS, 900) }
      );
    };
    const pipeline = (
      env: Record<string, string>,
      sessionId: string,
      adjudicate: CrisisGenerateFn
    ) =>
      startTurnCrisis(
        'Can I give you her number?',
        {
          recentTranscripts: ['Can you call my mom for me?'],
          lastAgentResponse: "Sure, I don't have her number yet.",
        },
        {
          sessionId,
          env: { ...LIVE_CLASSIFIER, ...env },
          generate: reply(CLASSIFIER_CRISIS),
          adjudicate,
        }
      );

    otherRead('call-a3', AGREE);
    const alone = pipeline(AGREE, 'call-a3', slow(CHECKIN, 300));
    expect(await settledAfter(alone.resolve(), 0)).toBe(false);
    expect(await settledAfter(alone.resolve(), 950)).toBe(true);

    reset();
    const adjudicate = vi.fn(slow(CHECKIN, 300));
    otherRead('call-a4', AGREE_SHADOW);
    const shadow = pipeline(AGREE_SHADOW, 'call-a4', adjudicate);
    expect(await settledAfter(shadow.resolve(), 0)).toBe(false);
    expect(await settledAfter(shadow.resolve(), 950)).toBe(true);
    expect(adjudicate).toHaveBeenCalledTimes(1);
    expect((await shadow.resolve()).isCrisis).toBe((await alone.resolve()).isCrisis);
    expect(await shadow.softCheck()).toBe(await alone.softCheck());
  });
});

describe('shared runs stay within one call', () => {
  it('the same lines in two calls are two model calls', async () => {
    const generate = vi.fn(reply(CHECKIN));
    const options = {
      pattern: 'none' as const,
      verdicts: [{ risk: 'crisis' as const, subject: 'self' as const }],
      env: { CRISIS_ADJUDICATOR: 'shadow' },
      generate,
      source: 'gate' as const,
    };
    await startCrisisAdjudicator(LINES, { ...options, scope: 'call-a' })?.result;
    await startCrisisAdjudicator(LINES, { ...options, scope: 'call-a' })?.result;
    await startCrisisAdjudicator(LINES, { ...options, scope: 'call-b' })?.result;
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
