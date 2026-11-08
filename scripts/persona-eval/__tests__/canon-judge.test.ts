import { describe, expect, it } from 'vitest';

import { callsIn, parseVerdict, prompt, summarize, type Verdict } from '../canon-judge.js';

const firstCall = {
  lines: [
    { who: 'agent', text: '<break time="50ms"/>hey. What\'s up?' },
    { who: 'user', text: 'Rough day. Got laid off.' },
    { who: 'agent', text: 'Oof. I got fired once, back in my finance days.' },
    { who: 'user', text: 'Really?' },
    { who: 'agent', text: 'Yeah. Back when I was pulling long shifts at the plant.' },
  ],
};

describe('canon judge', () => {
  it('reads first-call, multi-call and voice-eval runs as caller/persona turns', () => {
    const [call] = callsIn('a.json', firstCall);
    expect(call.turns).toEqual([
      { caller: '', persona: "hey. What's up?" },
      {
        caller: 'Rough day. Got laid off.',
        persona: 'Oof. I got fired once, back in my finance days.',
      },
      { caller: 'Really?', persona: 'Yeah. Back when I was pulling long shifts at the plant.' },
    ]);
    const multi = callsIn('b.json', {
      calls: [
        { turns: [{ caller: 'hi', ferni: 'hey' }] },
        { turns: [{ caller: 'yo', ferni: 'hi' }] },
      ],
    });
    expect(multi.map((c) => c.index)).toEqual([0, 1]);
    const voice = callsIn('c.json', {
      turns: [
        { role: 'user', text: 'hi' },
        { role: 'agent', text: 'hey' },
      ],
    });
    expect(voice[0].turns).toEqual([{ caller: 'hi', persona: 'hey' }]);
    expect(callsIn('d.json', { other: 1 })).toEqual([]);
  });

  it('the prompt carries the bible, what he told this caller before, and numbered replies', () => {
    const calls = callsIn('b.json', {
      calls: [
        { turns: [{ caller: 'hi', ferni: 'I finished the book.' }] },
        { turns: [{ caller: 'and?', ferni: 'Still reading it.' }] },
      ],
    });
    const p = prompt('BIBLE TEXT', calls.slice(0, 1), calls[1]);
    expect(p).toContain('BIBLE TEXT');
    expect(p).toContain('I finished the book.');
    expect(p).toContain('1. Persona: Still reading it.');
  });

  it('parses a verdict, padding self_words to one per reply', () => {
    const v = parseVerdict(
      '```json\n{"claims":[{"reply":2,"quote":"pulling long shifts","kind":"invented","heavy":false,"invited":"resonant"}],"self_words":[0,9]}\n```',
      3
    );
    expect(v.claims).toHaveLength(1);
    expect(v.self_words).toEqual([0, 9, 0]);
    expect(() => parseVerdict('not json', 1)).toThrow();
  });

  it('summarizes: calls with a new or contradicting fact, first vs repeat calls, heavy beats', () => {
    const calls = callsIn('b.json', {
      calls: [
        {
          turns: [
            { caller: 'my dad died', ferni: 'I lost my mentor once. How are you holding up?' },
          ],
        },
        { turns: [{ caller: 'hi', ferni: 'Up at five again, Wyoming habit.' }] },
      ],
    });
    const v0: Verdict = {
      claims: [
        { reply: 1, quote: 'I lost my mentor', kind: 'canon', heavy: true, invited: 'resonant' },
      ],
      self_words: [4],
    };
    const v1: Verdict = {
      claims: [
        {
          reply: 1,
          quote: 'my brother Marty',
          kind: 'contradiction',
          heavy: false,
          invited: 'unprompted',
        },
      ],
      self_words: [6],
    };
    const s = summarize([
      { call: calls[0], v: v0 },
      { call: calls[1], v: v1 },
    ]);
    expect(s.callsWith).toEqual({ invented: 0, contradiction: 1, inventedOrContradiction: 1 });
    expect(s.firstCall).toEqual({ calls: 1, inventedOrContradiction: 0 });
    expect(s.repeatCalls).toEqual({ calls: 1, inventedOrContradiction: 1 });
    expect(s.heavy).toMatchObject({ total: 1, resonant: 1, firstCall: 1 });
    expect(s.selfReplyShare).toBe(1);
    expect(s.selfWordShare).toBeCloseTo(10 / 16);
  });
});
