import { describe, expect, it } from 'vitest';
import {
  observeCrisisTurn,
  resolveCrisisGuardMode,
  toGuardVoiceEmotion,
} from '../safety/crisis-shadow.js';

describe('resolveCrisisGuardMode', () => {
  it('defaults to shadow when unset', () => {
    expect(resolveCrisisGuardMode({})).toBe('shadow');
  });

  it('honours an explicit off', () => {
    expect(resolveCrisisGuardMode({ CRISIS_GUARD_MODE: ' OFF ' })).toBe('off');
  });

  it('resolves "live" to shadow because live is not implemented', () => {
    expect(resolveCrisisGuardMode({ CRISIS_GUARD_MODE: 'live' })).toBe('shadow');
  });

  it('resolves a typo to shadow rather than silently disabling', () => {
    expect(resolveCrisisGuardMode({ CRISIS_GUARD_MODE: 'of' })).toBe('shadow');
  });
});

describe('observeCrisisTurn', () => {
  it('records nothing when mode is off', () => {
    expect(observeCrisisTurn('I want to kill myself', undefined, 'off')).toBeNull();
  });

  it('records nothing for an empty transcript', () => {
    expect(observeCrisisTurn('   ', undefined, 'shadow')).toBeNull();
  });

  it('records a would-block for explicit crisis language', () => {
    const record = observeCrisisTurn("I don't want to live anymore", undefined, 'shadow');
    expect(record?.wouldBlock).toBe(true);
    expect(record?.isCrisis).toBe(true);
    expect(record?.voiceAvailable).toBe(false);
  });

  it('records no block for an everyday idiom', () => {
    const record = observeCrisisTurn("what's the point of this meeting", undefined, 'shadow');
    expect(record?.wouldBlock).toBe(false);
    expect(record?.severity).toBeGreaterThan(0);
  });

  it('never carries the transcript text', () => {
    const phrase = "I'm thinking about killing myself";
    const record = observeCrisisTurn(phrase, undefined, 'shadow');
    expect(JSON.stringify(record)).not.toContain('killing');
    expect(record?.transcriptChars).toBe(phrase.length);
  });
});

describe('toGuardVoiceEmotion', () => {
  it('returns undefined without a prosody label', () => {
    expect(toGuardVoiceEmotion(undefined)).toBeUndefined();
    expect(toGuardVoiceEmotion({ confidence: 0.9 })).toBeUndefined();
  });

  it('uses vocal stress as intensity', () => {
    expect(toGuardVoiceEmotion({ primary: 'sad', confidence: 0.8, stressLevel: 0.9 })).toEqual({
      primary: 'sad',
      confidence: 0.8,
      intensity: 0.9,
    });
  });

  it('lets a sad, stressed voice lift ambiguous hopelessness to a block', () => {
    const phrase = "honestly what's the point anymore";
    const calm = toGuardVoiceEmotion({ primary: 'sad', confidence: 0.8, stressLevel: 0.2 });
    const stressed = toGuardVoiceEmotion({ primary: 'sad', confidence: 0.8, stressLevel: 0.9 });
    expect(observeCrisisTurn(phrase, calm, 'shadow')?.wouldBlock).toBe(false);
    expect(observeCrisisTurn(phrase, stressed, 'shadow')?.wouldBlock).toBe(true);
  });
});
