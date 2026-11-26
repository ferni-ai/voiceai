import { describe, expect, it } from 'vitest';
import { computeHumanness } from '../humanness.mjs';
import { humannessValue } from '../nightly/humanness-bar.mjs';

// A synthetic call (fictional names): Ferni greets, then answers four caller turns.
const call = (replies) => {
  const lines = [
    'My brother Dario is moving to Lisbon.',
    'I finally finished the bookshelf.',
    'Work was a mess today.',
    'My cat knocked over the plant again.',
  ];
  const events = [{ who: 'agent', text: 'Hey, good to hear you.', t: 100 }];
  replies.forEach((r, i) => {
    events.push({ who: 'user', text: lines[i], t: 1000 * (i + 1) });
    events.push({ who: 'agent', text: r, t: 1000 * (i + 1) + 500 });
  });
  return { userSpeech: [[900, 950]], events };
};

describe('receiptRate', () => {
  it('counts replies that open on a reaction or on the caller’s own word', () => {
    const m = computeHumanness([
      call([
        'Wait, Lisbon? That is a big move.',
        'Oh nice, the whole thing?',
        "I'm sorry, that sounds rough.",
        'Anyway, how was your weekend?',
      ]),
    ]);
    expect(m.receiptRate).toBe(0.5);
    expect(m.stockOpenerRate).toBe(0.25);
  });

  it('never counts a stock receipt, even one that repeats their word', () => {
    const m = computeHumanness([
      call(['That sounds like Lisbon is far.', 'Got it.', 'I see.', 'Sounds good.']),
    ]);
    expect(m.receiptRate).toBe(0);
    expect(m.stockOpenerRate).toBe(1);
  });

  it('sees a stock receipt behind a reaction word or a curly apostrophe', () => {
    const m = computeHumanness([
      call([
        "Oh, I'm sorry, that's a lot.",
        'I\u2019m so sorry.',
        'Oh, I see.',
        'Oh no, the plant?',
      ]),
    ]);
    expect(m.receiptRate).toBe(0.25);
    expect(m.stockOpenerRate).toBe(0.75);
  });

  it('leaves out goodbyes', () => {
    const m = computeHumanness([call(['Wow, Lisbon.', 'Okay, take care.'])]);
    expect(m.receiptRate).toBe(1);
  });
});

describe('humannessValue (the nightly metric)', () => {
  it('reads one field over the recorded runs', () => {
    const runs = [{ run: call(['Huh, Lisbon?', 'You did? How long did it take?']) }];
    expect(humannessValue(runs, 'receiptRate')).toEqual({ value: 0.5, n: 2 });
    expect(humannessValue(runs, 'questionEndRate').value).toBe(1);
  });

  it('skips an event with no text instead of failing the night', () => {
    const run = call(['Huh, Lisbon?']);
    run.events.push({ who: 'agent', t: 9000 });
    expect(humannessValue([{ run }], 'receiptRate')).toEqual({ value: 1, n: 1 });
  });

  it('is no data without a recording or a field', () => {
    expect(humannessValue([{ run: null }], 'receiptRate')).toEqual({ value: null, n: 0 });
    expect(humannessValue([{ run: call(['Oh.']) }], undefined)).toEqual({ value: null, n: 0 });
  });
});
