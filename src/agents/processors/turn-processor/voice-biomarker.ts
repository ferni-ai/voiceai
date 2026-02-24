/**
 * Turn Processor - Voice Biomarker Enrichment
 *
 * Combines text-based emotion detection with voice biomarkers from Rust DSP pipeline.
 * Voice biomarkers (jitter, shimmer, energy) reveal emotions that text analysis
 * misses — e.g. hidden anxiety behind "I'm fine", or masking sadness behind
 * upbeat words. When biomarkers contradict text, we trust the voice more.
 */

import type { UserData } from '../../shared/types.js';

/**
 * Enrich text-derived emotion with voice biomarker signals.
 *
 * @param textEmotion - Emotion detected from text transcript
 * @param biomarkers - Real-time voice features from Rust DSP pipeline
 * @returns Enriched emotion with confidence and optional mismatch flag
 */
export function enrichEmotionWithVoice(
  textEmotion: { primary: string; intensity: number },
  biomarkers?: UserData['rustDspBiomarkers']
): { primary: string; intensity: number; confidence: number; mismatch?: string } {
  if (!biomarkers) return { ...textEmotion, confidence: 0.6 }; // text-only = 60%

  // High jitter + calm text = hidden anxiety
  // Jitter measures pitch instability — elevated when voice trembles from nervousness
  if (biomarkers.jitter > 0.5 && textEmotion.primary === 'neutral') {
    return { primary: 'anxious', intensity: biomarkers.jitter, confidence: 0.85, mismatch: 'voice-text' };
  }

  // Low energy + positive text = masking sadness
  // When someone says "I'm great!" but their voice has no energy, they're likely masking
  if (biomarkers.energy < 0.3 && textEmotion.primary === 'happy') {
    return { primary: 'sad', intensity: 0.6, confidence: 0.8, mismatch: 'energy-text' };
  }

  // High shimmer + any text = suppressed emotion
  // Shimmer measures amplitude variation — elevated when trying to control vocal output
  if (biomarkers.shimmer > 0.6 && textEmotion.intensity < 0.3) {
    return { primary: textEmotion.primary, intensity: 0.6, confidence: 0.8, mismatch: 'suppressed' };
  }

  // Voice confirms text = high confidence
  return { ...textEmotion, confidence: 0.95 };
}
