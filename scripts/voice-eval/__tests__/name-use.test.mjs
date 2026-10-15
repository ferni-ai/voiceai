import { describe, expect, it } from 'vitest';
import { compareToTargets, computeHumanness } from '../humanness.mjs';

// A synthetic call: the greeting says the name, then two of four replies do.
const run = {
  userSpeech: [[500, 1500]],
  events: [
    { who: 'agent', text: 'Hey Sam. Afternoon.', t: 100 },
    { who: 'user', text: 'Long day.', t: 600 },
    { who: 'agent', text: 'That sounds rough, Sam.', t: 900 },
    { who: 'user', text: 'My sister Samantha called.', t: 1600 },
    { who: 'agent', text: 'What did Samantha want?', t: 1900 },
    { who: 'user', text: 'Money, as usual.', t: 2600 },
    { who: 'agent', text: 'Sam, really? Again?', t: 2900 },
    { who: 'user', text: 'I will say no.', t: 3600 },
    { who: 'agent', text: 'I think you will.', t: 3900 },
  ],
};

describe('nameUseRate', () => {
  it("counts the caller's name in Ferni's turns, not the greeting", () => {
    expect(computeHumanness([run]).nameUseRate).toBe(0.5);
  });

  it('matches the name as a word, with its capital', () => {
    expect(computeHumanness([run], { callerName: 'Will' }).nameUseRate).toBe(0);
  });

  it('is judged against the human target', () => {
    const vs = compareToTargets(computeHumanness([run]), { nameUseRate: { max: 0.04 } });
    expect(vs.nameUseRate).toEqual({ value: 0.5, min: null, max: 0.04, ok: false });
  });
});
