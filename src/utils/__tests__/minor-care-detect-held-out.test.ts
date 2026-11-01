/**
 * statesUnder18 against phrases it was not tuned on (#2557). Precision must
 * stay perfect (a false hold costs an adult a call's memory); recall must not
 * drop below what the detector reached when these sets were written. Raise a
 * floor when recall improves, never lower one to make a change pass.
 */
import { describe, expect, it } from 'vitest';

import { statesUnder18 } from '../minor-care-detect.js';
import {
  BLIND_C_MINOR,
  BLIND_C_NOT_MINOR,
  BLIND_MINOR,
  BLIND_NOT_MINOR,
  HELD_OUT_MINOR,
  HELD_OUT_NOT_MINOR,
  VERIFIER_ASKED_MINOR,
  VERIFIER_ASKED_NOT_MINOR,
  VERIFIER_MINOR,
  VERIFIER_NOT_MINOR,
} from './fixtures/minor-age-held-out.js';

const SETS = [
  // set A's six misses are known gaps: "gonna be N", "about to turn N", "going on N",
  // "grade nine", "my age is N", "twelve almost thirteen"
  { name: 'A', minor: HELD_OUT_MINOR, notMinor: HELD_OUT_NOT_MINOR, recallFloor: 26 },
  // "too" no longer closes an age ("im 13 too" echoes a floor number), so "im sixteen too" is missed
  { name: 'B', minor: BLIND_MINOR, notMinor: BLIND_NOT_MINOR, recallFloor: 31 },
  // 19, not 20: a laugh means not an age (r2 found 22 adult jokes flagged), so "im sixteen lol" is missed
  { name: 'C', minor: BLIND_C_MINOR, notMinor: BLIND_C_NOT_MINOR, recallFloor: 19 },
  // the #3098 verifier's set; main caught 25 of 44 here
  { name: 'V', minor: VERIFIER_MINOR, notMinor: VERIFIER_NOT_MINOR, recallFloor: 33 },
] as const;
const ASKED = 'how old are you?';

describe('statesUnder18 on held-out phrases', () => {
  it.each(SETS)('set $name: no false positives', ({ notMinor }) => {
    expect(notMinor.filter((said) => statesUnder18(said))).toEqual([]);
  });

  it.each(SETS)('set $name: recall at or above its floor', ({ minor, recallFloor }) => {
    const caught = minor.filter((said) => statesUnder18(said)).length;
    expect(caught).toBeGreaterThanOrEqual(recallFloor);
  });

  it('the verifier\'s answers to "how old are you?": no false positives, recall at its floor', () => {
    expect(VERIFIER_ASKED_NOT_MINOR.filter((said) => statesUnder18(said, ASKED))).toEqual([]);
    expect(
      VERIFIER_ASKED_MINOR.filter((said) => statesUnder18(said, ASKED)).length
    ).toBeGreaterThanOrEqual(5);
  });
});
