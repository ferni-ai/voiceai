import { describe, it, expect } from 'vitest';
import {
  getPrewarmGreetingPolicy,
  planFactoryPrewarm,
} from '../prewarm-greeting-overlap.js';

describe('getPrewarmGreetingPolicy', () => {
  it('defaults to overlap on', () => {
    expect(getPrewarmGreetingPolicy({})).toEqual({ overlap: true });
  });

  it('disables when OVERLAP_GREETING_WITH_PREWARM=false', () => {
    expect(
      getPrewarmGreetingPolicy({ OVERLAP_GREETING_WITH_PREWARM: 'false' })
    ).toEqual({ overlap: false });
  });
});

describe('planFactoryPrewarm', () => {
  it('does not block factory when overlapping', () => {
    expect(planFactoryPrewarm({ overlap: true })).toEqual({
      greetBeforePrewarmDone: true,
      blockFactoryOnPrewarm: false,
    });
  });

  it('blocks factory when not overlapping', () => {
    expect(planFactoryPrewarm({ overlap: false })).toEqual({
      greetBeforePrewarmDone: false,
      blockFactoryOnPrewarm: true,
    });
  });
});
