/**
 * Places and companies caught from what the caller said (issue #4028). Like names (#4000),
 * they must be capitalised as said and not a weekday, month, clause word or relation.
 * Places and companies are fictional or generic.
 */

import { describe, expect, it } from 'vitest';
import { extractSmallDetails } from '../conversation-quality.js';

const valuesOf = (said: string, type: 'place' | 'company') =>
  extractSmallDetails(said)
    .filter((d) => d.type === type)
    .map((d) => d.value);

describe('places from what the caller said', () => {
  it.each([
    'my deadline moved up to Friday',
    "I'm from work, just got home",
    "I'm in the middle of it",
    'we are moving in March',
    'I just got back from Mom and Dad',
    'This is living in Today',
  ])('saves no place from "%s"', (said) => {
    expect(valuesOf(said, 'place')).toEqual([]);
  });

  it('saves "Denver" from "I moved to Denver last year"', () => {
    expect(valuesOf('I moved to Denver last year', 'place')).toEqual(['Denver']);
  });

  it.each([
    ['I moved to NYC in June', 'NYC'],
    ['I live in LA now', 'LA'],
    ['we moved to Washington DC', 'Washington DC'],
  ])('keeps the short form in "%s"', (said, place) => {
    expect(valuesOf(said, 'place')).toEqual([place]);
  });

  it('keeps a two-word place that starts with a common word: "New York"', () => {
    expect(valuesOf('I live in New York', 'place')).toEqual(['New York']);
  });
});

describe('companies from what the caller said', () => {
  it('saves "Acme" from "I work at Acme"', () => {
    expect(valuesOf('I work at Acme', 'company')).toEqual(['Acme']);
  });

  it.each(['I work at the hospital', 'I work for myself these days', 'I worked at Monday'])(
    'saves no company from "%s"',
    (said) => {
      expect(valuesOf(said, 'company')).toEqual([]);
    }
  );
});
