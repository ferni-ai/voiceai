import { describe, expect, it } from 'vitest';
import { checkInDelay, isRealSilence, silenceHold } from '../dead-air.js';

describe('isRealSilence', () => {
  it('is silence only when the agent is listening and the user is not talking', () => {
    expect(isRealSilence({ agentState: 'listening', userState: 'listening' })).toBe(true);
    expect(isRealSilence({ agentState: 'listening', userState: 'away' })).toBe(true);
  });

  it('is not silence while a reply is being generated or spoken', () => {
    expect(isRealSilence({ agentState: 'thinking', userState: 'listening' })).toBe(false);
    expect(isRealSilence({ agentState: 'speaking', userState: 'listening' })).toBe(false);
  });

  it('is not silence while the user is talking', () => {
    expect(isRealSilence({ agentState: 'listening', userState: 'speaking' })).toBe(false);
  });

  it('defers to the other guards when the session exposes no state', () => {
    expect(isRealSilence(undefined)).toBe(true);
    expect(isRealSilence({})).toBe(true);
  });
});

describe('silenceHold', () => {
  it('holds a pause much longer after something heavy', () => {
    expect(silenceHold({ lastUserText: 'My dad passed away last month' })).toBe(3);
    expect(silenceHold({ distressLevel: 0.7 })).toBe(3);
    expect(silenceHold({ emotion: 'Sad' })).toBe(3);
  });

  it('hears the heaviest things said plainly', () => {
    for (const text of [
      'I want to kill myself',
      "I don't want to be here anymore",
      'My friend killed himself last year',
      'We lost the baby',
      "I'm getting divorced",
    ]) {
      expect(silenceHold({ lastUserText: text }), text).toBe(3);
    }
  });

  it('keeps the usual wait for an ordinary moment', () => {
    expect(
      silenceHold({ lastUserText: 'We had pizza tonight', emotion: 'joy', distressLevel: 0.1 })
    ).toBe(1);
    expect(silenceHold({})).toBe(1);
  });
});

describe('checkInDelay', () => {
  it('jitters within ±25% of the base wait', () => {
    expect(checkInDelay(4000, () => 0)).toBe(3000);
    expect(checkInDelay(4000, () => 0.5)).toBe(4000);
    expect(checkInDelay(4000, () => 0.999)).toBeLessThanOrEqual(5000);
  });
});
