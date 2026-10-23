/**
 * #2511: the caller's turn after the screen's answer is watched once. A no taken back
 * ("No." … "Actually, yes, I have.") or a yes after the gentle offer gets crisis guidance
 * with 988; an ordinary next turn does not. Through the real reply gate and turn pipeline,
 * with both grounded reads fooled and the classifier reading only the released line.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  GROUNDED_LIGHT_TOUCH,
  GROUNDED_RELEASE_CSSRS_PROMPT,
  resetGroundedRelease,
} from '../../../services/safety/crisis-grounded-release.js';
import {
  SCREEN_GENTLE_OFFER,
  SCREEN_QUESTION,
  screenAnswer,
} from '../../../services/safety/crisis-grounded-screen.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const RELEASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_GROUNDED_RELEASE: 'live',
};
const EVERYDAY = '{"danger":"","about":"the dinner tonight","decision":"everyday"}';
const CSSRS_EVERYDAY =
  '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}';
const OPENER = 'I forgot to invite David to dinner. Remind me next time.';
const REMINDER = "I've set that reminder for tomorrow morning.";
const DINNER = "Tomorrow's a little bit late. Dinner is tonight.";
const ASKED = `Oh, tonight, got it, I'll nudge you this afternoon. ${SCREEN_QUESTION}`;
const GOOD = 'Okay, good. So tonight then.';
const ASKS_TOO = 'Okay, good. Want me to text him now?';
const OFFERED =
  "I'm really glad you're talking with me. If things ever get heavy, you can call or text 988.";

const options = () => ({
  env: RELEASE,
  generate: (async (_prompt, content) =>
    (JSON.parse(content) as { latest: string }).latest === DINNER
      ? '{"risk":"imminent","subject":"self"}'
      : '{"risk":"none","subject":"self"}') as CrisisGenerateFn,
  groundedReads: [0, 1].map(() =>
    vi.fn<CrisisGenerateFn>(async (prompt) =>
      prompt === GROUNDED_RELEASE_CSSRS_PROMPT ? CSSRS_EVERYDAY : EVERYDAY
    )
  ),
});

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
});

function request(turns: Array<[string, string]>, latest: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [caller, ferni] of turns) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  for (const line of latest) ctx.addMessage({ role: 'user', content: line });
  return ctx;
}

async function decide(session: string, ctx: llm.ChatContext): Promise<CrisisGateDecision> {
  const run = startCrisisGate(ctx, { services: { sessionId: session } }, options());
  return (await run?.escalation) ?? run?.decision ?? { action: 'pass' };
}

const gate = (session: string, turns: Array<[string, string]>, latest: string) =>
  decide(session, request(turns, [latest]));

function pipeline(session: string, turns: Array<[string, string]>, latest: string) {
  return startTurnCrisis(
    latest,
    { recentTranscripts: turns.map(([caller]) => caller), lastAgentResponse: turns.at(-1)?.[1] },
    { sessionId: session, ...options() }
  ).summary();
}

const after = (...turns: Array<[string, string]>): Array<[string, string]> => [
  [OPENER, REMINDER],
  [DINNER, ASKED],
  ...turns,
];

/** A call released on the dinner line, its question asked; returns its id. */
async function released(): Promise<string> {
  const session = `next-turn-${++calls}`;
  expect(await gate(session, [[OPENER, REMINDER]], DINNER)).toEqual({
    action: 'guide',
    guidance: GROUNDED_LIGHT_TOUCH,
  });
  return session;
}

/** Crisis guidance with 988: not the gentle offer, not a pass. */
const crisisGuidance = (out: CrisisGateDecision): boolean =>
  out.action === 'guide' && /988/.test(out.guidance) && out.guidance !== SCREEN_GENTLE_OFFER;

