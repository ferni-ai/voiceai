import { describe, expect, it } from 'vitest';
import {
  averageMeasures,
  rememberUtterance,
  voiceTodayCue,
  type VoiceComparison,
  type VoiceMeasures,
} from '../voice-today.js';

const measures = (over: Partial<VoiceMeasures> = {}): VoiceMeasures => ({
  pitchMean: 150,
  pitchRange: 30,
  pitchVariability: 0.3,
  energyMean: 0.5,
  energyRange: 0.2,
  energyVariability: 0.3,
  speakingRate: 150,
  pauseFrequency: 3,
  pauseDuration: 300,
  breathiness: 0.3,
  tension: 0.3,
  clarity: 0.7,
  ...over,
});

const subdued: VoiceComparison = {
  deviates: true,
  direction: 'subdued',
  magnitude: 0.6,
  confidence: 0.85,
  significantFactors: [
    { factor: 'energyMean', current: 0.3, baseline: 0.5 },
    { factor: 'speakingRate', current: 110, baseline: 150 },
    { factor: 'breathiness', current: 0.5, baseline: 0.3 },
  ],
};

describe('rememberUtterance / averageMeasures', () => {
  it('keeps only the last five utterances', () => {
    let recent: VoiceMeasures[] = [];
    for (let i = 0; i < 7; i++) recent = rememberUtterance(recent, measures({ speakingRate: i }));
    expect(recent.map((m) => m.speakingRate)).toEqual([2, 3, 4, 5, 6]);
  });

  it('does not judge a state from one or two sentences', () => {
    expect(averageMeasures([measures(), measures()])).toBeNull();
  });

  it('averages each measure', () => {
    const avg = averageMeasures([
      measures({ energyMean: 0.2 }),
      measures({ energyMean: 0.4 }),
      measures({ energyMean: 0.6 }),
    ]);
    expect(avg?.energyMean).toBeCloseTo(0.4);
    expect(avg?.pitchMean).toBe(150);
  });
});

describe('voiceTodayCue', () => {
  it('describes a subdued voice in plain words and asks for a gentler reply', () => {
    const cue = voiceTodayCue(subdued);
    expect(cue).toContain('[HOW THEY SOUND TODAY]');
    expect(cue).toContain('quieter and slower than it usually is');
    expect(cue).toMatch(/gentler/);
    expect(cue).toMatch(/believe them/);
  });

  it('reads an elevated voice as excitement or stress, not one of them', () => {
    const cue = voiceTodayCue({
      ...subdued,
      direction: 'elevated',
      significantFactors: [{ factor: 'speakingRate', current: 190, baseline: 150 }],
    });
    expect(cue).toContain('faster than it usually is');
    expect(cue).toMatch(/excitement or stress/);
  });

  it('says nothing when they sound like themselves', () => {
    expect(voiceTodayCue(null)).toBeNull();
    expect(voiceTodayCue({ ...subdued, deviates: false })).toBeNull();
    expect(voiceTodayCue({ ...subdued, direction: 'normal' })).toBeNull();
  });

  it('says nothing about a small difference or a voice it does not know well yet', () => {
    expect(voiceTodayCue({ ...subdued, magnitude: 0.1 })).toBeNull();
    expect(voiceTodayCue({ ...subdued, confidence: 0.4 })).toBeNull();
  });

  it('says nothing when only measures without plain words moved', () => {
    expect(
      voiceTodayCue({
        ...subdued,
        significantFactors: [{ factor: 'clarity', current: 0.4, baseline: 0.7 }],
      })
    ).toBeNull();
  });
});
