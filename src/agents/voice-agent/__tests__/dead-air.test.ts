import { describe, expect, it } from 'vitest';
import { checkInDelay, isRealSilence } from '../dead-air.js';

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

describe('checkInDelay', () => {
  it('jitters the base wait between 0.75x and 1.25x', () => {
    expect(checkInDelay(3000, () => 0)).toBe(2250);
    expect(checkInDelay(3000, () => 0.5)).toBe(3000);
    expect(checkInDelay(3000, () => 0.999)).toBe(3749);
  });
});
