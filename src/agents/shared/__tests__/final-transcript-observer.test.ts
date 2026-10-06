import { describe, expect, it, vi } from 'vitest';
import { observeFinalTranscript } from '../final-transcript-observer.js';

const sadReading = { primary: 'sad', confidence: 0.8, stressLevel: 0.3 };

function analyzerReturning(reading: unknown) {
  return { analyze: vi.fn(() => reading), clearBuffers: vi.fn() };
}

describe('observeFinalTranscript', () => {
  it("records this turn's voice reading for the crisis guard and others", () => {
    const userData: Record<string, unknown> = {};
    observeFinalTranscript({
      transcript: 'it has been a rough week',
      userData,
      sessionId: 's1',
      crisisMode: 'shadow',
      analyzer: analyzerReturning(sadReading),
    });
    expect(userData.voiceEmotion).toEqual(sadReading);
  });

  it('gives the crisis shadow this turn voice, not the previous one', () => {
    const result = observeFinalTranscript({
      transcript: 'I want to end my life',
      userData: {},
      sessionId: 's1',
      crisisMode: 'shadow',
      analyzer: analyzerReturning(sadReading),
    });
    expect(result.crisis?.isCrisis).toBe(true);
    expect(result.crisis?.voiceAvailable).toBe(true);
  });

  it('records no crisis when the guard is off', () => {
    const result = observeFinalTranscript({
      transcript: 'I want to end my life',
      userData: {},
      sessionId: 's1',
      crisisMode: 'off',
      analyzer: analyzerReturning(null),
    });
    expect(result.crisis).toBeNull();
  });

  it('never throws when the analyzer throws', () => {
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
        transcript: 'hi',
        userData: {},
        sessionId: 's1',
        crisisMode: 'shadow',
        analyzer,
      })
    ).not.toThrow();
  });
});