describe('the turn after a clear no', () => {
  it('a no taken back gets crisis guidance with 988 on both paths', async () => {
    const session = await released();
    expect(await gate(session, after(), 'No.')).toEqual({ action: 'pass' });
    expect(
      crisisGuidance(await gate(session, after(['No.', GOOD]), 'Actually, yes, I have.'))
    ).toBe(true);

    const other = await released();
    await pipeline(other, after(), 'No.');
    const out = await pipeline(other, after(['No.', GOOD]), 'Actually, yes, I have.');
    expect(out.indicators).toContain('grounded_screen_positive');
  });

  it('a take-back counts even when Ferni asked something of its own', async () => {
    for (const latest of [
      'Actually, yes, I have.',
      'Honestly... sometimes.',
      'No, actually, yeah.',
      'To be honest, kind of.',
      'I lied. I have.',
      "Wait, I wasn't being honest.",
    ]) {
      const session = await released();
      expect(screenAnswer(session, { latest: 'No.', companion: ASKED })).toBe('none');
      expect(screenAnswer(session, { latest, companion: ASKS_TOO }), latest).toBe('positive');
    }
  });

  it('a bare yes counts only when Ferni asked nothing since the answer', async () => {
    for (const [latest, companion, expected] of [
      ['Yeah.', GOOD, 'positive'],
      ['I have.', GOOD, 'positive'],
      ['Sometimes.', GOOD, 'positive'],
      ['Yeah.', ASKS_TOO, 'none'],
      ['Yes please.', ASKS_TOO, 'none'],
      ['Kind of, yeah.', 'Are you hungry yet?', 'none'],
    ] as const) {
      const session = await released();
      expect(screenAnswer(session, { latest: 'No.', companion: ASKED })).toBe('none');
      expect(screenAnswer(session, { latest, companion }), `${latest} / ${companion}`).toBe(
        expected
      );
    }
  });

  it('an ordinary next turn passes', async () => {
    for (const latest of [
      'Pie, obviously.',
      'Seven works.',
      'Okay, thanks!',
      "Sounds good, I'll text him.",
    ]) {
      const session = await released();
      await gate(session, after(), 'No.');
      expect(await gate(session, after(['No.', GOOD]), latest), latest).toEqual({ action: 'pass' });
    }
  });

  it('risk words on the watched turn are positive, whatever Ferni asked', async () => {
    const session = await released();
    expect(screenAnswer(session, { latest: 'No.', companion: ASKED })).toBe('none');
    const latest = "Sure, I just don't want to be here anymore.";
    expect(screenAnswer(session, { latest, companion: ASKS_TOO })).toBe('positive');
  });

  it('only one turn is watched; the screen then closes', async () => {
    const session = await released();
    expect(screenAnswer(session, { latest: 'No.', companion: ASKED })).toBe('none');
    expect(screenAnswer(session, { latest: 'Pie, obviously.', companion: GOOD })).toBe('none');
    expect(screenAnswer(session, { latest: 'Actually, yes.', companion: 'Pie it is.' })).toBe(
      'none'
    );
  });

  it("the watched turn's two paths: the stronger verdict is the shared one", async () => {
    const session = await released();
    expect(screenAnswer(session, { latest: 'No.', companion: ASKED })).toBe('none');
    expect(screenAnswer(session, { latest: 'Okay.', companion: GOOD })).toBe('none');
    // The gate sees the same turn (same Ferni line) with the caller's later words merged in.
    expect(screenAnswer(session, { latest: 'Okay. Actually, yes, I have.', companion: GOOD })).toBe(
      'positive'
    );
    // A positive first path is never weakened by the second.
    const other = await released();
    expect(screenAnswer(other, { latest: 'No.', companion: ASKED })).toBe('none');
    expect(screenAnswer(other, { latest: 'Yeah, I have.', companion: GOOD })).toBe('positive');
    // Same Ferni line, but this path also saw a question of Ferni's: a bare yes alone is none.
    const view = { latest: 'Yeah.', companion: GOOD, ferni: ['Want me to text him?', GOOD] };
    expect(screenAnswer(other, view)).toBe('positive');
  });
});

describe('the turn after the gentle offer', () => {
  it('a yes gets crisis guidance with 988', async () => {
    const session = await released();
    expect(await gate(session, after(), 'Hmm.')).toEqual({
      action: 'guide',
      guidance: SCREEN_GENTLE_OFFER,
    });
    expect(
      crisisGuidance(await gate(session, after(['Hmm.', OFFERED]), 'Yeah, I have been.'))
    ).toBe(true);
  });

  it('a thank-you and moving on passes', async () => {
    const session = await released();
    await gate(session, after(), 'Hmm.');
    expect(await gate(session, after(['Hmm.', OFFERED]), 'Thanks. So, dinner at seven?')).toEqual({
      action: 'pass',
    });
  });
});

describe('an SSML acknowledgement after the question', () => {
  it('the gate skips it as the reply recorder does, so both paths judge one turn', async () => {
    const session = await released();
    // The pipeline's lastAgentResponse skipped the acknowledgement: Ferni's line is the question.
    expect((await pipeline(session, after(), 'No.')).indicators).not.toContain(
      'grounded_screen_positive'
    );
    // The gate sees the acknowledgement and the caller's merged words: the same turn, re-judged.
    const ctx = request(
      [
        [OPENER, REMINDER],
        [DINNER, ASKED],
      ],
      []
    );
    ctx.addMessage({ role: 'assistant', content: '<break time="300ms"/>Mm-hm.' });
    for (const line of ['No.', 'Kind of.']) ctx.addMessage({ role: 'user', content: line });
    expect(crisisGuidance(await decide(session, ctx))).toBe(true);
  });
});
