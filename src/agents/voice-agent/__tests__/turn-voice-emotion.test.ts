import { describe, expect, it, vi } from 'vitest';
import { captureTurnVoiceEmotion } from '../turn-voice-emotion.js';

function fakeAnalyzer(result: unknown) {
  return { analyze: vi.fn(() => result), clearBuffers: vi.fn() };
}

describe('captureTurnVoiceEmotion', () => {
  it('stores this turn’s reading on userData and clears the buffer for the next turn', () => {
    const a = fakeAnalyzer({ primary: 'sad', confidence: 0.8, stressLevel: 0.4 });
    const userData: Record<string, unknown> = {};
    const r = captureTurnVoiceEmotion(a, userData);
    expect(r).toMatchObject({ primary: 'sad' });
    expect(userData.voiceEmotion).toMatchObject({ primary: 'sad' });
    expect(a.clearBuffers).toHaveBeenCalledOnce();
  });

  it('leaves the previous reading alone when there was too little audio to analyse', () => {
    const a = fakeAnalyzer(null);
    const userData: Record<string, unknown> = { voiceEmotion: { primary: 'happy' } };
    expect(captureTurnVoiceEmotion(a, userData)).toBeNull();
    expect(userData.voiceEmotion).toEqual({ primary: 'happy' });
    expect(a.clearBuffers).toHaveBeenCalledOnce();
  });

  it('never throws when the analyzer fails', () => {
    const a = {
      analyze: () => {
        throw new Error('boom');
      },
      clearBuffers: vi.fn(),
    };
    expect(captureTurnVoiceEmotion(a, {})).toBeNull();
  });
});
