import { describe, expect, it } from 'vitest';
import { turnsOf } from '../humanness.mjs';
import { transcriptOf } from '../judge.mjs';

// Ferni picks up and asks about the running before the caller has said a word.
const run = {
  userSpeech: [[500, 1500]],
  events: [
    { who: 'agent', text: "Hey Sam. How'd the running go this week?", t: 100 },
    { who: 'user', text: "Hey Ferni, it's me.", t: 600 },
    { who: 'agent', text: 'Good to hear you.', t: 900 },
  ],
};

describe('the greeting', () => {
  it('is left out of the per-turn numbers', () => {
    expect(turnsOf(run).map((t) => t.text)).toEqual(["Hey Ferni, it's me.", 'Good to hear you.']);
  });

  it('is kept, and marked, when asked for', () => {
    const turns = turnsOf(run, { greeting: true });
    expect(turns.map((t) => t.text)).toEqual([
      "Hey Sam. How'd the running go this week?",
      "Hey Ferni, it's me.",
      'Good to hear you.',
    ]);
    expect(turns.map((t) => t.greeting === true)).toEqual([true, false, false]);
  });

  it('reaches the judge as the first turn', () => {
    expect(transcriptOf(run).split('\n')).toEqual([
      "1. FERNI (answering the call): Hey Sam. How'd the running go this week?",
      "2. CALLER: Hey Ferni, it's me.",
      '3. FERNI: Good to hear you.',
    ]);
  });
});
