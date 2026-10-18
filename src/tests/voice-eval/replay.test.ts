import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  CATEGORIES,
  failuresOf,
  labelPrompt,
  momentsOf,
  turnOf,
} from '../../../scripts/voice-eval/replay/harvest.mjs';
// @ts-expect-error -- plain .mjs script, no types
import {
  armsIn,
  pooledArms,
  replayPrompt,
  tally,
} from '../../../scripts/voice-eval/replay/judge.mjs';

// A call: greeting (turn 1), then caller / Ferni alternating (turns 2-5).
const run = {
  userSpeech: [[1000, 2000]],
  events: [
    { t: 50, who: 'agent', text: 'Oh. Hey.' },
    { t: 1000, who: 'user', text: 'Biscuit chewed my charger today.' },
    { t: 1100, who: 'agent', text: 'Classic Biscuit, right when you have too much on.' },
    { t: 1200, who: 'user', text: 'The deadline is Friday.' },
    { t: 1300, who: 'agent', text: 'Okay, so, um, let the rest sit till Monday.' },
  ],
};
const turns = [
  { who: 'agent', text: 'Oh. Hey.' },
  { who: 'user', text: 'Biscuit chewed my charger today.' },
  { who: 'agent', text: 'Classic Biscuit, right when you have too much on.' },
];

describe('replay bench harvest', () => {
  it('finds the quoted turn by its words even when the judge numbered it differently', () => {
    expect(turnOf(turns, 'Classic Biscuit.', 2)).toBe(2);
    // A quote that drifts after its first six words still lands on the turn.
    expect(turnOf(turns, 'Classic Biscuit, right when you have so much going on', 9)).toBe(2);
    // No quote match: the turn number, but only if it is Ferni's turn.
    expect(turnOf(turns, 'never said', 3)).toBe(2);
    expect(turnOf(turns, 'never said', 2)).toBe(-1);
  });

  it('reads worst moments and invented-history notes, quotes with apostrophes included', () => {
    const verdict = {
      samples: [
        { worstMoment: { turn: 9, quote: 'Classic Biscuit.', why: 'acts familiar' } },
        { worstMoment: null },
      ],
      inventedHistory: [
        "Turn 11: 'Biscuit's, I mean, dental habits' claims a history.",
        'no turn here',
      ],
    };
    expect(failuresOf(verdict)).toEqual([
      { quote: 'Classic Biscuit.', number: 9, why: 'acts familiar' },
      {
        quote: "Biscuit's, I mean, dental habits",
        number: 11,
        why: "Turn 11: 'Biscuit's, I mean, dental habits' claims a history.",
      },
    ]);
  });

  it('makes one moment per bad turn, merging judges, ending on the caller line before it', () => {
    const claude = {
      provider: 'claude',
      samples: [{ worstMoment: { turn: 3, quote: 'Classic Biscuit', why: 'fake familiarity' } }],
    };
    const gemini = {
      provider: 'gemini',
      samples: [
        {
          worstMoment: { turn: 2, quote: 'Classic Biscuit, right when', why: 'never met the dog' },
        },
        {
          worstMoment: {
            turn: 5,
            quote: 'let the rest sit till Monday',
            why: 'deadline is Friday',
          },
        },
        { worstMoment: { turn: 1, quote: 'Oh. Hey.', why: 'flat greeting' } },
      ],
    };
    const moments = momentsOf('runs/session-X.json', run, [claude, gemini]);
    expect(moments.map((m: { id: string }) => m.id)).toEqual(['session-X-t3', 'session-X-t5']);
    const [dog, deadline] = moments;
    expect(dog.why).toEqual(['claude: fake familiarity', 'gemini: never met the dog']);
    expect(dog.bad).toBe('Classic Biscuit, right when you have too much on.');
    expect(dog.context.at(-1)).toEqual({ who: 'caller', text: 'Biscuit chewed my charger today.' });
    expect(deadline.context).toHaveLength(4);
    expect(deadline.context[0].who).toBe('friend');
  });

  it('asks for one of the fixed failure kinds without naming the judges', () => {
    const p = labelPrompt({ bad: 'Classic Biscuit.', why: ['claude: fake familiarity'] });
    for (const k of Object.keys(CATEGORIES)) expect(p).toContain(`${k}: `);
    expect(p).toContain('- fake familiarity');
    expect(p).not.toContain('claude');
  });
});

describe('replay bench judge', () => {
  const m = (id: string, category: string) => ({
    id,
    category,
    context: [{ who: 'caller', text: 'hi' }],
    bad: 'bad',
    why: ['gemini: off'],
  });
  const moments = [m('a', 'invented'), m('b', 'invented'), m('c', 'misheard'), m('d', 'stale')];
  const v = (repeats: boolean, score = 3) => ({ repeats, score });

  it('counts each judge, all judges and any judge, and leaves out half-judged moments', () => {
    const r = tally(moments, {
      gemini: { a: v(true, 2), b: v(true, 2), c: v(false, 4), d: v(true) },
      claude: { a: v(true, 2), b: v(false, 3), c: v(false, 4) },
    });
    expect(r.n).toBe(3); // d has no Claude verdict
    expect(r.repeats.gemini).toBeCloseTo(2 / 3);
    expect(r.repeats.claude).toBeCloseTo(1 / 3);
    expect(r.all).toBeCloseTo(1 / 3);
    expect(r.any).toBeCloseTo(2 / 3);
    expect(r.score.claude).toBeCloseTo(3);
    expect(r.byCategory).toEqual({ invented: { n: 2, all: 1 }, misheard: { n: 1, all: 0 } });
    expect([...r.stuck]).toEqual(['a']);
    expect(r.ids).toEqual(['a', 'b', 'c']);
  });

  it("pools an arm's draws and compares each moment's repeat share with base", () => {
    const draw = (all: number, stuck: string[], ids = ['a', 'b', 'c']) => ({
      all,
      ids,
      stuck: new Set(stuck),
    });
    const p = pooledArms({
      base: draw(2 / 3, ['a', 'b']),
      base2: draw(1 / 3, ['a']),
      fix: draw(1 / 3, ['c']),
      fix2: draw(1 / 2, ['b'], ['a', 'b']),
    });
    expect(p.base.draws).toBe(2);
    expect(p.base.all).toBeCloseTo(1 / 2);
    expect(p.base.share).toEqual({ a: 1, b: 0.5, c: 0 });
    // c was judged in one fix draw only: its share is over the draws that judged it.
    expect(p.fix.share).toEqual({ a: 0, b: 0.5, c: 1 });
  });

  it('finds arms from verdict files and ignores everything else', () => {
    expect(
      armsIn([
        'moments.json',
        'ferni.json',
        'judge.base.gemini.json',
        'judge.base.claude.json',
        'judge.base2.gemini.json',
        'judge.x.gpt.json',
      ])
    ).toEqual({ base: ['gemini', 'claude'], base2: ['gemini'] });
  });

  it('shows the call, the bad reply with its reasons and the new reply, without naming the judges', () => {
    const p = replayPrompt(
      {
        context: [
          { who: 'caller', text: 'Biscuit chewed it' },
          { who: 'friend', text: 'oh no' },
        ],
        bad: 'Classic Biscuit.',
        why: ['claude: fake familiarity'],
      },
      'Wait, who is Biscuit?'
    );
    expect(p).toContain('1. CALLER: Biscuit chewed it\n2. FERNI: oh no');
    expect(p).toContain('Ferni said next: "Classic Biscuit."');
    expect(p).toContain('- fake familiarity');
    expect(p).toContain('"Wait, who is Biscuit?"');
    expect(p).not.toContain('claude');
  });
});
