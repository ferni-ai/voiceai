import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import {
  attunementEnabled,
  attunementLine,
  attunementNote,
  callerTurns,
  readCaller,
  targetFor,
} from '../turn-attunement.js';
import { withTurnReminder } from '../turn-request.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';

const before = process.env.ATTUNE;
afterEach(() => {
  if (before === undefined) delete process.env.ATTUNE;
  else process.env.ATTUNE = before;
});

/** A call: caller and Ferni alternating, caller first. */
function call(...lines: string[]): llm.ChatContext {
  const c = llm.ChatContext.empty();
  lines.forEach((text, i) => c.addMessage({ role: i % 2 ? 'assistant' : 'user', content: text }));
  return c;
}
const last = (c: llm.ChatContext) =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

// Seth's dev call, 2026-10-11.
const SETH = [
  'Still still on there.',
  "That mail isn't going to clear itself, but honestly mine's still sitting right where it was.",
  'Why is that?',
  "I think I'm just avoiding the electric bill, to be honest.",
  "I'm still here.",
];

describe('readCaller', () => {
  it('reads short, quiet answers as low energy (the 2026-10-11 call)', () => {
    expect(readCaller(['Still still on there.', 'Why is that?', "I'm still here."])).toBe('low');
    expect(readCaller(['Hey.', 'Long day. Just got home.'])).toBe('low');
  });

  it('reads each state from the words', () => {
    expect(readCaller(['We had to put Biscuit down today.', 'He was fourteen.'])).toBe('sad');
    expect(
      readCaller(['My boss took credit for my whole project. I am so done with this place.'])
    ).toBe('venting');
    expect(readCaller(['Hey, I only have a minute, heading out.'])).toBe('hurried');
    expect(readCaller(['Hold on, the pasta is boiling over.'])).toBe('distracted');
    expect(readCaller(['Guess what! I got the job, the design lead one!'])).toBe('excited');
    expect(readCaller(['Haha, my cat just knocked a whole glass off the table at me.'])).toBe(
      'playful'
    );
    expect(
      readCaller(['Thinking about a hike Saturday, maybe a movie on Sunday with my partner.'])
    ).toBe('neutral');
  });

  it('holds hurt for a few turns, as a friend would', () => {
    const turns = ['Jordan and I broke up.', 'It was mutual I guess.', 'Yeah.', 'Anyway.'];
    expect(readCaller(turns)).toBe('sad');
    const later = [
      ...turns,
      'Honestly I spent the afternoon reorganizing the garage with my brother.',
      'We found a box of old baseball cards from when we were kids.',
      'Some of them might even be worth something now, who knows.',
    ];
    expect(readCaller(later)).toBe('neutral');
  });

  it('lets a confident voice break a tie with neutral, never override the words', () => {
    const plain = ['I went to the store and then I came back home for the evening.'];
    expect(readCaller(plain, { arousal: -0.6, confidence: 0.7 })).toBe('low');
    expect(readCaller(plain, { arousal: -0.6, confidence: 0.3 })).toBe('neutral');
    expect(readCaller(plain, { arousal: 0.7, valence: 0.5, confidence: 0.8 })).toBe('excited');
    expect(
      readCaller(['Haha, Gerald the plant has an email.'], { arousal: -0.8, confidence: 0.9 })
    ).toBe('playful');
  });
});

describe('targetFor', () => {
  it("sizes a low-energy reply to the caller's own turns, with one easy question at most", () => {
    const t = targetFor('low', ['Hey.', 'Yeah.', 'Mm.'], false);
    expect(t).toMatchObject({ maxWords: 8, questions: 1, advice: false, ownStories: false });
    expect(targetFor('low', ['Hey.', 'Yeah.', 'Mm.'], true).questions).toBe(0);
    expect(targetFor('low', ['Hey.', 'What are you up to today?'], false).ownStories).toBe(true);
  });

  it('allows advice only when asked', () => {
    expect(targetFor('venting', ['My roommate never does dishes.'], false).advice).toBe(false);
    expect(targetFor('venting', ['Should I just say something?'], false).advice).toBe(true);
    expect(targetFor('sad', ['What would you do?'], false).advice).toBe(false);
  });
});

describe('attunementLine', () => {
  it('says nothing for a neutral caller', () => {
    expect(attunementLine(targetFor('neutral', ['Hi'], false), ['Hi'])).toBe('');
  });

  it('gives a tired caller a short, gentle, advice-free target that outranks the shape', () => {
    const turns = ['Hey.', 'Quiet Sunday.', "I'm still here."];
    const line = attunementLine(targetFor('low', turns, true), turns);
    expect(line).toContain('at most 10 words');
    expect(line).toContain('no advice');
    expect(line).toContain('no stories or news of your own');
    expect(line).toContain('no question');
    expect(line).toContain('no instructions, not even caring ones');
    expect(line).toContain('outranks');
  });
});

describe('attunementNote', () => {
  it('is off by default and with crisis guidance', () => {
    expect(attunementEnabled({})).toBe(false);
    expect(attunementNote(call(...SETH), {}, { env: {} })).toBe('');
    expect(attunementNote(call(...SETH), {}, { env: { ATTUNE: 'on' }, careful: true })).toBe('');
    expect(attunementNote(call(...SETH), {}, { env: { ATTUNE: 'on' } })).toContain(
      "they're low-key"
    );
  });

  it('attunes only the measured state with ATTUNE=on, every state with ATTUNE=all', () => {
    const quiet = call(...SETH);
    expect(attunementNote(quiet, {}, { env: { ATTUNE: 'on' } })).toContain("they're low-key");
    for (const said of [
      'Hey, I only have a minute, heading out.',
      'Ugh. My boss took credit for my project again and I am so done.',
      'Guess what! I got the job, the design lead one!',
    ]) {
      expect(attunementNote(call(said), {}, { env: { ATTUNE: 'on' } })).toBe('');
      expect(attunementNote(call(said), {}, { env: { ATTUNE: 'all' } })).toContain('Meet them');
    }
  });

  it("reads the caller's words, not pushed context notes", () => {
    const c = call('Hey.');
    c.addMessage({ role: 'user', content: `${TURN_CONTEXT_HEADER}\nlong note about the caller` });
    expect(callerTurns(c.items)).toEqual(['Hey.']);
  });
});

describe('on the live request path (withTurnReminder)', () => {
  it('ATTUNE off leaves the request byte for byte as before; on adds one line, last', () => {
    const session = {};
    delete process.env.ATTUNE;
    const unset = last(withTurnReminder(call(...SETH), session));
    process.env.ATTUNE = 'off';
    const off = last(withTurnReminder(call(...SETH), session));
    process.env.ATTUNE = 'on';
    const on = last(withTurnReminder(call(...SETH), session));
    expect(off).toBe(unset);
    expect(off).not.toContain('Meet them where they are');
    const line = attunementNote(call(...SETH), session);
    expect(on).toBe(off.replace(/\)$/, ` ${line})`));
  });
});
