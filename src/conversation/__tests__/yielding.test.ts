import { describe, expect, it } from 'vitest';
import { CARRY_ON_CUE, YIELD_CUE, yieldingCue } from '../yielding.js';

describe('yieldingCue', () => {
  it('yields to a real interruption', () => {
    expect(yieldingCue(true, 'Wait, no, that is not what happened')).toBe(YIELD_CUE);
    expect(yieldingCue(true, 'Yeah but my boss said the opposite')).toBe(YIELD_CUE);
  });

  it('carries on after a listening noise that happened to cut in', () => {
    for (const text of ['yeah', 'Mm-hm.', 'yeah, go on', 'uh huh', 'mhm right']) {
      expect(yieldingCue(true, text), text).toBe(CARRY_ON_CUE);
    }
  });

  it('treats a cut-in "yes" or "sure" as an answer, not a listening noise', () => {
    expect(yieldingCue(true, 'yes')).toBe(YIELD_CUE);
    expect(yieldingCue(true, 'Sure.')).toBe(YIELD_CUE);
  });

  it('says nothing when the last reply was not interrupted', () => {
    expect(yieldingCue(false, 'Wait, no')).toBeNull();
    expect(yieldingCue(undefined, 'yeah')).toBeNull();
    expect(yieldingCue(true, '  ')).toBeNull();
  });
});
