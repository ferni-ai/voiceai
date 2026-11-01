import { llm } from '@livekit/agents';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import {
  DAY_DETAILS,
  dayDetailFor,
  GROUNDED_DAY_DETAILS,
  isSelfShare,
  LOW_MOOD_SELF,
  selfQuotes,
  soundsLow,
  turnsBack,
} from '../ferni-self-share.js';
import { ferniStateNote, noteFor, selfShareFor, stateFor } from '../ferni-state.js';
import { regexSignals } from '../turn-extras.js';
import { callerMove, rngFor, turnShapeFor } from '../turn-shape.js';

/** Ferni's replies on Seth's dev call, 2026-10-11 (caller talk share 0.08). */
const SETH_CALL = {
  mail: "That mail isn't going to clear itself, but honestly mine's still sitting right where it was this morning too.",
  bill: "I think I'm just avoiding the electric bill, to be honest. It's been staring me down from the counter all day, and it's much easier to just look out at the pasture and pretend it doesn't exist.",
  chore:
    "Oh, I, uh, I don't mind it when I've got time, but at the end of the day it feels like just another chore. What about you, do you actually like making dinner or is it takeout town?",
  effort:
    "I was, well, I used to really get into it, but these days my kitchen skills mostly involve the microwave and a prayer, to be honest. It's just too much effort.",
  evening:
    "Just the thought of figuring out what to make after a long week can make the whole evening feel like work before it's even started, you know?",
  easiest: "Yeah, it's just, uh, sometimes the easiest thing is the only thing that makes sense.",
  lecture:
    'Good, because ignoring those things never actually makes them smaller, it just gives them more room to grow in your head.',
};

/** 12:10 in Wyoming, like Seth's call. */
const NOON = new Date('2026-10-11T18:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const SECOND_STORY = /share a small piece of it/;

let n = 0;
function newCall() {
  const sessionId = `self-share-${++n}`;
  return {
    sessionId,
    userData: {
      personaId: 'ferni',
      services: { sessionId, sessionStartTime: Date.now() - 120_000 },
    },
  };
}

/** A call: caller and Ferni lines alternating, starting and ending with the caller. */
function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}

/** The request the model is asked with, through the live reply path (ferni-agent.ts llmNode). */
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
});

describe('the low-mood guard', () => {
  it('catches every resigned or avoidant line Ferni said about himself on the 2026-10-11 call', () => {
    for (const line of [
      SETH_CALL.bill,
      SETH_CALL.chore,
      SETH_CALL.effort,
      SETH_CALL.evening,
      SETH_CALL.easiest,
    ])
      expect(soundsLow(line), line).toBe(true);
  });

  it('leaves light, honest texture alone', () => {
    for (const line of [
      'I burned the toast again this morning, ha, the smoke alarm and I are on a first-name basis.',
      "You're getting sleepy; it's nearly 2am where you are.",
      "I got lost on the way to a new bakery and found a better one. What's your go-to?",
    ])
      expect(soundsLow(line), line).toBe(false);
  });

  it('no state line ever carries it: any hour, call length, caller, offer or turn', () => {
    const lines: string[] = [];
    for (let hour = 0; hour < 24; hour++)
      for (const callMinutes of [0, 8, 30])
        for (const callerTurnWords of [[1, 1, 1], [12], [40, 40]])
          for (const offer of [true, false]) {
            const state = stateFor({
              hour,
              minute: 47,
              callMinutes,
              callerTurnWords,
              callerTired: hour % 2 === 0,
            });
            lines.push(noteFor(state, { hour, minute: 47 }, offer));
          }
    const replies = Object.values(SETH_CALL);
    for (const detail of DAY_DETAILS)
      for (const said of [
        'Yeah.',
        'What are you up to today?',
        'I spent all day rebuilding the fence by the barn out back.',
      ])
        for (let k = 0; k <= replies.length; k++)
          lines.push(selfShareFor({ replies: replies.slice(0, k), said, detail }).line);
    for (const line of lines) expect(line, line).not.toMatch(LOW_MOOD_SELF);
    for (const detail of DAY_DETAILS) expect(soundsLow(detail), detail).toBe(false);
  });
});

