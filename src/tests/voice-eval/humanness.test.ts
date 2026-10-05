import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import {
  compareToTargets,
  computeHumanness,
  turnsOf,
} from '../../../scripts/voice-eval/humanness.mjs';

const run = (events: Array<[string, string]>) => ({
  userSpeech: [[100, 900]],
  events: [
    { t: 50, who: 'agent', text: 'Hey Sam.' }, // greeting
    ...events.map(([who, text], i) => ({ t: 1000 + i * 100, who, text })),
  ],
});

describe('voice-eval humanness', () => {
  it('builds turns: drops the greeting, keeps the last caller caption, joins agent segments', () => {
    const turns = turnsOf(
      run([
        ['user', 'My'],
        ['user', 'My sister hates surprises.'],
        ['agent', 'Oh no.'],
        ['agent', 'Then tell her the plan.'],
      ])
    );
    expect(turns).toEqual([
      { who: 'user', text: 'My sister hates surprises.', t: 1000 },
      { who: 'agent', text: 'Oh no. Then tell her the plan.', t: 1200 },
    ]);
  });

  it('measures length, questions, stance, repairs and echo per agent turn', () => {
    const m = computeHumanness([
      run([
        ['user', 'My manager moved the deadline to Friday.'],
        ['agent', 'Ugh, Friday?'],
        ['user', 'What should I do first?'],
        [
          'agent',
          "Honestly, I don't know, I think I'd, I'd start with the deadline list. Uh, maybe.",
        ],
        ['user', 'Should I just quit?'],
        ['agent', "Nah, I don't think so. My week was rough too."],
      ]),
    ]);
    expect(m.turns).toBe(3);
    expect(m.shortTurnShare3).toBe(0.33); // "Ugh, Friday?"
    expect(m.questionEndRate).toBe(0.33);
    expect(m.dontKnowRate).toBe(0.33);
    expect(m.opinionRate).toBe(0.33);
    expect(m.disagreeRate).toBe(0.33);
    expect(m.selfRepairRate).toBe(0.33); // "I'd, I'd"
    expect(m.selfDisclosureRate).toBe(0.33); // "My week"
    expect(m.echoRate).toBe(0.33); // "Friday", echoed from the turn just before
    expect(m.filledPausesPer100Words).toBeGreaterThan(0);
  });

  it('does not count look-alike words ("know" is not "now", "dunno" needs the word)', () => {
    const m = computeHumanness([
      run([
        ['user', 'hi'],
        ['agent', 'You know what, I knew it.'],
      ]),
    ]);
    expect(m.dontKnowRate).toBe(0);
    expect(m.disagreeRate).toBe(0);
  });

  it('compares metrics with human ranges', () => {
    const out = compareToTargets(
      { questionEndRate: 0.44, wordsPerTurn: { p50: 31 } },
      {
        questionEndRate: { max: 0.2 },
        'wordsPerTurn.p50': { min: 5, max: 15 },
        missing: { min: 1 },
      }
    );
    expect(out).toEqual({
      questionEndRate: { value: 0.44, min: null, max: 0.2, ok: false },
      'wordsPerTurn.p50': { value: 31, min: 5, max: 15, ok: false },
    });
  });
});
