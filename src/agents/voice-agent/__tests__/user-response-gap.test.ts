/**
 * The gap between the agent's last reply and the user starting to answer.
 */

import { describe, expect, it } from 'vitest';
import { getUserResponseGapMs } from '../user-response-gap.js';

describe('getUserResponseGapMs', () => {
  it('is the pause between the reply committing and the user starting to speak', () => {
    expect(
      getUserResponseGapMs({ lastAgentResponseTime: 10_000, userSpeakingStartTime: 11_200 })
    ).toBe(1_200);
  });

  it('is 0 when the user started before the reply finished', () => {
    // An interrupted reply commits after the user has already started talking.
    expect(
      getUserResponseGapMs({ lastAgentResponseTime: 10_000, userSpeakingStartTime: 9_400 })
    ).toBe(0);
  });

  it('is unknown when either time is missing', () => {
    expect(getUserResponseGapMs({ userSpeakingStartTime: 11_200 })).toBeUndefined();
    expect(getUserResponseGapMs({ lastAgentResponseTime: 10_000 })).toBeUndefined();
  });
});
