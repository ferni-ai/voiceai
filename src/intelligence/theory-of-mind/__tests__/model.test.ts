import { describe, expect, it } from 'vitest';
import { parseReading, readingPrompt } from '../extract.js';
import { emptyMindModel, type MindModel } from '../types.js';
import { applyCallReading, confidenceOf, isEstablished } from '../update.js';
import { CALL_1, DAY, READING_1, T0 } from './fixtures.js';

/** One finished call: the model's reply parsed and folded in, as the after-call writer does. */
function afterCall(model: MindModel, reply: string, sessionId: string, at: Date): MindModel {
  const reading = parseReading(reply);
  if (!reading) throw new Error('unparseable reading');
  return applyCallReading(model, reading, sessionId, at);
}

const jokes = (m: MindModel) => m.patterns.find((p) => p.key === 'jokes-when-anxious');

describe('theory of mind: folding a call into the model', () => {
  it('keeps told topics, a pattern with two moments, and a time-bounded mood', () => {
    const model = afterCall(emptyMindModel('u1', T0), READING_1, 's1', T0);
    expect(model.calls).toBe(1);
    expect(model.toldFerni.map((t) => t.topic)).toEqual([
      'Stripe interview on Monday',
      'landlord is selling their building',
    ]);
    expect(jokes(model)?.moments).toHaveLength(2);
    expect(isEstablished(jokes(model)!)).toBe(true);
    // One moment is a hunch, not a pattern.
    const sympathy = model.patterns.find((p) => p.key === 'practical-over-sympathy');
    expect(isEstablished(sympathy!)).toBe(false);
    expect(model.current?.until).toBe(new Date(T0.getTime() + 5 * DAY).toISOString());
  });

  it('builds on the next call, and a contradiction takes confidence back', () => {
    const first = afterCall(emptyMindModel('u1', T0), READING_1, 's1', T0);
    const again = JSON.stringify({
      told: ['Stripe interview on Monday'],
      observations: [
        {
          key: 'jokes-when-anxious',
          kind: 'coping',
          statement: 'jokes when anxious',
          cue: 'joked about a car breaking down before asking what to do',
        },
      ],
    });
    const second = afterCall(first, again, 's2', new Date(T0.getTime() + 3 * DAY));
    expect(jokes(second)?.moments).toHaveLength(3);
    expect(jokes(second)!.confidence).toBeGreaterThan(jokes(first)!.confidence);
    expect(second.toldFerni).toHaveLength(2); // told again, not duplicated
    expect(second.calls).toBe(2);

    const against = JSON.stringify({ contradicted: ['jokes-when-anxious'] });
    const third = afterCall(second, against, 's3', new Date(T0.getTime() + 6 * DAY));
    expect(jokes(third)?.contradictions).toBe(1);
    expect(jokes(third)!.confidence).toBeLessThan(jokes(second)!.confidence);
  });

  it('drops a pattern contradicted until nothing supports it', () => {
    let model = afterCall(emptyMindModel('u1', T0), READING_1, 's1', T0);
    const against = JSON.stringify({ contradicted: ['jokes-when-anxious'] });
    model = afterCall(model, against, 's2', new Date(T0.getTime() + DAY));
    expect(jokes(model)).toBeDefined();
    model = afterCall(model, against, 's3', new Date(T0.getTime() + 2 * DAY));
    expect(jokes(model)).toBeUndefined();
  });

  it('lets a mood expire instead of carrying it forever', () => {
    let model = afterCall(emptyMindModel('u1', T0), READING_1, 's1', T0);
    model = afterCall(
      model,
      JSON.stringify({ told: ['a new job'] }),
      's2',
      new Date(T0.getTime() + 2 * DAY)
    );
    expect(model.current?.state).toBe('anxious about the Stripe interview');
    model = afterCall(
      model,
      JSON.stringify({ told: ['a trip'] }),
      's3',
      new Date(T0.getTime() + 9 * DAY)
    );
    expect(model.current).toBeUndefined();
  });

  it('weights moments from different calls above repeats in one call', () => {
    const at = T0.toISOString();
    const m = (sessionId: string, cue: string) => ({ sessionId, at, cue });
    const oneCall = { moments: [m('a', 'x'), m('a', 'y')], contradictions: 0 };
    const twoCalls = { moments: [m('a', 'x'), m('b', 'y')], contradictions: 0 };
    expect(confidenceOf(twoCalls)).toBeGreaterThan(confidenceOf(oneCall));
    expect(confidenceOf({ ...twoCalls, contradictions: 2 })).toBe(0);
  });
});

describe('theory of mind: reading a call', () => {
  it('keeps only well-formed, label-free observations', () => {
    const r = parseReading(
      JSON.stringify({
        told: ['their sister Priya', 42, ''],
        observations: [
          {
            key: 'jokes-when-anxious',
            kind: 'coping',
            statement: 'jokes when anxious',
            cue: 'a joke after bad news',
          },
          { key: 'Bad Key!', kind: 'coping', statement: 's', cue: 'c' },
          { key: 'sad', kind: 'mood', statement: 's', cue: 'c' },
          {
            key: 'low',
            kind: 'feeling',
            statement: 'probably has depression',
            cue: 'sounded flat',
          },
        ],
        contradicted: ['jokes-when-anxious', 'NOT A KEY'],
        current: null,
        sensitivities: [
          { topic: 'their ex', how: "doesn't want to talk about it" },
          { topic: 'x' },
        ],
      })
    );
    expect(r?.told).toEqual(['their sister Priya']);
    expect(r?.observations.map((o) => o.key)).toEqual(['jokes-when-anxious']);
    expect(r?.contradicted).toEqual(['jokes-when-anxious']);
    expect(r?.current).toBeUndefined();
    expect(r?.sensitivities).toEqual([{ topic: 'their ex', how: "doesn't want to talk about it" }]);
    expect(parseReading('no json here')).toBeNull();
  });

  it('shows the model what is already believed, so a later call reuses the key', () => {
    const model = afterCall(emptyMindModel('u1', T0), READING_1, 's1', T0);
    const p = readingPrompt(CALL_1, null, model);
    expect(p).toContain(
      '- jokes-when-anxious (coping): jokes when anxious, then wants practical help'
    );
    expect(p).toContain(
      'Already told: Stripe interview on Monday; landlord is selling their building'
    );
    expect(p).toContain("CALLER: Please don't do the sympathy thing.");
    expect(readingPrompt(CALL_1, null, emptyMindModel('u1', T0))).toContain('(nothing yet)');
  });
});
