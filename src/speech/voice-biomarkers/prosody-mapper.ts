/**
 * Map ProsodyFeatures from audio-prosody analyzer to VoiceFeatures for the biomarker pipeline.
 *
 * Bridges the main Cartesia path's prosody analysis with the VoiceBiomarkerPipeline.
 * This is a fast mapping (< 1ms) — no model inference, just unit conversion and field mapping.
 *
 * @module @ferni/speech/voice-biomarkers/prosody-mapper
 */

import type { ProsodyFeatures } from '../audio-prosody/types.js';
import type { VoiceFeatures } from './types.js';

/** Syllables per word (English average) — used for speechRate → speakingRate conversion */
const SYLLABLES_PER_WORD = 1.5;

/** Seconds per minute */
const SECONDS_PER_MINUTE = 60;

/**
 * Map ProsodyFeatures from audio-prosody analyzer to VoiceFeatures for the biomarker pipeline.
 *
 * - speechRate (syllables/sec) → speakingRate (WPM): WPM = syllables/sec * 60 / 1.5
 * - voiceQuality/breathiness → breathQuality
 *
 * @param prosody - Raw prosody from audio-prosody analyzer (may have null/undefined fields)
 * @returns VoiceFeatures for biomarker pipeline, or null if prosody is null/invalid
 */
export function mapProsodyToVoiceFeatures(
  prosody: ProsodyFeatures | null | undefined
): VoiceFeatures | null {
  if (!prosody) {
    return null;
  }

  const voiceFeatures: VoiceFeatures = {};

  // Pitch
  if (typeof prosody.pitchMean === 'number' && !Number.isNaN(prosody.pitchMean)) {
    voiceFeatures.pitchMean = prosody.pitchMean;
  }
  if (typeof prosody.pitchVariance === 'number' && !Number.isNaN(prosody.pitchVariance)) {
    voiceFeatures.pitchVariance = prosody.pitchVariance;
  }

  // Energy (0-1 normalized or dB — pipeline thresholds expect ~0.3–0.8)
  if (typeof prosody.energyMean === 'number' && !Number.isNaN(prosody.energyMean)) {
    voiceFeatures.energy = prosody.energyMean;
  }

  // Voice quality
  if (typeof prosody.jitter === 'number' && !Number.isNaN(prosody.jitter)) {
    voiceFeatures.jitter = prosody.jitter;
  }
  if (typeof prosody.shimmer === 'number' && !Number.isNaN(prosody.shimmer)) {
    voiceFeatures.shimmer = prosody.shimmer;
  }

  // Speech rate: syllables/sec → WPM (words per minute)
  // WPM = syllables_per_sec * SECONDS_PER_MINUTE / SYLLABLES_PER_WORD
  if (
    typeof prosody.speechRate === 'number' &&
    !Number.isNaN(prosody.speechRate) &&
    prosody.speechRate > 0
  ) {
    voiceFeatures.speakingRate =
      (prosody.speechRate * SECONDS_PER_MINUTE) / SYLLABLES_PER_WORD;
  }

  // Pause frequency (pauses per minute)
  if (
    typeof prosody.pauseFrequency === 'number' &&
    !Number.isNaN(prosody.pauseFrequency)
  ) {
    voiceFeatures.pauseFrequency = prosody.pauseFrequency;
  }

  // Breath quality from voiceQuality and breathiness
  if (prosody.voiceQuality) {
    switch (prosody.voiceQuality) {
      case 'breathy':
        voiceFeatures.breathQuality = 'shallow';
        break;
      case 'strained':
      case 'trembling':
        voiceFeatures.breathQuality = 'labored';
        break;
      case 'clear':
        voiceFeatures.breathQuality = 'normal';
        break;
      default:
        voiceFeatures.breathQuality = 'normal';
    }
  } else if (
    typeof prosody.breathiness === 'number' &&
    !Number.isNaN(prosody.breathiness)
  ) {
    // High breathiness → shallow; low → normal
    voiceFeatures.breathQuality = prosody.breathiness > 0.5 ? 'shallow' : 'normal';
  }

  return voiceFeatures;
}
