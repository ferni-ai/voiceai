import { describe, expect, it } from 'vitest';
import { coachMediaEnabled, MAX_QUERY_LENGTH, topicOnlyQuery } from '../topic-query.js';

describe('topicOnlyQuery', () => {
  it("removes the caller's name, possessive and any case, and keeps the topic", () => {
    const q = topicOnlyQuery("Seth's beginner shin splint stretches for SETH ford", ['Seth Ford']);
    expect(q).toBe('beginner shin splint stretches for');
    expect(q?.toLowerCase()).not.toContain('seth');
    expect(q?.toLowerCase()).not.toContain('ford');
  });

  it('removes a name only as a whole word', () => {
    expect(topicOnlyQuery('Mark: stock market basics', ['Mark'])).toBe(': stock market basics');
    expect(topicOnlyQuery('Alexander technique for posture', ['Al'])).toBe(
      'Alexander technique for posture'
    );
  });

  it('removes emails, links and phone, account or card numbers', () => {
    const q = topicOnlyQuery(
      'budgeting app tips seth@example.com https://evil.example/x?u=1 call 415-555-0134 card 4111 1111 1111 1111',
      []
    );
    expect(q).toBe('budgeting app tips call card');
  });

  it('keeps short numbers that are part of a topic', () => {
    expect(topicOnlyQuery('couch to 5k week 3', [])).toBe('couch to 5k week 3');
  });

  it('returns null when nothing but identifiers is left', () => {
    expect(topicOnlyQuery('Seth 415 555 0134', ['Seth'])).toBeNull();
    expect(topicOnlyQuery('   ', [])).toBeNull();
  });

  it('caps the query length and drops markup', () => {
    const q = topicOnlyQuery(`<b>${'sleep '.repeat(60)}</b>`, []);
    expect(q!.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(q).not.toMatch(/[<>]/);
  });
});

describe('coachMediaEnabled', () => {
  it('is on only for COACH_MEDIA=on', () => {
    expect(coachMediaEnabled({})).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: 'true' })).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: ' ON ' })).toBe(true);
  });
});
