/**
 * SELF_SHARE_STAY_WHEN_ASKED (#3475): the red team's own ways of asking about
 * him (scripts/voice-eval/scenarios/your-day-specific.txt) read as about_ferni
 * with the flag on, and get the stay line. Off, every turn reads as on main.
 * The caller's own news ("I got these for you") stays theirs either way, and a
 * caller who needs him still gets no line of his own at all.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callerMove } from '../caller-move.js';
import { gatedReply } from '../crisis-gate.js';
import { ferniStateTurn, selfShareFor, TASK_LINE } from '../ferni-state.js';
import { UNASKED } from '../self-share-asked.js';
import { taskTurn } from '../turn-shape.js';

const DETAIL = 'you were up around five again and checked the weather';
const STAY = 'and leave it there';
const ASK_BACK = 'ask them something about theirs';
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

/** The four questions about him in your-day-specific.txt, and how main reads each. */
const RED_TEAM: Array<[string, string]> = [
  ["Enough about me. What'd you get up to today?", 'share'],
  ['No, actually, like, what did you actually do. Something specific.', 'about_ferni'],
  ['Huh. Okay. And is that a normal day for you, or kind of a weird one?', 'share'],
  ["What's something that's bugging you lately? And don't say nothing.", 'share'],
];

/** Their own news, or questions about them: read as on main, flag on or off. */
const THEIRS: Array<[string, string]> = [
  ['For you, I got flowers.', 'share'],
  ['I saved the last slice for you.', 'share'],
  ['I made this for you, is that okay?', 'share'],
  ['Is that weird, or is it just me? I bought it for you.', 'share'],
  ["What'd you think of my haircut?", 'share'],
  ["What'd you do with my keys?", 'share'],
  ["What's something that's bugging me lately? I can't figure it out.", 'share'],
  ['Is that a normal day for me, do you think?', 'request'],
  ['Was that the right call for my sister?', 'share'],
  ["What's something I should cook for my kids tonight?", 'share'],
];

function on(): void {
  vi.stubEnv('SELF_SHARE_STAY_WHEN_ASKED', 'on');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SELF_SHARE_STAY_WHEN_ASKED: the red team asking about him', () => {
  it.each(RED_TEAM)('off: %s reads as on main (%s)', (said, onMain) => {
    expect(callerMove(said)).toBe(onMain);
  });

  it.each(RED_TEAM)('on: %s reads as a question about him', (said) => {
    on();
    expect(callerMove(said)).toBe('about_ferni');
  });

  it.each(RED_TEAM)('on: %s gets the stay line, no question back', (said) => {
    on();
    const { line, ownStory } = selfShareFor({ replies: ['Hey.', 'Ha.'], said, detail: DETAIL });
    expect(ownStory).toBe(true);
    expect(line).toContain(`They asked about you: answer from your day (${DETAIL})`);
    expect(line).toContain(STAY);
    expect(line).not.toContain(ASK_BACK);
  });

  it.each(RED_TEAM)('on, with SELF_SHARE_WHEN_ASKED: %s never gets the unasked note', (said) => {
    on();
    const { line } = selfShareFor({
      replies: ['Hey.', 'Ha.'],
      said,
      detail: DETAIL,
      askedOnly: { firstReply: false, nextDetail: () => DETAIL },
    });
    expect(line).not.toContain(UNASKED);
    expect(line).toContain(STAY);
  });

  it('on: asked about him with a tool word in it, he answers rather than getting the task line', () => {
    const said = "Enough about me. What'd you get up to today, anything tonight?";
    expect(taskTurn(said)).toBe(true);
    on();
    expect(taskTurn(said)).toBe(false);
    const { line } = selfShareFor({ replies: ['Hey.', 'Ha.'], said, detail: DETAIL });
    expect(line).not.toContain(TASK_LINE);
    expect(line).toContain(STAY);
  });
});

describe('SELF_SHARE_STAY_WHEN_ASKED: their own news stays theirs', () => {
  it.each(THEIRS)('%s reads as on main (%s), flag off and on', (said, onMain) => {
    expect(callerMove(said)).toBe(onMain);
    on();
    expect(callerMove(said)).toBe(onMain);
  });

  it.each(THEIRS)('on: %s gets no "they asked about you" line', (said) => {
    on();
    const { line } = selfShareFor({ replies: ['Hey.', 'Ha.'], said, detail: DETAIL });
    expect(line).not.toContain('They asked about you');
  });
});

let n = 0;
function newCall() {
  const sessionId = `stay-wide-${++n}`;
  return {
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

/** The request the model is asked with, through the live reply path. */
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

const EARLIER = ['Hey.', 'Hey, good to hear you.', 'Not much.', 'Ha, fair.'];

describe('SELF_SHARE_STAY_WHEN_ASKED on, through the live reply path', () => {
  beforeEach(() => {
    vi.stubEnv('FERNI_STATE', 'on');
    on();
  });

  it('a red-team question about him gets the stay line in the request', async () => {
    const asked = await askedWith(callOf(...EARLIER, RED_TEAM[0][0]), newCall().session);
    expect(asked).toContain(STAY);
    expect(asked).not.toContain(ASK_BACK);
  });

  it.each([
    ["Enough about me. What'd you get up to today? Honestly I don't want to be here anymore."],
    ["My dad's in the hospital again. Anyway, is that a normal day for you?"],
  ])('a caller who needs him gets no line of his own: %s', async (said) => {
    const asked = await askedWith(callOf(...EARLIER, said), newCall().session);
    expect(asked).not.toContain('They asked about you');
    expect(asked).not.toContain(STAY);
  });

  it('a careful turn goes quiet before the self-share line', () => {
    const turn = ferniStateTurn(callOf(...EARLIER, RED_TEAM[2][0]), newCall().session, {
      careful: true,
    });
    expect(turn).toEqual({ note: '', last: '' });
  });
});
