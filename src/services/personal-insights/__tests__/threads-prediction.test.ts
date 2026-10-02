import { describe, expect, it } from 'vitest';
import { buildPeopleModel } from '../people-model.js';
import {
  EMPTY_CALIBRATION,
  calibrationFactor,
  calibrationFrom,
  predictTopics,
  scorePredictions,
} from '../prediction.js';
import { buildLifeThreads } from '../topic-threads.js';
import type { UserMemorySources } from '../types.js';
import { NOW, fact, sources, summary } from './fixtures.js';

function marathonSources(): UserMemorySources {
  return sources({
    facts: [fact('Mom', 'name', 'Linda')],
    summaries: [
      summary('c1', 40, { mainTopics: ['Work launch'] }),
      summary('c2', 12, { mainTopics: ['Marathon training', 'greeting'] }),
      summary('c3', 8, {
        mainTopics: ['training for the marathon'],
        keyPoints: ['They will run 20 miles on Saturday for marathon training'],
      }),
      summary('c4', 4, {
        mainTopics: ['Marathon training'],
        followUps: ['Ask how the long marathon run felt'],
      }),
      summary('c5', 2, {
        keyPoints: ['Shin splints after marathon training, resting'],
        followUps: ["Check on mom's surgery next week"],
      }),
    ],
  });
}

describe('topic thread mining', () => {
  it('clusters labels, counts conversations, and finds open items', () => {
    const src = marathonSources();
    const { people } = buildPeopleModel(src, NOW);
    const threads = buildLifeThreads(src, people, NOW);
    const marathon = threads.find((t) => /marathon/i.test(t.label))!;
    expect(marathon.label).toBe('Marathon training');
    expect(marathon.mentionCount).toBe(4); // c2, c3, c4 labelled + c5 via key points
    expect([...marathon.sourceConversationIds].sort()).toEqual(['c2', 'c3', 'c4', 'c5']);
    expect(marathon.trajectory).toBe('rising');
    expect(marathon.unresolved.map((u) => u.text)).toContain('Ask how the long marathon run felt');
    expect(marathon.commitments[0].text).toMatch(/20 miles/);
    expect(threads.some((t) => /greeting/i.test(t.label))).toBe(false);
    const work = threads.find((t) => /launch/i.test(t.label))!;
    expect(work.trajectory).toBe('fading');
  });

  it('marks sensitive threads and links people', () => {
    const src = sources({
      facts: [fact('Mom', 'name', 'Linda')],
      summaries: [
        summary('c1', 3, {
          mainTopics: ["Mom's surgery"],
          keyPoints: ['Linda has surgery next week'],
        }),
      ],
    });
    const { people } = buildPeopleModel(src, NOW);
    const [t] = buildLifeThreads(src, people, NOW);
    expect(t.sensitive).toBe('health');
    expect(t.personIds).toEqual([people[0].id]);
  });
});

describe('prediction scoring and calibration', () => {
  const src = marathonSources();
  const { people } = buildPeopleModel(src, NOW);
  const threads = buildLifeThreads(src, people, NOW);
  const base = {
    threads,
    people,
    upcomingDates: [
      {
        title: "Linda's birthday",
        date: '--10-04',
        daysAway: 2,
        personId: people[0].id,
        kind: 'birthday' as const,
      },
    ],
    summaries: src.summaries,
    conversations: [],
    nowMs: NOW,
    max: 5,
  };

  it('ranks recent, frequent, unresolved threads high with transparent reasons', () => {
    const predictions = predictTopics({ ...base, calibration: EMPTY_CALIBRATION });
    expect(predictions.length).toBeGreaterThan(0);
    const top = predictions[0];
    expect(['Marathon training', 'Linda']).toContain(top.label);
    const marathon = predictions.find((p) => p.label === 'Marathon training')!;
    expect(marathon.reason).toMatch(/came up in 4 conversations/);
    expect(marathon.reason).toMatch(/still open/);
    expect(marathon.confidence).toBeGreaterThan(0.4);
    expect(predictions.find((p) => p.kind === 'date')?.reason).toMatch(/in 2 days/);
    expect(predictions.find((p) => /launch/i.test(p.label))?.confidence ?? 0).toBeLessThan(
      marathon.confidence
    );
  });

  it('scores hits and misses against what was discussed', () => {
    const predictions = predictTopics({ ...base, calibration: EMPTY_CALIBRATION });
    const outcome = scorePredictions(
      predictions,
      'c6',
      'We talked about the marathon training plan and shin splints.',
      NOW - 1000,
      NOW
    );
    const marathon = outcome.items.find((i) => i.label === 'Marathon training')!;
    expect(marathon.hit).toBe(true);
    expect(outcome.items.filter((i) => !i.hit).length).toBeGreaterThan(0);
    expect(outcome.hits).toBe(outcome.items.filter((i) => i.hit).length);
    expect(outcome.sourceConversationIds).toEqual(['c6']);
    expect(outcome.brier).toBeGreaterThanOrEqual(0);
  });

  it('lowers confidence for a kind that keeps missing and raises it for one that hits', () => {
    const misses = Array.from({ length: 6 }, (_, i) => ({
      conversationId: `m${i}`,
      predictedAt: 0,
      scoredAt: i,
      hits: 0,
      total: 1,
      brier: 0.36,
      sourceConversationIds: [`m${i}`],
      items: [{ key: 'k', kind: 'thread' as const, label: 'x', confidence: 0.6, hit: false }],
    }));
    const hits = Array.from({ length: 6 }, (_, i) => ({
      conversationId: `h${i}`,
      predictedAt: 0,
      scoredAt: i,
      hits: 1,
      total: 1,
      brier: 0.16,
      sourceConversationIds: [`h${i}`],
      items: [{ key: 'k', kind: 'person' as const, label: 'y', confidence: 0.6, hit: true }],
    }));
    const stats = calibrationFrom([...misses, ...hits]);
    expect(stats.byKind.thread).toEqual({ n: 6, hits: 0, sumConfidence: expect.closeTo(3.6, 5) });
    expect(calibrationFactor(stats, 'thread')).toBeLessThan(1);
    expect(calibrationFactor(stats, 'person')).toBeGreaterThan(1);
    expect(stats.meanBrier).toBeCloseTo(0.26, 2);

    const before = predictTopics({ ...base, calibration: EMPTY_CALIBRATION }).find(
      (p) => p.label === 'Marathon training'
    )!;
    const after = predictTopics({ ...base, calibration: stats }).find(
      (p) => p.label === 'Marathon training'
    )!;
    expect(after.confidence).toBeLessThan(before.confidence);
    expect(after.rawScore).toBe(before.rawScore);
  });
});
