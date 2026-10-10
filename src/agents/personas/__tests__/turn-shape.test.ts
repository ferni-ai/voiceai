import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { callerMove, pickShape, rngFor, turnShapeFor, turnShapeMode } from '../turn-shape.js';
import { Director, setDirector } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';
import { TURN_STYLE_REMINDER } from '../turn-style.js';

const fixed = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};

describe('turn shape', () => {
  it('reads what the caller just did', () => {
    expect(callerMove('Yeah.')).toBe('ack');
    expect(callerMove('Walk me through how you would plan it.')).toBe('request');
    expect(callerMove('How was your weekend?')).toBe('about_ferni');
    expect(callerMove('My cat knocked water onto my keyboard.')).toBe('share');
    // "know" is not "now", and a long "yeah" sentence is not an ack.
    expect(callerMove('Yeah, I know, my manager moved the deadline again.')).toBe('share');
  });

  it('picks shapes with human-like variety, never the same answer to every share', () => {
    const shapes = new Set(
      Array.from({ length: 200 }, (_, i) => pickShape('share', rngFor(`line ${i}`)))
    );
    expect(shapes).toEqual(new Set(['react', 'one', 'answer']));
    expect(pickShape('request', fixed(0.1))).toBe('answer');
    expect(pickShape('request', fixed(0.9))).toBe('full');
  });

  it('puts the shape last, forbids a question on short replies and allows one only sometimes', () => {
    const react = turnShapeFor('My cat did it again.', fixed(0.1, 0.9, 0.9));
    expect(react.shape).toBe('react');
    expect(react.reminder).toMatch(/six words at most.*No question this time/);
    const allowed = turnShapeFor('Walk me through it.', fixed(0.1, 0.9, 0.9, 0.1));
    expect(allowed.reminder).toMatch(/You may ask one question/);
    const notAllowed = turnShapeFor('Walk me through it.', fixed(0.1, 0.9, 0.9, 0.9));
    expect(notAllowed.reminder).toMatch(/No question this time/);
  });

  it('asks Ferni to answer about himself when asked about himself', () => {
    expect(turnShapeFor('How was your weekend?', fixed(0.1)).reminder).toMatch(
      /answer about yourself/
    );
  });

  // Asked as "share", these got "one short sentence, your own take" and Ferni
  // made up the forecast, the score and the drive time (local A/B, 2026-10-08).
  const LOOKUPS = [
    "Hey! Quick one, what's the weather looking like this weekend?",
    'Nice. Anything big in the news today?',
    'Who won the Dodgers game last night?',
    'Can you find me a good taco place nearby? Something casual.',
    'Thanks. Oh, and how long would it take me to drive to Zion from here?',
    'Is it going to rain tomorrow',
    'Did the Lakers win?',
    "What's the traffic like on the way to work?",
  ];

  it('reads a question about something live as a look-up', () => {
    for (const text of LOOKUPS) expect(callerMove(text), text).toBe('lookup');
  });

  it('does not read talk about the same topics as a look-up', () => {
    for (const text of [
      'It rained all weekend and my basement flooded.',
      'I watched the Dodgers game last night with my dad.',
      'The news has been really getting to me lately.',
      'The news is so depressing.',
      'How was your weekend?',
      'How long should I rest after a run?',
    ]) {
      expect(callerMove(text), text).not.toBe('lookup');
    }
  });

  it('tells a look-up reply to answer from a tool, plainly, every time', () => {
    for (const text of LOOKUPS) {
      for (let i = 0; i < 20; i++) {
        const turn = turnShapeFor(text, rngFor(`call ${i}:${text}`));
        expect(turn.shape, text).toBe('answer');
        expect(turn.reminder).toMatch(/tool/);
        expect(turn.reminder).toMatch(/never state a forecast, score/i);
        // No made-up self-corrections ("they won, wait, no, they lost") or stories.
        expect(turn.reminder).not.toMatch(/Correct yourself|restart it|own life|six words/);
      }
    }
  });

  it('gives the preemptive and the final request the same shape', () => {
    expect(turnShapeFor('My cat did it again.', rngFor('My cat did it again.')).reminder).toBe(
      turnShapeFor('My cat did it again.', rngFor('My cat did it again.')).reminder
    );
  });
});

describe('withTurnReminder', () => {
  const ctx = () => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: 'My cat did it again.' });
    return c;
  };
  const last = (c: llm.ChatContext) =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

  it('shapes the reply by default', () => {
    expect(last(withTurnReminder(ctx(), {}))).toMatch(/THIS REPLY:/);
  });

  it('keeps the plain reminder when asked (crisis replies) and with TURN_SHAPE=off', () => {
    expect(last(withTurnReminder(ctx(), {}, { shape: false }))).toContain(TURN_STYLE_REMINDER);
    const prev = process.env.TURN_SHAPE;
    process.env.TURN_SHAPE = 'off';
    try {
      expect(last(withTurnReminder(ctx(), {}))).toContain(TURN_STYLE_REMINDER);
    } finally {
      if (prev === undefined) delete process.env.TURN_SHAPE;
      else process.env.TURN_SHAPE = prev;
    }
  });
});

