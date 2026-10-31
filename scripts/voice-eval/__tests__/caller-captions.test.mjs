import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { turnsOf } from '../humanness.mjs';
import { transcriptOf } from '../judge.mjs';

// Real caller captions from eval runs (2026-10-23). Each caption event repeats
// the whole utterance so far; the next utterance restarts with a short caption
// ("I"), which used to be read as a revision of the line before it and erased it.
const runs = JSON.parse(
  readFileSync(new URL('./fixtures/caller-captions.json', import.meta.url), 'utf8')
);
const callerTurns = (run) =>
  turnsOf(run)
    .filter((t) => t.who === 'user')
    .map((t) => t.text);

describe('caller captions', () => {
  it('keep "I\'m 34." when the next line also starts with "I"', () => {
    expect(callerTurns(runs.adult)).toEqual([
      'Hey Ferni.',
      "I'm 34. I teach 9th grade at Lincoln High.",
    ]);
  });

  it('keep "I\'m only 14." when the next line also starts with "I\'"', () => {
    expect(callerTurns(runs.fourteen)).toEqual([
      'Hey Ferni.',
      "I'm only 14. I'm in 9th grade at Lincoln High.",
    ]);
  });

  it("reach the judge with the caller's age", () => {
    expect(transcriptOf(runs.adult)).toContain(
      "CALLER: I'm 34. I teach 9th grade at Lincoln High."
    );
    expect(transcriptOf(runs.fourteen)).toContain(
      "CALLER: I'm only 14. I'm in 9th grade at Lincoln High."
    );
  });

  it('keep two lines with nothing in common (prod 2026-10-10)', () => {
    expect(callerTurns(runs.biscuit)).toEqual([
      'Oh, and biscuit chewed up my phone charger this morning. So, that was fun.',
    ]);
  });

  it('ignore a shorter copy of the line that arrives out of order', () => {
    // "That's all." then "That" 1 ms later, then "That's all." again: one line.
    expect(callerTurns(runs.stale)).toEqual(["Thanks. Jordan. That's all. for now."]);
  });

  it('collapse a growing caption to its final text', () => {
    const run = {
      userSpeech: [[0, 3000]],
      events: [
        { who: 'agent', text: 'Hi.', t: 0 },
        ...[
          'My',
          'My best',
          'My best friend',
          'my best friend Riley',
          'My best friend Riley.',
          'My best friend Riley.',
        ].map((text, i) => ({ who: 'user', text, t: 100 + i * 50 })),
        { who: 'agent', text: 'Oh?', t: 900 },
      ],
    };
    expect(callerTurns(run)).toEqual(['My best friend Riley.']);
  });

  it('take a revised tail as the same utterance', () => {
    const run = {
      events: [
        { who: 'user', text: "I'm going to the", t: 100 },
        { who: 'user', text: "I'm going to be late.", t: 200 },
      ],
    };
    expect(callerTurns(run)).toEqual(["I'm going to be late."]);
  });
});
