/**
 * SELF_SHARE_STAYS=on (#3475): asked about himself, Ferni ends on his own
 * thing instead of handing the question straight back, and asked again he
 * stays on himself with one more real thing. Asserted on the request the model
 * is asked with, through the live reply path (crisis-gate.ts -> turn-request.ts
 * -> turn-notes-guarded.ts -> self-share-stays.ts -> ferni-state.ts). Flag off,
 * the turn is ferni-state's, untouched. All caller lines are fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { LOW_MOOD_SELF } from '../ferni-self-share.js';
import { ferniStateTurn, TASK_LINE } from '../ferni-state.js';
import { ASKED_NO_DETAIL, resetRecentDetails } from '../self-share-asked.js';
import { ferniStateStays } from '../self-share-stays.js';
import { QUESTION_LINE, turnShapeFor } from '../turn-shape.js';
import { regexSignals } from '../turn-extras.js';

const NOON = new Date('2026-10-11T18:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const STATE_ON = { FERNI_STATE: 'on', SELF_SHARE_STAYS: 'on' };
const OFF = { SELF_SHARE_STAYS: 'off' };
/** ferni-state.ts's own wording: the hand-back on an asked turn, and the swing after his share. */
const TURN_BACK = ', then ask them something about theirs.';
const SWING = 'Your last reply was about you: this one is about them, their day or their world.';
/** What they become with the flag on (self-share-stays.ts). */
const STAYS_END = ', said plainly, and leave it there, no question back this time.';
const STAYS_AGAIN = 'They are still asking about you: stay on yourself a moment.';
const STAYS_NO_DETAIL = 'give one real, small thing from your life as you know it';

let n = 0;
function newCall() {
  const sessionId = `stays-${++n}`;
  return {
    sessionId,
    session: {
      userData: {
        personaId: 'ferni',
        services: { sessionId, sessionStartTime: Date.now() - 120_000 },
      },
    },
  };
}

/** Caller and Ferni lines alternating, starting and ending with the caller. */
function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}

async function askedWith(ctx: llm.ChatContext, session: object): Promise<string> {
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    const last = c.items[c.items.length - 1] as { textContent?: string };
    asked = last.textContent ?? '';
    return new ReadableStream({ start: (s) => s.close() });
  });
  await gatedReply(ctx, session as never, model as never, { wrap: (s: unknown) => s } as never, {
    env: PATTERNS_ONLY,
  });
  return asked;
}

const OPENING = ['Hey.', 'Hey, good to hear you.', 'Long day, not much going on.', 'Ha, fair.'];
/** His answer about his day: a share of his own with no question in it. */
const HIS_SHARE = 'I was up around five checking the weather, and I am not even going anywhere.';
/** The issue's caller, line by line, with his answers in between. */
const ASKED = [...OPENING, 'Enough about me. What did you do today?'];
const SPECIFIC = [...ASKED, HIS_SHARE, 'No, something specific.'];
const BUGGING = [
  ...SPECIFIC,
  'Okay, honestly, I keep checking it because I miss having somewhere to be.',
  "What's been bugging you lately, and don't say nothing.",
];

/**
 * SELF_SHARE_WHEN_ASKED on: ten day details, each once a call, so ask until none is left.
 * `reply` is his answer each time; the turn returned is the first ask with no detail.
 */
function spentAsk(reply: string, flags: Record<string, string> = {}) {
  const env = { ...STATE_ON, SELF_SHARE_WHEN_ASKED: 'on', ...flags };
  const { session } = newCall();
  const lines = [...OPENING];
  for (let i = 0; i < 12; i++) {
    const turn = ferniStateStays(callOf(...lines, `What did you do today, part ${i}?`), session, {
      env,
    });
    if (!/answer from your day/.test(turn.last)) return turn;
    lines.push(`What did you do today, part ${i}?`, reply);
  }
  throw new Error('the details never ran out');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.FERNI_STATE = 'on';
  resetRecentDetails();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
  delete process.env.SELF_SHARE_STAYS;
  delete process.env.SELF_SHARE_WHEN_ASKED;
});

describe('the lines it rewrites are the ones ferni-state writes', () => {
  it('an asked turn ends with the hand-back, and the turn after his share swings to them', () => {
    const env = { FERNI_STATE: 'on' };
    const asked = ferniStateTurn(callOf(...ASKED), newCall().session, { env });
    expect(asked.last).toContain(TURN_BACK);
    const after = ferniStateTurn(callOf(...SPECIFIC), newCall().session, { env });
    expect(after.last.startsWith(`[${SWING}]`)).toBe(true);
    expect(ASKED_NO_DETAIL.endsWith(TURN_BACK)).toBe(true);
  });
});

