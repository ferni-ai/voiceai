/**
 * Audio Analysis Worker Thread
 *
 * Runs in a separate thread to offload CPU-intensive audio analysis
 * from the main event loop. Handles prosody, emotion, laughter,
 * and boundary detection.
 *
 * @module workers/audio-analysis-worker-thread
 */

import { parentPort } from 'node:worker_threads';
import type {
  AudioAnalysisJob,
  AudioAnalysisResult,
  ProsodyResult,
  EmotionResult,
  LaughterResult,
  BoundaryResult,
} from './audio-analysis-pool.js';

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Extract prosody features from audio
 */
function analyzeProsody(audioData: Float32Array, sampleRate: number): ProsodyResult {
  // Simple prosody analysis (production would use more sophisticated DSP)
  const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop

  const energies: number[] = [];
  const pitches: number[] = [];
  let silenceFrames = 0;
  let pauseCount = 0;
  let inSilence = false;
  const pauseDurations: number[] = [];
  let currentPauseDuration = 0;

  // Analyze frames
  for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);

    // Calculate frame energy (RMS)
    let energy = 0;
    for (const sample of frame) {
      energy += sample * sample;
    }
    energy = Math.sqrt(energy / frame.length);
    energies.push(energy);

    // Simple pitch estimation via zero-crossing rate
    let zeroCrossings = 0;
    for (let j = 1; j < frame.length; j++) {
      if ((frame[j] >= 0 && frame[j - 1] < 0) || (frame[j] < 0 && frame[j - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const estimatedPitch = (zeroCrossings * sampleRate) / (2 * frame.length);
    if (energy > 0.01 && estimatedPitch > 50 && estimatedPitch < 500) {
      pitches.push(estimatedPitch);
    }

    // Detect silence/pauses
    const isSilent = energy < 0.01;
    if (isSilent) {
      silenceFrames++;
      currentPauseDuration += hopSize / sampleRate;
      if (!inSilence) {
        inSilence = true;
        pauseCount++;
      }
    } else {
      if (inSilence && currentPauseDuration > 0.1) {
        pauseDurations.push(currentPauseDuration);
      }
      inSilence = false;
      currentPauseDuration = 0;
    }
  }

  // Calculate statistics
  const pitchMean = pitches.length > 0 ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0;
  const pitchVariance =
    pitches.length > 0
      ? pitches.reduce((sum, p) => sum + Math.pow(p - pitchMean, 2), 0) / pitches.length
      : 0;
  const pitchRange = pitches.length > 0 ? Math.max(...pitches) - Math.min(...pitches) : 0;

  const energyMean =
    energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0;
  const energyVariance =
    energies.length > 0
      ? energies.reduce((sum, e) => sum + Math.pow(e - energyMean, 2), 0) / energies.length
      : 0;

  const totalDuration = audioData.length / sampleRate;
  const speechFrames = energies.length - silenceFrames;
  const speechRate = speechFrames > 0 ? speechFrames / totalDuration : 0;
  const avgPauseDuration =
    pauseDurations.length > 0
      ? pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length
      : 0;

  return {
    pitchMean,
    pitchRange,
    pitchVariance,
    energyMean,
    energyVariance,
    speechRate,
    pauseFrequency: pauseCount / totalDuration,
    pauseDuration: avgPauseDuration,
  };
}

/**
 * Classify emotion from audio features
 */
function classifyEmotion(audioData: Float32Array, sampleRate: number): EmotionResult {
  // Extract basic features for emotion classification
  const prosody = analyzeProsody(audioData, sampleRate);

  // Simple emotion classification based on prosody features
  // In production, this would use a trained ML model
  let arousal = 0.5;
  let valence = 0.5;

  // Higher pitch variance and energy suggest higher arousal
  if (prosody.pitchVariance > 1000) arousal += 0.2;
  if (prosody.energyMean > 0.05) arousal += 0.15;
  if (prosody.speechRate > 5) arousal += 0.1;

  // Faster speech rate with high energy often indicates excitement (positive)
  if (prosody.speechRate > 4 && prosody.energyMean > 0.03) valence += 0.1;
  // Many pauses with low energy may indicate sadness (negative)
  if (prosody.pauseFrequency > 0.5 && prosody.energyMean < 0.02) valence -= 0.15;

  // Determine primary emotion based on arousal/valence
  let primary = 'neutral';
  let secondary: string | undefined;
  let confidence = 0.5;

  if (arousal > 0.7 && valence > 0.6) {
    primary = 'joy';
    secondary = 'excitement';
    confidence = 0.7;
  } else if (arousal > 0.7 && valence < 0.4) {
    primary = 'anger';
    secondary = 'frustration';
    confidence = 0.65;
  } else if (arousal < 0.4 && valence < 0.4) {
    primary = 'sadness';
    confidence = 0.6;
  } else if (arousal < 0.4 && valence > 0.6) {
    primary = 'contentment';
    confidence = 0.55;
  }

  return {
    primary,
    secondary,
    confidence: Math.min(1, Math.max(0, confidence)),
    arousal: Math.min(1, Math.max(0, arousal)),
    valence: Math.min(1, Math.max(0, valence)),
  };
}

/**
 * Detect laughter in audio
 */
function detectLaughter(audioData: Float32Array, sampleRate: number): LaughterResult {
  const frameSize = Math.floor(sampleRate * 0.05); // 50ms frames
  const hopSize = Math.floor(sampleRate * 0.025); // 25ms hop

  let laughterFrames = 0;
  let totalFrames = 0;
  let maxEnergy = 0;

  // Laughter characteristics: periodic energy bursts, higher zero-crossing rate
  const energyBursts: number[] = [];

  for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    totalFrames++;

    // Calculate energy
    let energy = 0;
    for (const sample of frame) {
      energy += sample * sample;
    }
    energy = Math.sqrt(energy / frame.length);
    maxEnergy = Math.max(maxEnergy, energy);

    // Zero-crossing rate (needs index for previous element)
    let zeroCrossings = 0;
    for (let j = 1; j < frame.length; j++) {
      if ((frame[j] >= 0 && frame[j - 1] < 0) || (frame[j] < 0 && frame[j - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / frame.length;

    // Laughter tends to have medium-high energy with rapid fluctuations
    if (energy > 0.02 && energy < 0.15 && zcr > 0.1) {
      laughterFrames++;
      energyBursts.push(energy);
    }
  }

  const laughterRatio = totalFrames > 0 ? laughterFrames / totalFrames : 0;
  const isLaughing = laughterRatio > 0.15;

  // Determine laugh type based on characteristics
  let laughType: 'genuine' | 'polite' | 'nervous' | undefined;
  if (isLaughing) {
    const avgBurstEnergy =
      energyBursts.length > 0 ? energyBursts.reduce((a, b) => a + b, 0) / energyBursts.length : 0;
    if (avgBurstEnergy > 0.08 && laughterRatio > 0.3) {
      laughType = 'genuine';
    } else if (avgBurstEnergy < 0.04) {
      laughType = 'polite';
    } else {
      laughType = 'nervous';
    }
  }

  return {
    isLaughing,
    confidence: Math.min(1, laughterRatio * 3),
    laughType,
    duration: isLaughing ? (laughterFrames * hopSize) / sampleRate : undefined,
  };
}

/**
 * Detect speech/silence boundaries
 */
function detectBoundaries(audioData: Float32Array, sampleRate: number): BoundaryResult {
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
  const silenceThreshold = 0.008;
  const breathThreshold = 0.004;

  const speechSegments: Array<{ start: number; end: number }> = [];
  const silenceSegments: Array<{ start: number; end: number }> = [];
  const breathPauses: Array<{ position: number; duration: number }> = [];

  let inSpeech = false;
  let segmentStart = 0;
  let previousEnergy = 0;

  for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const currentTime = i / sampleRate;

    // Calculate energy
    let energy = 0;
    for (const sample of frame) {
      energy += sample * sample;
    }
    energy = Math.sqrt(energy / frame.length);

    const isSpeech = energy > silenceThreshold;

    // State transition: silence -> speech
    if (isSpeech && !inSpeech) {
      // End silence segment
      if (segmentStart > 0) {
        silenceSegments.push({ start: segmentStart, end: currentTime });
      }
      segmentStart = currentTime;
      inSpeech = true;
    }
    // State transition: speech -> silence
    else if (!isSpeech && inSpeech) {
      // End speech segment
      speechSegments.push({ start: segmentStart, end: currentTime });
      segmentStart = currentTime;
      inSpeech = false;
    }

    // Detect breath pauses (very quiet, short gaps within speech)
    if (
      energy < breathThreshold &&
      previousEnergy >= silenceThreshold &&
      silenceSegments.length > 0
    ) {
      const lastSilence = silenceSegments[silenceSegments.length - 1];
      const duration = lastSilence.end - lastSilence.start;
      if (duration > 0.1 && duration < 0.5) {
        breathPauses.push({ position: lastSilence.start, duration });
      }
    }

    previousEnergy = energy;
  }

  // Close final segment
  const finalTime = audioData.length / sampleRate;
  if (inSpeech) {
    speechSegments.push({ start: segmentStart, end: finalTime });
  } else if (segmentStart > 0) {
    silenceSegments.push({ start: segmentStart, end: finalTime });
  }

  return {
    speechSegments,
    silenceSegments,
    breathPauses,
  };
}

// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

if (parentPort) {
  // Capture parentPort to avoid non-null assertions in callback
  const port = parentPort;

  port.on('message', (job: AudioAnalysisJob) => {
    const startTime = Date.now();
    let result: ProsodyResult | EmotionResult | LaughterResult | BoundaryResult;

    try {
      switch (job.type) {
        case 'prosody':
          result = analyzeProsody(job.audioData, job.sampleRate);
          break;
        case 'emotion':
          result = classifyEmotion(job.audioData, job.sampleRate);
          break;
        case 'laughter':
          result = detectLaughter(job.audioData, job.sampleRate);
          break;
        case 'boundaries':
          result = detectBoundaries(job.audioData, job.sampleRate);
          break;
        default:
          throw new Error(`Unknown analysis type: ${job.type}`);
      }

      const response: AudioAnalysisResult = {
        jobId: job.id,
        type: job.type,
        result,
        durationMs: Date.now() - startTime,
      };

      port.postMessage(response);
    } catch (error) {
      port.postMessage({
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
