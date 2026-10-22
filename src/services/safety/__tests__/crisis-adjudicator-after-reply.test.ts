/**
 * Always on: the adjudicator never returns "checkin" for a turn that answers a
 * reply which carried crisis guidance, the crisis script or the soft check.
 * The 2026-10-20 replay softened call requests made right after Ferni asked
 * about safety or gave the 988 line. Detected from the call's own record of
 * what the reply gate and the turn pipeline decided, never from words.
 *
 * Synthetic lines, stub models. Live is lifted here (as in
 * crisis-adjudicator.test.ts) so a softened turn is visible as the soft check.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import {
  allowCrisisAdjudicatorLiveForTests,
  resetCrisisAdjudicatorCache,
  startCrisisAdjudicator,
  type AdjudicatorLine,
} from '../crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import { noteCrisisReply, resetCrisisCallRisk } from '../crisis-call-risk.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';

const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const reply =
  (text: string): CrisisGenerateFn =>
  async () =>
    text;
const CRISIS = reply('{"risk":"crisis","subject":"self"}');
const NONE = reply('{"risk":"none","subject":"self"}');
const ENV = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_ADJUDICATOR: 'live',
};

const OPENER = "Hey, it's good to hear from you. What's up tonight?";
const FIRST = "I don't know, everything's just a lot right now.";
const ASKED = 'Are you somewhere safe at the moment?';
const NEXT = 'Could you ring my mother for me?';

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
  resetCrisisCallRisk();
  allowCrisisAdjudicatorLiveForTests(true);
});
afterEach(() => allowCrisisAdjudicatorLiveForTests(false));

function chat(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

/** One reply through the gate; the adjudicator always answers a confident checkin. */
async function gateTurn(ctx: llm.ChatContext, session: string, read: CrisisGenerateFn) {
  const turn = startCrisisGate(
    ctx,
    { services: { sessionId: session } },
    { env: ENV, generate: read, adjudicate: reply(CHECKIN) }
  );
  return turn?.escalation;
}

describe('reply gate', () => {
  const second = chat(['assistant', OPENER], ['user', FIRST], ['assistant', ASKED], ['user', NEXT]);

  it('after a turn that got crisis guidance, a checkin verdict escalates', async () => {
    // The first caller line has no earlier one, so it escalates (no context): 988 guidance.
    const first = await gateTurn(chat(['assistant', OPENER], ['user', FIRST]), 'g1', CRISIS);
    expect(first?.action === 'guide' && first.guidance).not.toBe(SOFT_CRISIS_CHECK);
    const next = await gateTurn(second, 'g1', CRISIS);
    expect(next?.action).toBe('guide');
    expect(next?.action === 'guide' && next.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('after a turn that got the soft check, a checkin verdict escalates', async () => {
    const first = await gateTurn(
      chat(['assistant', OPENER], ['user', 'Long day.'], ['assistant', 'Oof.'], ['user', FIRST]),
      'g2',
      CRISIS
    );
    expect(first).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
    const next = await gateTurn(
      chat(
        ['assistant', OPENER],
        ['user', 'Long day.'],
        ['assistant', 'Oof.'],
        ['user', FIRST],
        ['assistant', ASKED],
        ['user', NEXT]
      ),
      'g2',
      CRISIS
    );
    expect(next?.action === 'guide' && next.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('after a normal turn, the checkin is allowed', async () => {
    expect(await gateTurn(chat(['assistant', OPENER], ['user', FIRST]), 'g3', NONE)).toBeNull();
    expect(await gateTurn(second, 'g3', CRISIS)).toEqual({
      action: 'guide',
      guidance: SOFT_CRISIS_CHECK,
    });
  });
});

describe('turn pipeline', () => {
  const turn = (
    text: string,
    earlier: string[],
    ferni: string,
    session: string,
    read: CrisisGenerateFn
  ) =>
    startTurnCrisis(
      text,
      { recentTranscripts: earlier, lastAgentResponse: ferni },
      { sessionId: session, env: ENV, generate: read, adjudicate: reply(CHECKIN) }
    );

  it('after a turn that got crisis guidance, a checkin verdict escalates', async () => {
    const first = turn(FIRST, [], OPENER, 'p1', CRISIS);
    expect((await first.resolve()).isCrisis).toBe(true);
    expect(await first.softCheck()).toBe(false);
    const next = turn(NEXT, [FIRST], ASKED, 'p1', CRISIS);
    expect(await next.softCheck()).toBe(false);
    expect((await next.resolve()).isCrisis).toBe(true);
  });

  it('after a normal turn, the checkin is allowed', async () => {
    const first = turn(FIRST, [], OPENER, 'p2', NONE);
    expect((await first.resolve()).isCrisis).toBe(false);
    expect(await turn(NEXT, [FIRST], ASKED, 'p2', CRISIS).softCheck()).toBe(true);
  });
});

describe('the adjudicator reads the record, not the words', () => {
  const lines: AdjudicatorLine[] = [
    { speaker: 'caller', text: FIRST },
    { speaker: 'ferni', text: 'Mm, tell me more.' },
    { speaker: 'caller', text: NEXT },
  ];
  const run = (scope: string) =>
    startCrisisAdjudicator(lines, {
      pattern: 'none',
      verdicts: [{ risk: 'crisis', subject: 'self' }],
      env: { CRISIS_ADJUDICATOR: 'live' },
      generate: reply(CHECKIN),
      source: 'pipeline',
      scope,
    })?.result;

  it('the previous turn recorded as a crisis reply: escalate without asking the model', async () => {
    noteCrisisReply('a1', FIRST);
    expect(await run('a1')).toEqual({ decision: 'escalate', why: 'after_crisis_reply' });
  });

  it('same words, nothing recorded on this call: checkin', async () => {
    noteCrisisReply('other-call', FIRST);
    expect(await run('a2')).toEqual({ decision: 'checkin', why: 'model' });
  });

  it('a crisis reply on an older turn, not the previous one, does not block', async () => {
    noteCrisisReply('a3', 'Something from much earlier.');
    expect(await run('a3')).toEqual({ decision: 'checkin', why: 'model' });
  });
});