describe('his day details come from his canon (#1511)', () => {
  const IDENTITY = join(process.cwd(), 'src', 'personas', 'bundles', 'ferni', 'identity');

  it('every day detail rests on words its canon file actually says', () => {
    expect(DAY_DETAILS.length).toBeGreaterThanOrEqual(5);
    for (const detail of DAY_DETAILS) {
      const grounded = GROUNDED_DAY_DETAILS.find((d) => d.text === detail);
      expect(grounded, detail).toBeDefined();
      const sheet = readFileSync(join(IDENTITY, grounded!.canon.file), 'utf8');
      expect(sheet, `${grounded!.canon.file}: ${grounded!.canon.says}`).toContain(
        grounded!.canon.says
      );
    }
  });

  it('none of the invented details is back', () => {
    for (const detail of DAY_DETAILS)
      expect(detail).not.toMatch(/sapporo|grinder|\bfox\b|bakery|porch|named it/i);
  });
});

describe('spotting a self-share and the turn back', () => {
  it('reads talk about his own day and life as a self-share, conversation as not', () => {
    expect(isSelfShare(SETH_CALL.mail)).toBe(true);
    expect(isSelfShare(SETH_CALL.bill)).toBe(true);
    expect(isSelfShare(SETH_CALL.effort)).toBe(true);
    expect(isSelfShare(SETH_CALL.lecture)).toBe(false);
    expect(isSelfShare("I'm listening, Seth. Take your time, there's no rush at all.")).toBe(false);
    expect(isSelfShare("I think you're right about that.")).toBe(false);
  });

  it('a turn back is a closing question about them', () => {
    expect(turnsBack(SETH_CALL.chore)).toBe(true);
    expect(turnsBack(SETH_CALL.effort)).toBe(false);
    expect(turnsBack('Saw a fox this morning. Anything good in your day?')).toBe(true);
    expect(turnsBack("Isn't that wild, a fox right by the fence.")).toBe(false);
  });

  it('quotes what he said about himself, never the low parts and never questions', () => {
    const quotes = selfQuotes([SETH_CALL.effort, 'I saw a fox this morning, right by the fence.']);
    expect(quotes).toEqual([
      'I was, well, I used to really get into it, but these days my kitchen skills mostly invo...',
      'I saw a fox this morning, right by the fence.',
    ]);
  });
});

describe('the self-share budget', () => {
  const detail = DAY_DETAILS[4];

  it('after he talked about himself without turning back, the next reply is about them', () => {
    const turn = selfShareFor({ replies: ['Hey!', SETH_CALL.mail], said: 'Why is that?', detail });
    expect(turn.line).toContain('Your last reply was about you: this one is about them');
    expect(turn.ownStory).toBe(false);
  });

  it('never two in a row: a self-share that did turn back still holds the next one', () => {
    const turn = selfShareFor({
      replies: [
        'Ha, a quiet one.',
        'I saw a fox this morning by the fence. Anything good in your day?',
      ],
      said: 'Yeah.',
      detail,
    });
    expect(turn.line).toContain('keep this reply on them');
    expect(turn.ownStory).toBe(false);
  });

  it('a reply that sounded low gets corrected, not continued', () => {
    const turn = selfShareFor({ replies: ['Ha.', SETH_CALL.easiest], said: 'Yeah.', detail });
    expect(turn.line).toContain("you aren't: leave that thread, keep it light, and turn to them");
    expect(turn.ownStory).toBe(false);
  });

  it('while they tell him something of theirs, nothing about himself', () => {
    const turn = selfShareFor({
      replies: ['Ha, no way.', 'Mm.'],
      said: 'So my sister finally called me back about the house in Denver last night.',
      detail,
    });
    expect(turn.line).toContain("They're telling you something of theirs");
    expect(turn.ownStory).toBe(false);
  });

  it('early in the call, nothing of his own unasked', () => {
    const turn = selfShareFor({ replies: ['Hey, good to hear you.'], said: 'Yeah.', detail });
    expect(turn.line).toBe('[Keep this reply on them.]');
    expect(turn.ownStory).toBe(false);
  });

  it('after a few turns on them, one light thing from his day, then a question about theirs', () => {
    const turn = selfShareFor({ replies: ['Ha, no way.', 'Mm, Sunday.'], said: 'Yeah.', detail });
    expect(turn.line).toContain(detail);
    expect(turn.line).toContain('one light sentence, then turn to them with a question');
    expect(turn.ownStory).toBe(true);
  });

  it('asked about him: answers from the same day and stays consistent with what he said', () => {
    const turn = selfShareFor({
      replies: ['I saw a fox this morning, right by the fence.', 'Ha.'],
      said: 'What are you up to today, Fern?',
      detail,
    });
    expect(turn.line).toContain(`answer from your day (${detail})`);
    expect(turn.line).toContain('"I saw a fox this morning, right by the fence."');
    expect(turn.line).toContain('then ask them something about theirs');
  });
});

