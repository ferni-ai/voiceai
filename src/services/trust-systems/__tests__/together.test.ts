/**
 * The together reads say only what the records show: a missing signal leaves
 * its factor or observation out instead of standing in a default.
 */

import { describe, expect, it } from 'vitest';
import type { EmotionalSnapshot } from '../sentiment-timeline.js';
import { computeTogetherHealth } from '../together-health.js';
import { computeNoticedNote } from '../together-noticed.js';
import { localClock, type PromiseRecord, type TogetherSignals } from '../together-signals.js';

const NOW = new Date('2026-10-04T16:00:00Z');
const NY = localClock('America/New_York');

let n = 0;
function snap(iso: string, valence: number, topic?: string): EmotionalSnapshot {
  return {
    id: `s${n++}`,
    timestamp: new Date(iso),
    primaryEmotion: valence > 0 ? 'joy' : valence < 0 ? 'sadness' : 'neutral',
    secondaryEmotions: [],
    intensity: Math.abs(valence),
    valence,
    arousal: 0.5,
    source: 'detected',
    ...(topic ? { context: { topic } } : {}),
  };
}

/** One evening call (local 8pm New York) per day, lighter at the end. */
function evenings(days: string[], start = -0.1, end = 0.4): EmotionalSnapshot[] {
  return days.flatMap((d) => [
    snap(`${d}T20:00:00-04:00`, start),
    snap(`${d}T20:20:00-04:00`, end),
  ]);
}

function signals(partial: Partial<TogetherSignals>): TogetherSignals {
  return { snapshots: [], promises: [], lifeEvents: [], ...partial };
}

const promise = (id: string, outcome: 'open' | 'kept' | 'broken'): PromiseRecord => ({
  id,
  text: "I'll check in about that",
  madeAt: new Date('2026-09-20T12:00:00Z'),
  fulfilled: outcome === 'kept',
  violated: outcome === 'broken',
  resolvedAt: outcome === 'open' ? undefined : new Date('2026-09-28T12:00:00Z'),
});

describe('computeTogetherHealth', () => {
  it('has nothing to say with no history', () => {
    const h = computeTogetherHealth(signals({}), NOW, NY);
    expect(h).toMatchObject({ state: 'none', score: null, factors: [] });
  });

  it('is just getting started at two days, and gives a score from the third', () => {
    const two = computeTogetherHealth(
      signals({ snapshots: evenings(['2026-10-01', '2026-10-02']) }),
      NOW,
      NY
    );
    expect(two).toMatchObject({ state: 'getting-started', score: null, stage: null, factors: [] });
    const three = computeTogetherHealth(
      signals({ snapshots: evenings(['2026-09-30', '2026-10-01', '2026-10-02']) }),
      NOW,
      NY
    );
    expect(three.state).toBe('ready');
    expect(typeof three.score).toBe('number');
  });

  it('counts only promises with a known outcome, and leaves the factor out when there are none', () => {
    const snapshots = evenings(['2026-09-30', '2026-10-01', '2026-10-02']);
    const open = computeTogetherHealth(
      signals({ snapshots, promises: [promise('p1', 'open')] }),
      NOW,
      NY
    );
    expect(open.factors.map((f) => f.id)).not.toContain('promises');

    const mixed = computeTogetherHealth(
      signals({
        snapshots,
        promises: [promise('p1', 'open'), promise('p2', 'kept'), promise('p3', 'broken')],
      }),
      NOW,
      NY
    );
    const f = mixed.factors.find((x) => x.id === 'promises');
    expect(f).toMatchObject({
      detail: { kept: 1, total: 2 },
      score: 50,
      tone: 'mid',
      evidence: ['p2', 'p3'],
    });
  });

  it('leaves mood out without three moments in each window, instead of calling it steady', () => {
    const h = computeTogetherHealth(
      signals({ snapshots: evenings(['2026-10-01', '2026-10-02', '2026-10-03']) }),
      NOW,
      NY
    );
    expect(h.factors.map((f) => f.id)).toEqual(['rhythm', 'lift']);
  });

  it('has no trend when there was nothing to compare with two weeks ago', () => {
    const h = computeTogetherHealth(
      signals({ snapshots: evenings(['2026-09-30', '2026-10-01', '2026-10-02']) }),
      NOW,
      NY
    );
    expect(h.trend).toBeNull();
    expect(h.factors.every((f) => f.trend === null)).toBe(true);
  });

  it("says it's been a while when the last call is over a month old", () => {
    const h = computeTogetherHealth(
      signals({ snapshots: evenings(['2026-08-01', '2026-08-02', '2026-08-03']) }),
      NOW,
      NY
    );
    expect(h.factors.find((f) => f.id === 'rhythm')).toMatchObject({
      tone: 'quiet',
      detail: { days: 0 },
    });
  });
});

describe('computeNoticedNote', () => {
  const month = evenings(['2026-09-13', '2026-09-20', '2026-09-24', '2026-09-27', '2026-10-01']);

  it("notices the time of day and the day of the week only in the user's own time zone", () => {
    const known = computeNoticedNote(signals({ snapshots: month }), 'month', NOW, NY);
    expect(known.insights.map((i) => [i.kind, i.variant])).toContainEqual(['timeOfDay', 'evening']);
    expect(known.insights.find((i) => i.kind === 'favoriteDay')?.params.weekday).toBe(0); // Sunday

    const unknown = computeNoticedNote(
      signals({ snapshots: month }),
      'month',
      NOW,
      localClock(null)
    );
    expect(unknown.insights.map((i) => i.kind)).not.toContain('timeOfDay');
    expect(unknown.insights.map((i) => i.kind)).not.toContain('favoriteDay');
  });

  it('notices a topic that lifts the user only when the topic is in the records', () => {
    const plain = computeNoticedNote(signals({ snapshots: month }), 'month', NOW, NY);
    expect(plain.insights.map((i) => i.kind)).not.toContain('liftTopic');

    const music = [
      snap('2026-09-28T23:00:00Z', 0.7, 'Music'),
      snap('2026-09-30T23:00:00Z', 0.6, 'music'),
    ];
    const withTopics = computeNoticedNote(
      signals({ snapshots: [...month, ...music] }),
      'month',
      NOW,
      NY
    );
    const lift = withTopics.insights.find((i) => i.kind === 'liftTopic');
    expect(lift).toMatchObject({ params: { topic: 'Music' }, evidence: music.map((s) => s.id) });
  });

  it('a week without calls is a short quiet note, not filler', () => {
    const quiet = computeNoticedNote(
      signals({ snapshots: evenings(['2026-09-01', '2026-09-02']) }),
      'week',
      NOW,
      NY
    );
    expect(quiet).toMatchObject({ daysTalked: 0, insights: [] });
  });

  it('notices bouncing back after a hard day, with both days as evidence', () => {
    const hard = snap('2026-09-25T20:00:00-04:00', -0.6);
    const better = snap('2026-09-27T20:00:00-04:00', 0.5);
    const note = computeNoticedNote(signals({ snapshots: [hard, better] }), 'month', NOW, NY);
    expect(note.insights.find((i) => i.kind === 'bounceBack')).toEqual({
      kind: 'bounceBack',
      variant: 'later',
      params: { date: '2026-09-25', days: 2 },
      evidence: [hard.id, better.id],
    });
  });
});
