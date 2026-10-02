/**
 * Voice Prosody Learning Types
 *
 * Voice characteristics, personal baselines, deviation analysis and
 * voice evolution shapes used by the voice prosody learning service.
 *
 * @module VoiceProsodyLearningTypes
 */

export interface VoiceCharacteristics {
  // Pitch
  pitchMean: number; // Hz
  pitchRange: number; // Hz variance
  pitchVariability: number; // 0-1

  // Energy
  energyMean: number; // dB
  energyRange: number;
  energyVariability: number;

  // Tempo
  speakingRate: number; // words per minute
  pauseFrequency: number; // pauses per minute
  pauseDuration: number; // avg ms

  // Quality
  breathiness: number; // 0-1
  tension: number; // 0-1
  clarity: number; // 0-1
}

export interface PersonalBaseline {
  userId: string;
  characteristics: VoiceCharacteristics;
  sampleCount: number;
  confidence: number; // 0-1
  establishedAt: Date;
  lastUpdated: Date;

  // Emotional baselines (how THEY sound when feeling X)
  emotionalProfiles: EmotionalVoiceProfile[];
}

export interface EmotionalVoiceProfile {
  emotion: string;
  characteristics: Partial<VoiceCharacteristics>;
  sampleCount: number;
  confidence: number;
}

export interface VoiceSample {
  timestamp: Date;
  characteristics: VoiceCharacteristics;
  detectedEmotion?: string;
  userConfirmedEmotion?: string;
  context?: string;
}

export interface DeviationAnalysis {
  deviates: boolean;
  magnitude: number; // 0-1 (how much)
  direction: 'elevated' | 'subdued' | 'normal';
  significantFactors: SignificantFactor[];
  possibleMeaning: string;
  confidence: number;
}

export interface SignificantFactor {
  factor: keyof VoiceCharacteristics;
  baseline: number;
  current: number;
  deviation: number; // standard deviations
  interpretation: string;
}

export interface VoiceEvolution {
  period: 'week' | 'month' | 'quarter';
  changes: VoiceChange[];
  interpretation: string;
}

export interface VoiceChange {
  factor: string;
  direction: 'increased' | 'decreased' | 'stable';
  magnitude: number;
  significance: 'notable' | 'subtle' | 'none';
}
