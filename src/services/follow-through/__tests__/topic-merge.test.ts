import { describe, expect, it } from 'vitest';
import type { NewFollowUp } from '../ports.js';
import { mergeInto, mergeTarget, sameTopic, topicKeyOf } from '../topic-merge.js';
import { followUp } from './fixtures.js';

const NOW = new Date('2026-10-18T15:00:00.000Z');
const DAY = 86_400_000;
const incoming = (over: Partial<NewFollowUp> = {}): NewFollowUp => ({
  userId: 'u1',
  kind: 'thread',
  text: 'mom call',
  dueAt: null,
  zone: 'UTC',
  repeat: null,
  source: { store: 'summaries', ref: 's1:0' },
  topicKey: topicKeyOf('the mom call'),
  ...over,
});
const live = followUp({
  kind: 'commitment',
  text: 'call my mom',
  topicKey: topicKeyOf('call my mom'),
  source: { store: 'commitments', ref: 'c1' },
  createdAt: new Date(NOW.getTime() - DAY).toISOString(),
});

describe('topic keys', () => {
  it('two phrasings of one thread get the same key; a different thread does not match', () => {
    expect(topicKeyOf('Call my mom')).toBe(topicKeyOf('the mom call'));
    expect(sameTopic(topicKeyOf('call mom tuesday'), topicKeyOf('call mom'))).toBe(true);
    expect(sameTopic(topicKeyOf('call the dentist'), topicKeyOf('call mom'))).toBe(false);
  });

  it('matches whole words only: "mommy" is not "mom"', () => {
    expect(sameTopic('mommy', 'mom')).toBe(false);
  });
});

describe('mergeTarget', () => {
  it('joins a live follow-up on the same topic from the last 21 days', () => {
    expect(mergeTarget([live], incoming(), NOW)).toEqual({ kind: 'merge', row: live });
  });

  it('does not join a closed one or one older than 21 days, and without a topic key never merges', () => {
    expect(mergeTarget([{ ...live, status: 'done' }], incoming(), NOW)).toBeNull();
    const old = { ...live, createdAt: new Date(NOW.getTime() - 22 * DAY).toISOString() };
    expect(mergeTarget([old], incoming(), NOW)).toBeNull();
    expect(mergeTarget([live], incoming({ topicKey: undefined }), NOW)).toBeNull();
  });

  it('finds the row a source already joined, even once it closed, so it is not reopened', () => {
    const joined = { ...mergeInto(live, incoming(), NOW), status: 'done' as const };
    expect(mergeTarget([joined], incoming(), NOW)).toEqual({ kind: 'known', row: joined });
  });
});

describe('mergeInto', () => {
  it('adds the source and keeps the higher salience', () => {
    const low = {
      ...live,
      salience: { weight: 0.4, heavy: false, sensitive: false, by: 'rule', v: 1 } as const,
    };
    const high = { weight: 0.8, heavy: false, sensitive: false, by: 'llm', v: 1 } as const;
    const merged = mergeInto(low, incoming({ salience: high }), NOW);
    expect(merged.sources).toEqual([live.source, incoming().source]);
    expect(merged.salience).toEqual(high);
    expect(mergeInto(merged, incoming({ source: { store: 'x', ref: 'y' } }), NOW).salience).toEqual(
      high
    );
  });
});
