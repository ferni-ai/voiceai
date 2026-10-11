import { describe, expect, it } from 'vitest';
import { agentLines, repliesAfter, type EvalRun } from '../live/transcript.js';
import { PERSONAS } from '../live/personas.js';

// The shape of a real run (out/ponder-quiet-3): captions grow word by word.
const run: EvalRun = {
  events: [
    { t: 100, who: 'agent', text: 'Hey Sam,' },
    { t: 150, who: 'agent', text: 'Hey Sam, how is Biscuit?' },
    { t: 500, who: 'user', text: "Hey, it's me again." },
    { t: 900, who: 'agent', text: 'Good to hear you.' },
    { t: 1500, who: 'user', text: 'Where do I work?' },
    { t: 2100, who: 'agent', text: 'At Denver' },
    { t: 2200, who: 'agent', text: 'At Denver Health, right?' },
  ],
  results: [{ userEndedAt: 600 }, { userEndedAt: 1700 }],
};

describe('reading a live run', () => {
  it("takes Ferni's opener before the caller speaks, without repeating growing captions", () => {
    expect(agentLines(run, -Infinity, 500)).toBe('Hey Sam, how is Biscuit?');
  });

  it('pairs each scripted line with what Ferni said before the next one ended', () => {
    expect(repliesAfter(run)).toEqual(['Good to hear you.', 'At Denver Health, right?']);
  });
});

describe('personas', () => {
  it('every persona has history calls, an opener and a quiz', () => {
    for (const p of PERSONAS) {
      expect(p.calls.length, p.id).toBeGreaterThan(1);
      expect(p.quiz.length, p.id).toBeGreaterThan(4);
      expect(p.opener, p.id).toMatch(/right:.*wrong:/);
    }
  });
});
