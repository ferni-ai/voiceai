/** #2539: the goodbye rules apply only on a goodbye turn, decided here in code. */
import { afterEach, describe, expect, it } from 'vitest';
import { clearFarewell, markFarewell } from '../call-farewell.js';
import { goodbyeTurn } from '../goodbye-turn.js';

describe('goodbyeTurn', () => {
  afterEach(() => clearFarewell('call-1'));

  it("is the caller's goodbye, Ferni's goodbye before it, or a call both have said goodbye on", () => {
    expect(goodbyeTurn({ latest: 'love you forever, bye' }, undefined)).toBe(true);
    expect(
      goodbyeTurn({ latest: 'okay, it is time', companion: 'Talk soon, bye!' }, undefined)
    ).toBe(true);
    expect(goodbyeTurn({ latest: 'one more thing', companion: 'How was work?' }, 'call-1')).toBe(
      false
    );
    markFarewell('call-1', 'goodbyes');
    expect(goodbyeTurn({ latest: 'one more thing', companion: 'How was work?' }, 'call-1')).toBe(
      true
    );
  });

  it('is never a mid-call line that only mentions goodbye', () => {
    for (const latest of [
      'goodbye to all of it',
      'I just want to say goodbye to everything',
      'the match is over',
    ]) {
      expect(goodbyeTurn({ latest, companion: 'What happened next?' }, 'call-1'), latest).toBe(
        false
      );
    }
  });
});
