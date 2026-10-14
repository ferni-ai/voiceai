import { describe, expect, it } from 'vitest';
import { formatPets, petsOf } from '../pets.js';
import type { RecallFact } from '../session-recall.js';

const f = (entity: string, key: string, value: string): RecallFact => ({
  entity,
  key,
  value,
  confidence: 0.9,
});

describe('petsOf', () => {
  // Rows exactly as the deep extractor wrote them in the memory benchmark (2026-10-11).
  it("tells the caller's own animal from someone else's", () => {
    expect(
      petsOf([
        f('User', 'acquired_pet', 'got a golden retriever puppy named Biscuit'),
        f('Biscuit', 'breed', 'golden retriever'),
        f('Ana', 'pet owned', 'Pepper (cat)'),
        f('Ana', 'adopted a cat', 'Adopted a gray cat named Pepper'),
        f('Pepper', 'species', 'cat'),
        f('speaker', 'co-fostering', 'Fostering Turnip the beagle alongside partner Jules'),
      ])
    ).toEqual([
      { name: 'Biscuit', kind: 'golden retriever' },
      { name: 'Pepper', kind: 'cat', owner: 'Ana' },
      { name: 'Turnip', kind: 'beagle', fostering: true },
    ]);
  });

  it('never guesses whose: no owner, or two owners, means left out', () => {
    expect(
      petsOf([
        f('Rex', 'breed', 'german shepherd'), // a kind, but whose?
        f('Ana', 'pet owned', 'Milo (dog)'),
        f('User', 'pet', 'Milo (dog)'), // Ana's or theirs?
        f('Neighbor', 'walks pet', "Walks the speaker's pet"), // no name
      ])
    ).toEqual([]);
  });
});

describe('formatPets', () => {
  it('says whose each animal is', () => {
    expect(
      formatPets([
        { name: 'Biscuit', kind: 'golden retriever' },
        { name: 'Pepper', kind: 'cat', owner: 'Ana' },
        { name: 'Turnip', kind: 'beagle', fostering: true },
      ])
    ).toBe(
      "Animals: Biscuit (their golden retriever), Pepper (Ana's cat), Turnip (their beagle, fostering)."
    );
    expect(formatPets([])).toBeNull();
  });
});
