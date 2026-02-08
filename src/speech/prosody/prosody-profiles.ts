/**
 * Prosody profiles for speech-to-speech text translation.
 * Stub module for Qwen3-Omni SSML-to-text translation.
 */

export interface ProsodyProfileInput {
  personaId: string;
  emotion: string;
  timeOfDay: string;
}

export type ProsodyRate = 'x-slow' | 'slow' | 'medium' | 'fast' | 'x-fast';
export type ProsodyPitch = 'x-low' | 'low' | 'medium' | 'high' | 'x-high';
export type ProsodyVolume = 'silent' | 'x-soft' | 'soft' | 'medium' | 'loud' | 'x-loud';

export interface ProsodyProfile {
  rate: ProsodyRate;
  pitch: ProsodyPitch;
  volume: ProsodyVolume;
}

export function getProsodyProfile(input: ProsodyProfileInput): ProsodyProfile {
  const { emotion, timeOfDay } = input;

  const isEvening = timeOfDay === 'evening' || timeOfDay === 'night';

  const rateMap: Record<string, ProsodyRate> = {
    sad: 'slow',
    anxious: 'fast',
    excited: 'fast',
    neutral: 'medium',
    vulnerable: 'slow',
    grief: 'x-slow',
  };

  const pitchMap: Record<string, ProsodyPitch> = {
    sad: 'low',
    happy: 'high',
    excited: 'x-high',
    anxious: 'high',
    neutral: 'medium',
    vulnerable: 'low',
  };

  return {
    rate: rateMap[emotion] ?? 'medium',
    pitch: pitchMap[emotion] ?? 'medium',
    volume: isEvening ? 'soft' : 'medium',
  };
}