describe('the turn shape follows his state', () => {
  const said = 'Yeah, just a quiet Sunday around here.';
  const sig = regexSignals(said, callerMove(said));
  const shapes = (ownStory: boolean | undefined): string[] =>
    Array.from(
      { length: 60 },
      (_, i) => turnShapeFor(said, rngFor(`seed-${i}`), 'model', { ...sig, ownStory }).reminder
    );

  it('without a say (FERNI_STATE off) the second story still comes up sometimes', () => {
    expect(shapes(undefined).some((r) => SECOND_STORY.test(r))).toBe(true);
  });

  it('held back, no second story and no "something of your own" ending, on any draw', () => {
    for (const r of shapes(false)) {
      expect(r).not.toMatch(SECOND_STORY);
      expect(r).not.toContain('or something of your own');
    }
  });

  it('allowed, a word about himself ends by asking about them', () => {
    expect(
      shapes(true).some((r) => r.includes('then end by asking them one about their world'))
    ).toBe(true);
  });
});

describe('on the live reply path (FERNI_STATE=on)', () => {
  beforeEach(() => {
    process.env.FERNI_STATE = 'on';
  });

  it('Seth\'s call: after the mail line, the reply to "Why is that?" is steered to him, no story of Ferni\'s', async () => {
    const session = { userData: newCall().userData };
    const asked = await askedWith(
      callOf('Still on there.', SETH_CALL.mail, 'Why is that?'),
      session
    );
    expect(asked).toContain("You're doing well today and glad they called.");
    expect(asked).toContain('Your last reply was about you');
    expect(asked).not.toMatch(SECOND_STORY);
    expect(asked).not.toContain('something of your own.');
  });

  it('the day detail is one thing for the whole call', async () => {
    const { userData, sessionId } = newCall();
    const session = { userData };
    const first = await askedWith(callOf('What are you up to today?'), session);
    const later = await askedWith(
      callOf(
        'What are you up to today?',
        'Ha, not much.',
        'Ha.',
        'Mm.',
        'What did you do this morning?'
      ),
      session
    );
    const detail = dayDetailFor(sessionId);
    expect(first).toContain(detail);
    expect(later).toContain(detail);
  });

  it('off (default), none of it reaches the request', async () => {
    delete process.env.FERNI_STATE;
    const ctx = callOf('Still on there.', SETH_CALL.mail, 'Why is that?');
    expect(ferniStateNote(ctx, { userData: newCall().userData })).toBe('');
    const asked = await askedWith(ctx, { userData: newCall().userData });
    expect(asked).not.toContain('doing well today');
    expect(asked).not.toContain('Your last reply was about you');
  });
});
