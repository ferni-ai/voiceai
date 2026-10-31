import { describe, expect, it } from 'vitest';

import { isPlainOutcome } from '../plain-outcome.js';

describe('only how it went is a plain outcome', () => {
  it.each([
    'pretty well',
    'okay',
    'went great',
    'all good',
    'it was rough',
    'went badly',
    'not great',
    'so-so',
    'he did well',
    'fine, thanks',
    'much better',
    'everything went well',
    'rough day',
    'kind of rough',
    'not bad at all',
    'great thanks',
    'super good',
    'good actually',
    'a lot better',
    'went well today',
    'She’s doing better',
  ])('"%s"', (said) => expect(isPlainOutcome(said, 'Sam friend')).toBe(true));

  it('the person it was about may be named', () =>
    expect(isPlainOutcome('Mom is okay', 'Mom mom')).toBe(true));

  it.each(['yeah', 'it went', 'we did', 'thanks'])('"%s" says nothing about how it went', (said) =>
    expect(isPlainOutcome(said, 'Sam friend')).toBe(false)
  );

  it.each([
    'going out',
    'went out',
    'got out',
    'he quit, it went fine',
    'quit, fine',
    'they quit, much better',
    'went fine but she fell',
    'ok but sick',
    'good day, she starts Monday',
    'much better, he is moving in with us',
    'rough day, she fell again',
    'we did well, we got engaged',
    'he got the job',
    'Sam got the job',
  ])('"%s" is an event of its own', (said) =>
    expect(isPlainOutcome(said, 'Sam friend')).toBe(false)
  );
});