describe('SELF_SHARE_STAYS=on', () => {
  beforeEach(() => {
    process.env.SELF_SHARE_STAYS = 'on';
  });

  it('asked what he did today: his day detail, ending on his thing, no question back', async () => {
    const asked = await askedWith(callOf(...ASKED), newCall().session);
    expect(asked).toContain('They asked about you: answer from your day');
    expect(asked).toContain(STAYS_END);
    expect(asked).not.toContain(TURN_BACK);
    expect(asked).toContain(QUESTION_LINE.none);
    expect(asked).not.toContain(QUESTION_LINE.noneUnlessOwn);
    expect(asked).not.toContain(QUESTION_LINE.allowed);
  });

  it('"no, something specific" after his share: one more real thing, not a swing to them', async () => {
    const asked = await askedWith(callOf(...SPECIFIC), newCall().session);
    expect(asked).toContain(STAYS_AGAIN);
    expect(asked).toContain('You\'ve said: "I was up around five checking the weather');
    expect(asked).not.toContain(SWING);
    expect(asked).toContain(QUESTION_LINE.none);
  });

  it('"what\'s been bugging you lately, and don\'t say nothing": still on him', async () => {
    const asked = await askedWith(callOf(...BUGGING), newCall().session);
    expect(asked).toContain(STAYS_AGAIN);
    expect(asked).not.toContain(SWING);
  });

  it('with SELF_SHARE_WHEN_ASKED on too, an asked turn still ends on his thing', async () => {
    process.env.SELF_SHARE_WHEN_ASKED = 'on';
    const asked = await askedWith(callOf(...ASKED), newCall().session);
    expect(asked).toContain(STAYS_END);
    expect(asked).not.toContain(TURN_BACK);
  });

  it('the caller telling something of their own after his share: the swing to them stays', async () => {
    const asked = await askedWith(
      callOf(
        ...ASKED,
        HIS_SHARE,
        'Ha. We went to the farmers market and came home with way too many peaches.'
      ),
      newCall().session
    );
    expect(asked).toContain(SWING);
    expect(asked).not.toContain(STAYS_AGAIN);
  });

  it('a push with no ask about him before it: the swing to them stays', async () => {
    const asked = await askedWith(
      callOf(...OPENING, 'Yeah, quiet one.', HIS_SHARE, 'Really?'),
      newCall().session
    );
    expect(asked).toContain(SWING);
    expect(asked).not.toContain(STAYS_AGAIN);
  });

  it('"Yes. How are you?" right after a question of his: the hand-back stays', async () => {
    const asked = await askedWith(
      callOf(...OPENING, 'Hm.', 'Are you doing okay tonight?', 'Yes. How are you?'),
      newCall().session
    );
    expect(asked).toContain(TURN_BACK);
    expect(asked).not.toContain(STAYS_END);
  });

  it('after a crisis line on the call, his state says nothing, and nothing is added', async () => {
    const { session } = newCall();
    await askedWith(callOf('I want to kill myself.'), session);
    const asked = await askedWith(
      callOf('I want to kill myself.', 'I am here with you.', 'What did you do today?'),
      session
    );
    expect(asked).not.toContain(STAYS_END);
    expect(asked).not.toContain(STAYS_AGAIN);
  });

  it('a task turn after his share keeps the task line', () => {
    const ctx = callOf(...ASKED, HIS_SHARE, 'Can you set a reminder for me at six?');
    const turn = ferniStateStays(ctx, newCall().session, { env: STATE_ON });
    expect(turn.last).toContain(TASK_LINE);
    expect(turn.stays).toBeUndefined();
  });

  it('his last reply sounded flat: the correction stays, nothing rewritten', () => {
    const flat = 'Honestly, it all feels like a chore, too much effort.';
    const ctx = callOf(...ASKED, flat, 'What did you do after that?');
    const turn = ferniStateStays(ctx, newCall().session, { env: STATE_ON });
    expect(turn.last).toContain('You sounded flat');
    expect(turn.stays).toBeUndefined();
  });

  it('asked with the call\'s details spent: "doing well" becomes one more real thing', () => {
    const turn = spentAsk(HIS_SHARE);
    expect(turn.stays).toBe('no_detail');
    expect(turn.last).toContain(STAYS_AGAIN);
    expect(turn.last).not.toContain(ASKED_NO_DETAIL);
    expect(turn.brief).toBe(true);
  });

  it('details spent and nothing of his told yet: a thing from his life, not a new day story', () => {
    const turn = spentAsk('Ha, fair enough.');
    expect(turn.stays).toBe('no_detail');
    expect(turn.last).toContain(STAYS_NO_DETAIL);
    expect(turn.last).not.toContain(ASKED_NO_DETAIL);
  });

  it('flag off, the same spent ask keeps "say you\'re doing well"', () => {
    expect(spentAsk(HIS_SHARE, OFF).last).toContain(ASKED_NO_DETAIL);
  });
});

