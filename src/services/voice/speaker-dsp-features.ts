/**
 * DSP voice features: the fallback speaker "embedding" when the neural model is
 * not available. Pure functions with no imports, so the speaker-embedding worker
 * thread can use them without loading the logger or native modules.
 *
 * Features extracted:
 * - Energy (overall and per frame)
 * - Zero crossing rate
 * - Mean pitch (autocorrelation)
 *
 * Returns a 192-dimensional unit vector to match the neural embedding size.
 * Measured 2026-10-04 on six TTS voices (2 s windows): these vectors do not
 * separate speakers (EER 49.9%, every cosine about 0.999).
 */

/** Extract DSP-based features for speaker characterization. */
export function extractDSPFeatures(audio: Float32Array): Float32Array {
  const features = new Float32Array(192);

  // Basic energy
  let energy = 0;
  for (const sample of audio) {
    energy += sample * sample;
  }
  energy = Math.sqrt(energy / audio.length);
  features[0] = energy;

  // Zero crossing rate
  let zcr = 0;
  for (let i = 1; i < audio.length; i++) {
    if (audio[i] >= 0 !== audio[i - 1] >= 0) {
      zcr++;
    }
  }
  features[1] = zcr / audio.length;

  // Simple spectral features using autocorrelation
  const frameSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((audio.length - frameSize) / hopSize);

  let pitchSum = 0;
  let pitchCount = 0;

  for (let frame = 0; frame < Math.min(numFrames, 100); frame++) {
    const start = frame * hopSize;
    const frameData = audio.slice(start, start + frameSize);

    // Estimate pitch using simple autocorrelation
    const pitch = estimatePitch(frameData, 16000);
    if (pitch > 50 && pitch < 500) {
      pitchSum += pitch;
      pitchCount++;
    }

    // Store frame energy
    if (frame < 50) {
      let frameEnergy = 0;
      for (const sample of frameData) {
        frameEnergy += sample * sample;
      }
      features[2 + frame] = Math.sqrt(frameEnergy / frameData.length);
    }
  }

  // Mean pitch
  features[52] = pitchCount > 0 ? pitchSum / pitchCount : 150;

  // Fill remaining with hash of audio for uniqueness
  let hash = 0;
  for (let i = 0; i < Math.min(audio.length, 1000); i++) {
    hash = ((hash << 5) - hash + Math.floor(audio[i] * 1000)) | 0;
  }

  for (let i = 53; i < 192; i++) {
    features[i] = ((hash >> (i % 32)) & 0xff) / 255;
    hash = ((hash << 5) - hash + i) | 0;
  }

  // Normalize to unit length
  let norm = 0;
  for (const f of features) {
    norm += f * f;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < features.length; i++) {
      features[i] /= norm;
    }
  }

  return features;
}

/** Simple pitch estimation using autocorrelation. */
function estimatePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 500); // 500 Hz max
  const maxLag = Math.floor(sampleRate / 50); // 50 Hz min

  let maxCorr = 0;
  let bestLag = 0;

  for (let lag = minLag; lag < Math.min(maxLag, frame.length / 2); lag++) {
    let corr = 0;
    for (let i = 0; i < frame.length - lag; i++) {
      corr += frame[i] * frame[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}
