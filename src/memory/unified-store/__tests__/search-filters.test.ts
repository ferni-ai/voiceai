import { describe, expect, it } from 'vitest';
import { applyFilters, matchesFilters } from '../adapters/search-filters.js';

describe('search filters', () => {
  it('matches a memory about any of the turn\'s topics, not only an identical topic list', () => {
    const memory = { topics: ['work', 'deadline', 'manager'], type: 'event' };
    expect(matchesFilters(memory, { topics: ['deadline', 'gym'] })).toBe(true);
    expect(matchesFilters(memory, { topics: ['gym', 'cat'] })).toBe(false);
    expect(matchesFilters(memory, { topics: [] })).toBe(true); // no topics: no filter
    expect(matchesFilters(memory, { type: 'event' })).toBe(true);
    expect(matchesFilters(memory, { type: 'fact' })).toBe(false);
  });

  it('asks Firestore for array-contains-any (deduplicated, at most 10), equality for scalars', () => {
    const calls: Array<[string, string, unknown]> = [];
    const query = {
      where(field: string, op: '==' | 'array-contains-any', value: unknown) {
        calls.push([field, op, value]);
        return query;
      },
    };
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    applyFilters(query, { topics: [...many, 't0'], type: 'event', people: [] });
    expect(calls).toEqual([
      ['topics', 'array-contains-any', many.slice(0, 10)],
      ['type', '==', 'event'],
    ]);
  });
});
