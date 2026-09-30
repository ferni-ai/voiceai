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

  it('matches the first name of a full name, accented names, and word-names only as names', () => {
    expect(nameRestCue('Seth Smith', ['Seth! Good to hear you.'])).toMatch(/leave it out/);
    expect(nameRestCue('José', ['Hola José, how are you?'])).toMatch(/leave it out/);
    expect(nameRestCue('Will', ['I will think about that.'])).toBeNull();
    expect(nameRestCue('Will', ['Will, that is huge!'])).toMatch(/leave it out/);
  });
});
