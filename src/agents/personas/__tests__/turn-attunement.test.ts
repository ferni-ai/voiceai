import { readFileSync } from 'node:fs';

import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import {
  attunedLengthOn,
  attunementEnabled,
  attunementLine,
  attunementNote,
  callerTurns,
  readCaller,
  targetFor,
} from '../turn-attunement.js';
import { withTurnReminder } from '../turn-request.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';

const KEYS = ['ATTUNE', 'ATTUNE_LENGTH', 'TURN_LENGTH'] as const;
const before = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
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

  it('gives a tired caller a gentle, advice-free target with no length of its own', () => {
    const turns = ['Hey.', 'Quiet Sunday.', "I'm still here."];
    const line = attunementLine(targetFor('low', turns, true), turns);
    expect(line).not.toMatch(/at most \d+ words/);
    expect(line).toContain('no advice');
    expect(line).toContain('no stories or news of your own');
    expect(line).toContain('no question');
    expect(line).toContain('no instructions, not even caring ones');
    expect(line).toContain('This outranks any extras above.');
    expect(line).not.toContain('length');
  });

  it('adds the length cap only when asked (the ATTUNE_LENGTH experiment)', () => {
    const turns = ['Hey.', 'Quiet Sunday.', "I'm still here."];
    const line = attunementLine(targetFor('low', turns, true), turns, true);
    expect(line).toContain('at most 10 words');
    expect(line).toContain('This outranks any length or extras above.');
  });
});

describe('a tired caller asking about Ferni', () => {
  it.each(['Yeah. How have you been?', 'And you?', 'What have you been up to?', 'What about you?'])(
    '"%s" lets him answer about himself',
    (asked) => {
      const turns = ['Hey.', 'Tired.', asked];
      const line = attunementLine(targetFor('low', turns, false), turns);
      expect(line).not.toContain('no stories or news of your own');
      expect(line).toContain('they asked about you');
    }
  );

  it('never grants a question: "no question" or "any question an easy one"', () => {
    const turns = ['Hey.', 'Quiet Sunday.', "I'm still here."];
    expect(attunementLine(targetFor('low', turns, false), turns)).toContain(
      'any question an easy one'
    );
    expect(attunementLine(targetFor('low', turns, true), turns)).toContain('no question');
    expect(attunementLine(targetFor('low', turns, false), turns)).not.toContain('at most one');
  });
});

