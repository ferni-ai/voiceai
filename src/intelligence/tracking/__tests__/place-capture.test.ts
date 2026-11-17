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
    "I'm in AA meetings on Tuesdays", // recovery, never a place
    'I was in ICU for two days', // health, never a place
    "I'm in OK shape",
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
    ['I moved from UK last year', 'UK'],
  ])('keeps the listed abbreviation in "%s" (#4034)', (said, place) => {
    expect(valuesOf(said, 'place')).toEqual([place]);
  });

  it('takes no "LA" out of "LAX" (#4034)', () => {
    expect(valuesOf('I flew in LAX yesterday', 'place')).toEqual([]);
  });

  it('keeps a two-word place that starts with a common word: "New York"', () => {
    expect(valuesOf('I live in New York', 'place')).toEqual(['New York']);
  });
});

describe('companies from what the caller said', () => {
  it('saves "Acme" from "I work at Acme"', () => {
    expect(valuesOf('I work at Acme', 'company')).toEqual(['Acme']);
  });

  it.each([
    ['I work at IBM', 'IBM'],
    ['I work for NASA', 'NASA'],
  ])('keeps a company said in capitals in "%s"', (said, company) => {
    expect(valuesOf(said, 'company')).toEqual([company]);
  });

  it.each(['I work at the hospital', 'I work for myself these days', 'I worked at Monday'])(
    'saves no company from "%s"',
    (said) => {
      expect(valuesOf(said, 'company')).toEqual([]);
    }
  );
});