describe('withTurnReminder seeding and order', () => {
  const ctx = (said: string) => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: said });
    return c;
  };
  const last = (c: llm.ChatContext) =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

  it('gives one call the same shape for the same words, and other calls a fresh draw', () => {
    const session = {};
    expect(last(withTurnReminder(ctx('My cat did it again.'), session))).toBe(
      last(withTurnReminder(ctx('My cat did it again.'), session))
    );
    const shapes = new Set(
      Array.from(
        { length: 40 },
        () => last(withTurnReminder(ctx('My cat did it again.'), {})).match(/THIS REPLY: \w+/)?.[0]
      )
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('puts the shape after the told-this-call record and director notes', () => {
    const session = {};
    setDirector(session, {
      current: () => ['Drop the trivia; it makes the call feel like a lecture.'],
      told: () => 'You already told them about Wyoming.',
    } as unknown as Director);
    const text = last(withTurnReminder(ctx('My cat did it again.'), session));
    setDirector(session, null);
    expect(text.indexOf('THIS REPLY:')).toBeGreaterThan(text.indexOf('Drop the trivia'));
    expect(text.indexOf('THIS REPLY:')).toBeGreaterThan(text.indexOf('Wyoming'));
  });

  it('never asks for marks the voice rules ban, and shows how to write each rough form', () => {
    // Dashes and ellipses are banned (speech-markup-notes.ts); a restart asked
    // for with no allowed written form came out ",," on dev.
    const reminders = Array.from({ length: 400 }, (_, i) => {
      const rng = rngFor(`seed ${i}`);
      return turnShapeFor(['My cat did it again.', 'How was your weekend?', 'yeah'][i % 3], rng)
        .reminder;
    });
    const rough = reminders.filter((r) => /restart|Correct yourself|Hesitate|Trail off/.test(r));
    expect(rough.length).toBeGreaterThan(20);
    for (const r of reminders) expect(r).not.toMatch(/[—–]|\.\.\.|…|,,/);
    for (const r of rough) expect(r).toMatch(/\("[^"]+"\)/);
  });

  it('never offers a story of his own while the caller is venting', () => {
    const venting = Array.from(
      { length: 200 },
      (_, i) =>
        turnShapeFor('Honestly I am exhausted, it has been a long day', rngFor(`v${i}`)).reminder
    );
    expect(venting.some((r) => /share a small piece of it/.test(r))).toBe(false);
    const light = Array.from(
      { length: 200 },
      (_, i) => turnShapeFor('We went to the lake this weekend', rngFor(`l${i}`)).reminder
    );
    expect(light.some((r) => /share a small piece of it/.test(r))).toBe(true);
  });

  it('tells every reply to build only on what was said, and not to offer tasks', () => {
    for (const text of ['Not much, just got home.', 'Oh, and Biscuit chewed my charger.', 'Yeah.']) {
      for (const mode of ['dice', 'model'] as const) {
        const r = turnShapeFor(text, rngFor(text), mode).reminder;
        expect(r).toMatch(/Build only on what they actually told you/);
        expect(r).toMatch(/not an assistant/);
      }
    }
  });

  describe('TURN_SHAPE=model', () => {
    const big = 'My sister just told me she is pregnant, right on the hiking trail.';

    it('reads the mode from the env, dice by default', () => {
      expect(turnShapeMode({})).toBe('dice');
      expect(turnShapeMode({ TURN_SHAPE: 'model' })).toBe('model');
      expect(turnShapeMode({ TURN_SHAPE: 'off' })).toBe('off');
    });

    it('never assigns a fixed shape: the model judges it from the moment', () => {
      const replies = Array.from({ length: 200 }, (_, i) =>
        turnShapeFor(big, rngFor(`m${i}`), 'model')
      );
      for (const r of replies) {
        expect(r.reminder).not.toMatch(/THIS REPLY/);
        expect(r.reminder).toMatch(/yours to judge/);
        expect(r.extras[0]).toBe('model_shape');
      }
      // The dice draw a six-word reaction for some of the same news.
      const dice = Array.from({ length: 200 }, (_, i) => turnShapeFor(big, rngFor(`m${i}`), 'dice'));
      expect(dice.some((r) => /six words at most/.test(r.reminder))).toBe(true);
    });

    it('still makes a live question use a tool', () => {
      const r = turnShapeFor("What's the weather tomorrow?", rngFor('w'), 'model');
      expect(r.move).toBe('lookup');
      expect(r.reminder).toMatch(/call the tool for it now/);
    });
  });
});
