import { describe, expect, it } from 'vitest';
import { nameRestCue } from '../name-use.js';

describe('nameRestCue', () => {
  it('rests the name when a recent reply used it', () => {
    expect(nameRestCue('Sam', ['Hey Sam, good to hear you.', 'How was the trip?'])).toMatch(
      /leave it out/
    );
  });

  it('allows it again once it has not been said for a few replies', () => {
    expect(
      nameRestCue('Sam', ['Hey Sam!', 'Oh no.', 'That makes sense.', 'Tell me more.'])
    ).toBeNull();
  });

  it('matches the name as a word, not inside another', () => {
    expect(nameRestCue('Al', ['That is totally normal.'])).toBeNull();
    expect(nameRestCue(undefined, ['Hey Sam'])).toBeNull();
  });
});
