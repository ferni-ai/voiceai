import { describe, expect, it } from 'vitest';
import type { Candidate } from '../checked-pick.js';
import type { PickRecord } from '../pick-log.js';
import { boostFor, signalOf, tasteFrom, tasteReason, tasteWords } from '../taste.js';

const record = (over: Partial<PickRecord>): PickRecord => ({
  id: 'p',
  offeredAt: '2026-10-01T00:00:00Z',
  topic: 't',
  format: 'video',
  title: 'x',
  by: 'Physio Pat',
  lengthSeconds: 420,
  checked: true,
  latencyMs: 3000,
  firstInCall: true,
  sentVia: 'text',
  sentAt: '2026-10-01T00:00:00Z',
  followUpDueAt: '2026-10-04T00:00:00Z',
  outcome: 'done',
  helped: null,
  ...over,
});

const video = (by: string, seconds: number): Candidate => ({
  kind: 'video',
  title: 'v',
  by,
  url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  seconds,
});

describe('signalOf', () => {
  it('scores helped, somewhat, no and a skipped send; says nothing before an answer', () => {
    expect(signalOf(record({ helped: 'yes' }))).toBe(1);
    expect(signalOf(record({ helped: 'somewhat' }))).toBe(0.5);
    expect(signalOf(record({ helped: 'no' }))).toBe(-1);
    expect(signalOf(record({ outcome: 'unanswered' }))).toBe(-0.25);
    expect(signalOf(record({ outcome: null }))).toBeNull();
    expect(signalOf(record({ sentVia: null, outcome: 'unanswered' }))).toBeNull();
  });
});

describe('taste', () => {
  const taste = tasteFrom([
    record({ helped: 'yes', by: 'Physio Pat', lengthSeconds: 420 }),
    record({ helped: 'yes', by: 'physio pat ', lengthSeconds: 300 }),
    record({ helped: 'no', by: 'Lecture Hall', lengthSeconds: 3600 }),
    record({ helped: 'no', format: 'book', by: 'A. Author', lengthSeconds: undefined }),
  ]);

  it('learns creators, kinds and length from answers', () => {
    expect(taste.creators['physio pat']).toBe(2);
    expect(taste.creators['lecture hall']).toBe(-1);
    expect(taste.formats).toEqual({ video: 1, book: -1 });
    expect(taste.length).toEqual({ short: 2, long: -1 });
  });

  it('ranks a liked creator and length above a disliked one', () => {
    expect(boostFor(taste, video('Physio Pat', 400), 'video')).toBeGreaterThan(
      boostFor(taste, video('Lecture Hall', 3000), 'video')
    );
    expect(boostFor(taste, video('Someone New', 400), 'video')).toBeGreaterThan(0);
    // Same length and kind: the creator they liked still ranks first.
    expect(boostFor(taste, video('Physio Pat', 400), 'video')).toBeGreaterThan(
      boostFor(taste, video('Someone New', 400), 'video')
    );
  });

  it('says why in words Ferni can use', () => {
    expect(tasteReason(taste, video('Physio Pat', 400), 'video')).toBe(
      'last time they liked picks from Physio Pat and short ones'
    );
    expect(tasteReason(taste, video('Lecture Hall', 3000), 'video')).toBe('');
    expect(tasteWords(taste)).toBe(
      'liked videos, short ones (under 10 minutes); not books, long ones'
    );
  });

  it('is empty with no answers', () => {
    expect(tasteWords(tasteFrom([]))).toBe('');
    expect(boostFor(tasteFrom([]), video('Physio Pat', 400), 'video')).toBe(0);
  });
});
