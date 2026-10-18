import { describe, expect, it } from 'vitest';
import { DEFAULT_META, toFollowUpMeta } from '../follow-through-meta-store.js';

const NOW = new Date('2026-10-18T15:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

describe('toFollowUpMeta', () => {
  it('reads a missing document as the defaults: prior Beta(2,1), nothing asked, no plan', () => {
    expect(toFollowUpMeta(undefined)).toEqual(DEFAULT_META);
    expect(DEFAULT_META.appetite).toMatchObject({ alpha: 2, beta: 1 });
  });

  it('keeps each good field and drops each bad one on its own', () => {
    const meta = toFollowUpMeta({
      appetite: { alpha: 5, beta: -1, updatedAt: 'not a time' },
      asksLast7d: [ago(1), 'yesterday', 7, ago(3)],
      suppressedTopics: [
        { topicKey: 'interview', until: ago(-30) },
        { topicKey: '', until: ago(-1) },
      ],
      plan: {
        threadId: 't1',
        askType: 'how-did-it-go',
        line: 'x',
        why: 'y',
        validFrom: ago(0),
        validUntil: ago(-1),
        computedAt: ago(0),
      },
      updatedAt: ago(0),
    });
    expect(meta.appetite).toEqual({ alpha: 5, beta: 1, updatedAt: null });
    expect(meta.asksLast7d).toEqual([ago(3), ago(1)]);
    expect(meta.suppressedTopics).toEqual([{ topicKey: 'interview', until: ago(-30) }]);
    expect(meta.plan?.threadId).toBe('t1');
    expect(toFollowUpMeta({ plan: { threadId: 't1', askType: 'interrogate' } }).plan).toBeNull();
  });
});
