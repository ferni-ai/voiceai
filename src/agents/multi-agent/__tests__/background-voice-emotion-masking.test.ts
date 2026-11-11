/**
 * BACKGROUND_VOICE_EMOTION keeps the negative emotion the analyzer measured, so the
 * voice-vs-words read still hears "I'm fine" said in an anxious or sad voice.
 * The view holds jitter, shimmer and breathiness at the values the native analyzer
 * writes (NATIVE_VOICE_QUALITY) instead of zeroing them; zero is a real value that
 * shifts valence and relabelled these voices as neutral or bored. Synthetic voices only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProsodyFeatures } from '../../../speech/audio-prosody/index.js';
import { backgroundVoiceEmotion } from '../background-voice-emotion.js';
import {
  analyzerReading,
  backgroundTurn,
  emotionalState,
  nativeVoice,
  VOICES,
} from './background-voice-fixtures.js';

afterEach(() => vi.unstubAllEnvs());

/** Labels with negative valence in the analyzer's prototypes (emotion-mapping.ts). */
const NEGATIVE = new Set([
  'sad',
  'angry',
  'fearful',
  'anxious',
  'bored',
  'confused',
  'contempt',
  'disgusted',
]);

/** Every native-shaped reading over a grid of the fields the native path measures or derives. */
function* nativeGrid(): Generator<ProsodyFeatures> {
  for (const pitchContour of ['flat', 'dynamic', 'rising', 'falling'] as const)
    for (const speakingRatio of [0.2, 0.35, 0.5, 0.65, 0.8, 0.95])
      for (const pitchRange of [5, 15, 30, 60, 100, 150])
        for (const pitchMean of [120, 150, 180, 210, 250])
          for (const energyMean of [40, 50, 60, 70, 80])
            for (const speechRate of [2, 3, 4.5, 6, 7.5])
              for (const pitchVariance of [3, 20, 60, 150])
                for (const energyPeaks of [0, 2, 6])
                  yield nativeVoice({
                    pitchContour,
                    speakingRatio,
                    pitchRange,
                    pitchMean,
                    energyMean,
                    speechRate,
                    pitchVariance,
                    energyPeaks,
                  });
}

type Shape = [
  ProsodyFeatures['pitchContour'],
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
const voice = ([
  pitchContour,
  speakingRatio,
  pitchRange,
  pitchMean,
  energyMean,
  speechRate,
  pitchVariance,
  energyPeaks,
]: Shape) =>
  nativeVoice({
    pitchContour,
    speakingRatio,
    pitchRange,
    pitchMean,
    energyMean,
    speechRate,
    pitchVariance,
    energyPeaks,
  });

/**
 * Voices the analyzer reads as anxious or sad. Round 1 zeroed the voice-quality
 * inputs and relabelled all but the first (anxious → neutral, sad → bored or neutral).
 */
const MASKED: Array<[string, ProsodyFeatures, string]> = [
  ['anxious', VOICES.anxious, "I'm fine, really, it was a normal day."],
  ['sad', VOICES.sad, "it's okay, no big deal"],
  ['anxious, level pitch', voice(['flat', 0.2, 5, 250, 60, 6, 150, 0]), "i'm good, just tired"],
  [
    'anxious, talkative',
    voice(['falling', 0.8, 5, 250, 60, 6, 150, 0]),
    'whatever, it is what it is',
  ],
  [
    'anxious, some range',
    voice(['falling', 0.65, 30, 250, 60, 6, 150, 0]),
    "I'm fine, really, it was a normal day.",
  ],
  [
    'anxious, wide range',
    voice(['falling', 0.5, 60, 250, 60, 6, 150, 0]),
    "it's okay, no big deal",
  ],
  ['sad, low pitch', voice(['falling', 0.2, 5, 120, 40, 3, 150, 2]), "i'm good, just tired"],
  ['sad, slow', voice(['falling', 0.2, 15, 180, 50, 2, 3, 0]), 'whatever, it is what it is'],
  [
    'sad, high pitch',
    voice(['falling', 0.2, 5, 250, 40, 4.5, 3, 6]),
    "I'm fine, really, it was a normal day.",
  ],
  ['sad, quick', voice(['falling', 0.2, 5, 120, 40, 6, 150, 2]), "it's okay, no big deal"],
];

describe('BACKGROUND_VOICE_EMOTION keeps measured negative emotion', () => {
  it('on native readings the view keeps the analyzer label: 0 negative labels lost or gained', () => {
    let readings = 0;
    const changed: string[] = [];
    for (const prosody of nativeGrid()) {
      readings += 1;
      const analyzer = analyzerReading(prosody);
      const view = backgroundVoiceEmotion(analyzer);
      if (view?.primary !== analyzer.primary) changed.push(`${analyzer.primary}->${view?.primary}`);
      if (NEGATIVE.has(analyzer.primary) !== NEGATIVE.has(view?.primary ?? ''))
        changed.push('negative');
    }
    expect(readings).toBe(216000);
    expect(changed).toEqual([]);
  });

  it.each(MASKED)(
    'flat words, %s voice: reads masking with the flag on',
    async (_name, prosody, text) => {
      const reading = analyzerReading(prosody);
      expect(['anxious', 'sad']).toContain(reading.primary); // not vacuous: the analyzer hears it

      const off = await backgroundTurn(text, reading);
      expect(emotionalState(off, text).mismatch).toBeUndefined();

      const on = await backgroundTurn(text, reading, 'on');
      const { mismatch } = emotionalState(on, text);
      expect(mismatch?.type).toBe('masking_negative');
      expect(mismatch?.voiceEmotion).toBe(reading.primary);
      expect(mismatch?.shouldSurface).toBe(true);
    }
  );
});
