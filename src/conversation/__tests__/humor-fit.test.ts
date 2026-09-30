import { describe, expect, it } from 'vitest';
import { GENTLE_CUE, PLAYFUL_CUE, humorCue } from '../humor-fit.js';

describe('humorCue', () => {
  it('welcomes playfulness with someone who laughs easily', () => {
    expect(humorCue({ calls: 3, laughs: 4 })).toBe(PLAYFUL_CUE);
  });

  it('keeps humor rare with someone who has not laughed in several calls', () => {
    expect(humorCue({ calls: 4, laughs: 0 })).toBe(GENTLE_CUE);
  });

  it('reads nothing into a few calls or an in-between rate', () => {
    expect(humorCue({ calls: 2, laughs: 5 })).toBeNull();
    expect(humorCue({ calls: 3, laughs: 0 })).toBeNull();
    expect(humorCue({ calls: 6, laughs: 2 })).toBeNull();
    expect(humorCue(null)).toBeNull();
  });
});