describe('ATTUNE_LENGTH (loop experiment; learned TURN_LENGTH wins)', () => {
  it('is off by default and never on with TURN_LENGTH=learned', () => {
    expect(attunedLengthOn({})).toBe(false);
    expect(attunedLengthOn({ ATTUNE_LENGTH: 'on' })).toBe(true);
    expect(attunedLengthOn({ ATTUNE_LENGTH: 'on', TURN_LENGTH: 'learned' })).toBe(false);
  });

  it('ATTUNE=on alone sizes nothing; the experiment flag adds the cap; learned length removes it', () => {
    const quiet = call(...SETH);
    const cap = /at most \d+ words/;
    expect(attunementNote(quiet, {}, { env: { ATTUNE: 'on' } })).not.toMatch(cap);
    expect(attunementNote(quiet, {}, { env: { ATTUNE: 'on', ATTUNE_LENGTH: 'on' } })).toMatch(cap);
    const both = { ATTUNE: 'on', ATTUNE_LENGTH: 'on', TURN_LENGTH: 'learned' };
    expect(attunementNote(quiet, {}, { env: both })).not.toMatch(cap);
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

/** turn-length.ts lengthLine, the learned length target. */
const LEARNED_LENGTH =
  /THIS REPLY: (?:a quick spoken reaction|just a few words, about \d+|one sentence, about \d+ words|a sentence or two, about \d+ words|you have something to say)/;
/** Every phrase that sizes a reply: main's (learned, or the fixed rule a request keeps) and attunement's own. */
const ANY_LENGTH = new RegExp(
  `${LEARNED_LENGTH.source}|Most replies are a sentence or two|at most \\d+ words|one short sentence|in a sentence|\\d+ words? just now`,
  'g'
);

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

  it('with TURN_LENGTH=learned the request carries one length target, the learned one', () => {
    const session = {};
    process.env.ATTUNE = 'on';
    process.env.ATTUNE_LENGTH = 'on';
    process.env.TURN_LENGTH = 'learned';
    const request = last(withTurnReminder(call(...SETH), session));
    expect(request).toContain('Meet them where they are');
    expect(request).not.toMatch(/at most \d+ words/);
    expect(request).toMatch(LEARNED_LENGTH);
    delete process.env.TURN_LENGTH;
    expect(last(withTurnReminder(call(...SETH), session))).toMatch(/at most \d+ words/);
  });

  it('a tired caller asking about Ferni, or for advice, still gets exactly one length target', () => {
    const askedAboutHim = call('Hey.', 'Hey you.', 'Tired.', 'Long day?', 'Yeah. What about you?');
    const venting = call(
      'Ugh, my boss took credit for my work again.',
      'That is maddening.',
      "I'm so fed up. What should I do?"
    );
    for (const [convo, attune] of [
      [askedAboutHim, 'on'],
      [venting, 'all'],
    ] as const) {
      for (const capped of [undefined, 'on']) {
        process.env.ATTUNE = attune;
        if (capped) process.env.ATTUNE_LENGTH = capped;
        else delete process.env.ATTUNE_LENGTH;
        process.env.TURN_LENGTH = 'learned';
        const request = last(withTurnReminder(convo, {}));
        expect(request).toContain('Meet them where they are');
        // One length target, TURN_LENGTH's (a request keeps its fixed rule, turn-shape.ts).
        expect(request.match(ANY_LENGTH)).toHaveLength(1);
        if (convo === askedAboutHim) expect(request).toMatch(LEARNED_LENGTH);
      }
    }
  });
});

/**
 * Prod canary 2026-10-21 (ATTUNE=on, ee11522d9): 32 turns in 8 of 17 calls read
 * "low", upbeat callers included. Replaying these exact caller lines through
 * readCaller reproduces every one from the words alone; the voice was never
 * consulted on them (it only breaks a tie when the words say nothing).
 */
const FIRST_CALL = [
  'Hi. Um, so I just downloaded this, not totally sure how it works.',
  "I'm Jess, by the way.",
  "Long day. I'm a dental hygienist and today was back to back cleanings.",
  "My daughter Ava has a soccer tournament on Saturday, so I'm the snack mom this week.",
  "The thing I'm actually excited about is I'm learning Spanish. We're going to Mexico City in the spring.",
  'Okay, I should get dinner going. This was nice.',
];
const RECALL = [
  "Hey Ferni, it's me again.",
  'So, guess how Monday went.',
  'It went really well actually.',
];

describe('upbeat callers are not read as low (prod canary 2026-10-21)', () => {
  it('reads the upbeat canary lines as not low', () => {
    expect(readCaller(FIRST_CALL.slice(0, 5))).toBe('excited');
    expect(readCaller(RECALL.slice(0, 2))).not.toBe('low');
    expect(readCaller(RECALL)).not.toBe('low');
    expect(
      readCaller([...RECALL.slice(0, 2), `${RECALL[2]} They want me back for a final round.`])
    ).not.toBe('low');
  });

  it('gives an upbeat canary call no gentle line on the live path (ATTUNE=on)', () => {
    const c = call(
      FIRST_CALL[2],
      'Back-to-back cleanings sound like a test of endurance.',
      FIRST_CALL[4]
    );
    expect(attunementNote(c, {}, { env: { ATTUNE: 'on' } })).toBe('');
    const recall = call(RECALL[0], 'Oh, hey again.', RECALL[1]);
    expect(attunementNote(recall, {}, { env: { ATTUNE: 'on' } })).toBe('');
  });

  it('still reads a tired caller as low', () => {
    expect(readCaller(["Hey Ferni, it's been kind of a long day."])).toBe('low');
    expect(readCaller(['Hey.', 'Long day. Just got home.'])).toBe('low');
    expect(
      readCaller(['Hey.', 'Did errands all day. Wiped.', 'Groceries, the bank. The usual.'])
    ).toBe('low');
    // The canary's long-day caller: weary words keep it gentle after the long-day turn.
    const longDay = [
      "Hey Ferni, it's been kind of a long day.",
      'Work was just a lot. My manager moved a big deadline up to Friday.',
      "Yeah, honestly, I don't even know where to start with it.",
    ];
    expect(readCaller(longDay.slice(0, 2))).toBe('low');
    expect(readCaller(longDay)).toBe('low');
    // Negated or tired-and-excited is not upbeat.
    expect(readCaller(['Hey.', 'Not that excited, honestly.'])).toBe('low');
    expect(readCaller(['Hey.', "Didn't go well."])).toBe('low');
    expect(readCaller(["I'm too tired to be excited about anything right now, honestly."])).toBe(
      'low'
    );
    // Word boundaries: "unexciting" is not "exciting".
    expect(readCaller(['Hey.', 'Long day.', 'Pretty unexciting, honestly.'])).toBe('low');
  });

  it('recovers on the turn an upbeat line follows a low one', () => {
    const tired = ['Hey.', 'Long day. Just got home.'];
    expect(readCaller(tired)).toBe('low');
    expect(readCaller([...tired, "Oh, but I'm actually really excited about this weekend."])).toBe(
      'excited'
    );
    expect(readCaller([...tired, 'But guess how my interview went.'])).toBe('excited');
    expect(readCaller([...tired, 'It went really well, actually.'])).toBe('excited');
  });

  it('lets a low read from words decay once a later turn is not low', () => {
    expect(readCaller(FIRST_CALL.slice(0, 3))).toBe('low');
    expect(readCaller(FIRST_CALL.slice(0, 4))).not.toBe('low');
    expect(readCaller(FIRST_CALL)).not.toBe('low');
  });

  it('does not read low from tiredness the caller hears in Ferni, or "beat" as a verb', () => {
    const late = [
      'Hey Ferni, you still up?',
      "Lisbon for a few days. I keep going back and forth on whether it's too far for that short.",
      'Huh, okay. You sound a little tired actually.',
    ];
    expect(readCaller(late)).not.toBe('low');
    expect(
      readCaller(['We beat the other team last night, my brother scored twice in the second half.'])
    ).not.toBe('low');
    expect(readCaller(["I'm beat. Just got home."])).toBe('low');
  });

  it('never lets a flat voice turn upbeat words low', () => {
    const flat = { arousal: -0.6, confidence: 0.9 };
    expect(readCaller(['So, guess how Monday went.'], flat)).not.toBe('low');
  });
});

describe('the #1086 scenarios (scripts/voice-eval/attunement/fixtures)', () => {
  const fixtures = ['scenarios.json', 'heldout.json'].flatMap(
    (f) =>
      (
        JSON.parse(
          readFileSync(
            new URL(`../../../../scripts/voice-eval/attunement/fixtures/${f}`, import.meta.url),
            'utf8'
          )
        ) as { scenarios: Array<{ id: string; state: string; turns: string[] }> }
      ).scenarios
  );

  it('still reads every tired caller as low from the second turn on', () => {
    const tired = fixtures.filter((s) => s.state === 'tired');
    expect(tired.length).toBeGreaterThanOrEqual(10);
    for (const s of tired)
      for (let k = 2; k <= s.turns.length; k++)
        expect([s.id, k, readCaller(s.turns.slice(0, k))]).toEqual([s.id, k, 'low']);
  });

  it('never reads an excited caller as low', () => {
    for (const s of fixtures.filter((x) => x.state === 'excited'))
      for (let k = 1; k <= s.turns.length; k++)
        expect([s.id, k, readCaller(s.turns.slice(0, k))]).not.toEqual([s.id, k, 'low']);
  });
});
