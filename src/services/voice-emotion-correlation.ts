/**
 * Voice-Emotion Correlation
 *
 * Correlates voice authentication confidence with detected emotions.
 * Helps explain verification failures that might be due to emotional state.
 *
 * @module VoiceEmotionCorrelation
 */

import pino from 'pino';

const log = pino({ name: 'voice-emotion' });

// Types
export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'calm';

export interface EmotionAnalysis {
  primary: Emotion;
  confidence: number;
  arousal: number;
  valence: number;
  features: {
    pitchMean: number;
    pitchVariance: number;
    energy: number;
    speechRate: number;
  };
}

// Extract emotion features from audio
function extractEmotionFeatures(samples: Float32Array, sampleRate: number = 16000) {
  // Compute pitch
  const pitchValues: number[] = [];
  const frameSize = Math.floor(sampleRate * 0.03);
  const hopSize = Math.floor(sampleRate * 0.01);
  
  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    let maxCorr = 0, bestLag = 0;
    for (let lag = 20; lag < frameSize / 2; lag++) {
      let corr = 0;
      for (let j = 0; j < frameSize - lag; j++) {
        corr += frame[j] * frame[j + lag];
      }
      if (corr > maxCorr) { maxCorr = corr; bestLag = lag; }
    }
    if (bestLag > 0) pitchValues.push(sampleRate / bestLag);
  }
  
  const pitchMean = pitchValues.length > 0 ? pitchValues.reduce((a, b) => a + b) / pitchValues.length : 0;
  const pitchVariance = pitchValues.length > 0 
    ? pitchValues.reduce((sum, v) => sum + (v - pitchMean) ** 2, 0) / pitchValues.length 
    : 0;
  
  // Energy
  let energy = 0;
  for (const s of samples) energy += s * s;
  energy = Math.sqrt(energy / samples.length);
  
  // Speech rate (zero crossings)
  let zc = 0;
  for (let i = 1; i < samples.length; i++) {
    if (Math.sign(samples[i]) !== Math.sign(samples[i - 1])) zc++;
  }
  const speechRate = zc / samples.length * sampleRate;
  
  return { pitchMean, pitchVariance, energy, speechRate };
}

// Classify emotion from features
export function analyzeEmotion(samples: Float32Array, sampleRate: number = 16000): EmotionAnalysis {
  const features = extractEmotionFeatures(samples, sampleRate);
  
  const normalizedPitch = Math.min(1, Math.max(0, (features.pitchMean - 80) / 200));
  const normalizedEnergy = Math.min(1, Math.max(0, features.energy * 10));
  const normalizedRate = Math.min(1, Math.max(0, (features.speechRate - 100) / 300));
  const normalizedPitchVar = Math.min(1, features.pitchVariance / 2000);
  
  const arousal = (normalizedPitch + normalizedEnergy + normalizedRate) / 3 * 2 - 1;
  const valence = (1 - normalizedPitchVar) * 2 - 1;
  
  let primary: Emotion = 'neutral';
  let confidence = 0.5;
  
  if (arousal > 0.3 && valence > 0.3) { primary = 'happy'; confidence = (arousal + valence) / 2; }
  else if (arousal > 0.3 && valence < -0.3) { primary = 'angry'; confidence = (arousal - valence) / 2; }
  else if (arousal < -0.3 && valence < -0.3) { primary = 'sad'; confidence = (-arousal - valence) / 2; }
  else if (arousal < -0.3 && valence > 0.3) { primary = 'calm'; confidence = (-arousal + valence) / 2; }
  
  return { primary, confidence: Math.min(1, Math.max(0.3, confidence)), arousal, valence, features };
}

// Get emotion-adjusted threshold
export function getEmotionAdjustedThreshold(baseThreshold: number, emotion: EmotionAnalysis): number {
  const adjustments: Record<Emotion, number> = {
    neutral: 0, calm: -0.02, happy: 0.05, sad: 0.08, angry: 0.1, fearful: 0.12, surprised: 0.05
  };
  const adjustment = (adjustments[emotion.primary] || 0) * emotion.confidence;
  return baseThreshold + Math.max(-0.15, Math.min(0.15, adjustment));
}

// Analyze auth-emotion context
export function analyzeAuthEmotionContext(
  audio: Float32Array,
  originalThreshold: number,
  authConfidence: number,
  sampleRate: number = 16000
) {
  const emotion = analyzeEmotion(audio, sampleRate);
  const adjustedThreshold = getEmotionAdjustedThreshold(originalThreshold, emotion);
  const shouldRetry = emotion.primary !== 'neutral' && 
    authConfidence < adjustedThreshold && 
    authConfidence > originalThreshold - 0.2;
  
  let userMessage: string | undefined;
  if (shouldRetry) {
    if (emotion.primary === 'angry' || emotion.primary === 'fearful') {
      userMessage = "Take a moment and try again when you're ready.";
    } else if (emotion.primary === 'sad') {
      userMessage = "Your voice sounds a bit different. Try again?";
    }
  }
  
  return { emotion, adjustedThreshold, originalThreshold, shouldRetry, userMessage };
}

export default { analyzeEmotion, getEmotionAdjustedThreshold, analyzeAuthEmotionContext };