describe('the eval scenario, turn by turn (scripts/voice-eval/scenarios/self-share-stays.txt)', () => {
  const SCENE = [
    "Hey Ferni, it's me again.",
    'Hey, good to hear from you. How has your week been?',
    'Good, good. Okay, enough about me.',
    'Ha, alright.',
    'What did you do today?',
    HIS_SHARE,
    'No, something specific.',
    'Okay, honestly, I keep checking it because I miss having somewhere to be.',
    "What's been bugging you lately, and don't say nothing.",
    'The real answer is I keep looking at flights and never booking one.',
    "Ha, okay, that's fair. I'm going to make some dinner soon, I think pasta.",
  ];
  /** The request for each caller line, with the scene so far, on one call. */
  async function scene(): Promise<string[]> {
    const { session } = newCall();
    const out: string[] = [];
    for (let i = 0; i < SCENE.length; i += 2)
      out.push(await askedWith(callOf(...SCENE.slice(0, i + 1)), session));
    return out;
  }

  it('on: the three asks about him stay on him, the normal turn goes back to them', async () => {
    process.env.SELF_SHARE_STAYS = 'on';
    const [, , today, specific, bugging, dinner] = await scene();
    expect(today).toContain(STAYS_END);
    expect(specific).toContain(STAYS_AGAIN);
    expect(bugging).toContain(STAYS_AGAIN);
    for (const asked of [today, specific, bugging]) expect(asked).not.toContain(TURN_BACK);
    expect(dinner).toContain(SWING);
    expect(dinner).not.toContain(STAYS_AGAIN);
  });

  it('off: the hand-back and the swing, as before', async () => {
    const [, , today, specific, bugging] = await scene();
    expect(today).toContain(TURN_BACK);
    expect(specific).toContain(SWING);
    expect(bugging).toContain(SWING);
  });
});

describe('SELF_SHARE_STAYS off (default): ferni-state untouched', () => {
  const CALLS = [ASKED, SPECIFIC, BUGGING, [...ASKED, HIS_SHARE, 'Really?']];

  it('through the wrapper, every line equals ferni-state on its own', () => {
    for (const lines of CALLS) {
      const a = newCall();
      const b = { session: { userData: { ...a.session.userData } } };
      const env = { FERNI_STATE: 'on', ...OFF };
      const wrapped = ferniStateStays(callOf(...lines), a.session, { env });
      expect(wrapped.last).not.toBe('');
      expect(wrapped).toEqual(ferniStateTurn(callOf(...lines), b.session, { env }));
    }
  });

  it('on the live path the hand-back and the swing are as before', async () => {
    expect(await askedWith(callOf(...ASKED), newCall().session)).toContain(TURN_BACK);
    expect(await askedWith(callOf(...SPECIFIC), newCall().session)).toContain(SWING);
  });
});

describe('the shape line with selfStays', () => {
  it('no "then ask them one", and no question allowance, even on a draw that allows one', () => {
    const said = 'What did you do today?';
    const sig = { ...regexSignals(said, 'about_ferni'), ownStory: true };
    const allow = () => 0.1; // every draw under 0.25: the question allowance would fire
    const before = turnShapeFor(said, allow, 'model', sig);
    const after = turnShapeFor(said, allow, 'model', { ...sig, selfStays: true });
    expect(before.extras).toContain('curious_question');
    expect(after.extras).not.toContain('curious_question');
    expect(after.reminder).toContain(QUESTION_LINE.none);
    expect(after.reminder).not.toMatch(/You may ask one question/);
    const never = () => 0.9;
    expect(turnShapeFor(said, never, 'dice', sig).reminder).toContain(QUESTION_LINE.noneUnlessOwn);
    expect(turnShapeFor(said, never, 'dice', { ...sig, selfStays: true }).reminder).not.toContain(
      QUESTION_LINE.noneUnlessOwn
    );
  });
});

describe('what reads as still asking about him, after his answer', () => {
  const stays = (said: string) =>
    ferniStateStays(callOf(...ASKED, HIS_SHARE, said), newCall().session, { env: STATE_ON }).stays;

  it.each([
    'No, something specific.',
    "What's been bugging you lately, and don't say nothing.",
    'Okay. And is that a normal day for you?',
    'Come on, what else?',
  ])('"%s" stays on him', (said) => expect(stays(said)).toBe('again'));

  it.each([
    'Enough about me.',
    'My commute was awful today.',
    'Okay.',
    'We went to the lake, you would have loved it.',
    'So the thing is, the whole team keeps asking about the launch, it never stops, honestly.',
  ])('"%s" does not', (said) => expect(stays(said)).toBeUndefined());
});

describe('voice text rules', () => {
  it('no em dashes, ellipses or low-mood wording in any rewritten line', () => {
    process.env.SELF_SHARE_STAYS = 'on';
    const lines = [
      ferniStateStays(callOf(...ASKED), newCall().session, { env: STATE_ON }),
      ferniStateStays(callOf(...SPECIFIC), newCall().session, { env: STATE_ON }),
      spentAsk(HIS_SHARE),
      spentAsk('Ha, fair enough.'),
    ];
    expect(lines.map((t) => t.stays)).toEqual(['asked', 'again', 'no_detail', 'no_detail']);
    for (const { last } of lines) {
      expect(last).not.toMatch(/[\u2014\u2026]|\.\.\./);
      expect(last).not.toMatch(LOW_MOOD_SELF);
    }
  });
});
