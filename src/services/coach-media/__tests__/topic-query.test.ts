import { describe, expect, it } from 'vitest';
import {
  coachMediaEnabled,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS,
  sessionIdentifiers,
  topicOnlyQuery,
} from '../topic-query.js';

describe('topicOnlyQuery', () => {
  it("removes the caller's name, possessive and any case, and keeps the topic lowercased", () => {
    const q = topicOnlyQuery("Seth's beginner shin splint stretches for SETH ford", ['Seth Ford']);
    expect(q).toBe('beginner shin splint stretches for');
  });

  it('removes family names and places the session does not know', () => {
    const ids = sessionIdentifiers({
      name: 'Seth',
      services: { userProfile: { familyMembers: [{ name: 'Mindy', relationship: 'spouse' }] } },
    });
    const q = topicOnlyQuery("stretches for Mindy's knee after her surgery at Mayo", ids);
    expect(q).not.toMatch(/mindy/i);
    expect(q).not.toMatch(/mayo/i);
    expect(q).toBe('stretches for knee after her surgery at');
  });

  it('keeps language words after a preposition', () => {
    expect(topicOnlyQuery('conversation practice in Spanish', [])).toBe(
      'conversation practice in spanish'
    );
  });

  it('removes a name only as a whole word', () => {
    expect(topicOnlyQuery('Mark: stock market basics', ['Mark'])).toBe(': stock market basics');
    expect(topicOnlyQuery('Alexander technique for posture', ['Al'])).toBe(
      'alexander technique for posture'
    );
  });

  it('removes quoted strings, emails, links and phone, account or card numbers', () => {
    const q = topicOnlyQuery(
      'budgeting app tips "Dana Whitfield" seth@example.com https://evil.example/x?u=1 call 415-555-0134 card 4111 1111 1111 1111',
      []
    );
    expect(q).toBe('budgeting app tips call card');
  });

  it(`keeps at most ${MAX_QUERY_WORDS} words`, () => {
    const q = topicOnlyQuery(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
      []
    );
    expect(q!.split(' ')).toHaveLength(MAX_QUERY_WORDS);
    expect(q).not.toContain('thirteen');
  });

  it('keeps short numbers that are part of a topic', () => {
    expect(topicOnlyQuery('couch to 5k week 3', [])).toBe('couch to 5k week 3');
  });

  it('returns null when nothing but identifiers is left', () => {
    expect(topicOnlyQuery('Seth 415 555 0134', ['Seth'])).toBeNull();
    expect(topicOnlyQuery('   ', [])).toBeNull();
  });

  it('caps the query length and drops markup', () => {
    const q = topicOnlyQuery(`<b>${'sleepinghabits '.repeat(12)}</b>`, []);
    expect(q!.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(q).not.toMatch(/[<>]/);
  });
});

describe('sessionIdentifiers', () => {
  it('collects the caller, profile, family and city names', () => {
    expect(
      sessionIdentifiers({
        name: 'Seth Ford',
        services: {
          userProfile: {
            preferredName: 'Sethy',
            familyMembers: [{ name: 'Mindy' }, { relationship: 'son' }],
            location: { city: 'St. Petersburg' },
          },
        },
      })
    ).toEqual(['Seth Ford', 'Sethy', 'St. Petersburg', 'Mindy']);
  });
});

describe('coachMediaEnabled', () => {
  it('is on only for COACH_MEDIA=on', () => {
    expect(coachMediaEnabled({})).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: 'true' })).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: ' ON ' })).toBe(true);
  });
});
