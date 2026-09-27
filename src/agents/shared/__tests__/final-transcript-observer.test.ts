import { describe, expect, it, vi } from 'vitest';
import { observeFinalTranscript } from '../final-transcript-observer.js';

const sadReading = { primary: 'sad', confidence: 0.8, stressLevel: 0.3 };

function analyzerReturning(reading: unknown) {
  return { analyze: vi.fn(() => reading), clearBuffers: vi.fn() };
}

function sessionWithTts() {
  const setDeliveryStyle = vi.fn();
  return { session: { tts: { setDeliveryStyle } }, setDeliveryStyle };
}

describe('observeFinalTranscript', () => {
  it('sets the delivery style from this turn voice when ADAPTIVE_DELIVERY=on', () => {
    const { session, setDeliveryStyle } = sessionWithTts();
    const result = observeFinalTranscript({
      session,
      transcript: 'it has been a rough week',
      userData: {},
      sessionId: 's1',
      crisisMode: 'shadow',
      analyzer: analyzerReturning(sadReading),
      env: { ADAPTIVE_DELIVERY: 'on' },
    });
    expect(setDeliveryStyle).toHaveBeenCalledWith({ emotion: 'sympathetic', speed: 0.92 });
    expect(result.style).toEqual({ emotion: 'sympathetic', speed: 0.92 });
  });

  it('leaves the voice untouched when ADAPTIVE_DELIVERY is off, but still records the reading', () => {
    const { session, setDeliveryStyle } = sessionWithTts();
    const userData: Record<string, unknown> = {};
    const result = observeFinalTranscript({
      session,
      transcript: 'hello',
      userData,
      sessionId: 's1',
      crisisMode: 'shadow',
      analyzer: analyzerReturning(sadReading),
      env: {},
    });
    expect(setDeliveryStyle).not.toHaveBeenCalled();
    expect(result.style).toBeNull();
    expect(userData.voiceEmotion).toEqual(sadReading);
  });

  it('gives the crisis shadow this turn voice, not the previous one', () => {
    const result = observeFinalTranscript({
      session: {},
      transcript: 'I want to end my life',
      userData: {},
      sessionId: 's1',
      crisisMode: 'shadow',
      analyzer: analyzerReturning(sadReading),
      env: {},
    });
    expect(result.crisis?.isCrisis).toBe(true);
    expect(result.crisis?.voiceAvailable).toBe(true);
  });

  it('records no crisis when the guard is off', () => {
    const result = observeFinalTranscript({
      session: {},
      transcript: 'I want to end my life',
      userData: {},
      sessionId: 's1',
      crisisMode: 'off',
      analyzer: analyzerReturning(null),
      env: {},
    });
    expect(result.crisis).toBeNull();
  });

  it('never throws when the analyzer throws and the session has no TTS', () => {
    const analyzer = {
      analyze: () => {
        throw new Error('boom');
      },
      clearBuffers: () => {
        throw new Error('boom');
      },
    };
    expect(() =>
      observeFinalTranscript({
        session: undefined,
        transcript: 'hi',
        userData: {},
        sessionId: 's1',
        crisisMode: 'shadow',
        analyzer,
        env: { ADAPTIVE_DELIVERY: 'on' },
      })
    ).not.toThrow();
  });
});
