/**
 * Audio Analysis Worker Thread
 *
 * This file contains the audio analysis logic that runs in a separate thread.
 * It's loaded by audio-analysis-pool.ts via worker_threads.
 *
 * SECURITY: This file is loaded as a separate module, NOT via eval().
 */

const { parentPort } = require('node:worker_threads');

// Simple prosody analysis (would be more sophisticated in production)
function analyzeProsody(audioData, sampleRate) {
  const n = audioData.length;
  if (n === 0) return null;

  // Calculate energy
  let energySum = 0;
  for (let i = 0; i < n; i++) {
    energySum += audioData[i] * audioData[i];
  }
  const energyMean = energySum / n;

  // Calculate energy variance
  let energyVarSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = audioData[i] * audioData[i] - energyMean;
    energyVarSum += diff * diff;
  }
  const energyVariance = energyVarSum / n;

  // Estimate pitch using autocorrelation (simplified)
  const minPeriod = Math.floor(sampleRate / 500); // Max 500Hz
  const maxPeriod = Math.floor(sampleRate / 50); // Min 50Hz

  let maxCorr = 0;
  let bestPeriod = 0;

  for (let period = minPeriod; period < maxPeriod && period < n / 2; period++) {
    let corr = 0;
    for (let i = 0; i < n - period; i++) {
      corr += audioData[i] * audioData[i + period];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestPeriod = period;
    }
  }

  const pitchHz = bestPeriod > 0 ? sampleRate / bestPeriod : 150;

  return {
    pitchMean: pitchHz,
    pitchRange: 30,
    pitchVariance: 0.3,
    energyMean: Math.sqrt(energyMean),
    energyVariance: Math.sqrt(energyVariance),
    speechRate: 150,
    pauseFrequency: 3,
    pauseDuration: 300,
  };
}

// Simple emotion classification based on prosody features
function classifyEmotion(prosody) {
  if (!prosody) {
    return { primary: 'neutral', confidence: 0.3, arousal: 0.5, valence: 0.5 };
  }

  const { pitchMean, energyMean } = prosody;

  // High energy + high pitch variance = excited/happy
  // Low energy + low pitch = sad
  // High energy + low pitch variance = angry

  let primary = 'neutral';
  let arousal = 0.5;
  let valence = 0.5;
  let confidence = 0.5;

  if (energyMean > 0.3 && pitchMean > 200) {
    primary = 'excited';
    arousal = 0.8;
    valence = 0.7;
    confidence = 0.6;
  } else if (energyMean < 0.1 && pitchMean < 150) {
    primary = 'sad';
    arousal = 0.2;
    valence = 0.3;
    confidence = 0.5;
  } else if (energyMean > 0.3 && pitchMean < 150) {
    primary = 'frustrated';
    arousal = 0.7;
    valence = 0.3;
    confidence = 0.5;
  }

  return { primary, confidence, arousal, valence };
}

// Laughter detection (simplified)
function detectLaughter(audioData, sampleRate) {
  // Laughter has characteristic burst patterns
  const n = audioData.length;
  let burstCount = 0;
  let inBurst = false;
  const burstThreshold = 0.2;

  for (let i = 0; i < n; i++) {
    const energy = Math.abs(audioData[i]);
    if (energy > burstThreshold && !inBurst) {
      inBurst = true;
      burstCount++;
    } else if (energy < burstThreshold * 0.5) {
      inBurst = false;
    }
  }

  const durationSec = n / sampleRate;
  const burstsPerSecond = burstCount / durationSec;

  // Laughter typically has 4-8 bursts per second
  const isLaughing = burstsPerSecond > 3 && burstsPerSecond < 10;

  return {
    isLaughing,
    confidence: isLaughing ? Math.min(burstsPerSecond / 8, 0.9) : 0.1,
    laughType: isLaughing ? 'genuine' : undefined,
    duration: isLaughing ? durationSec : undefined,
  };
}

// Speech/silence boundary detection
function detectBoundaries(audioData, sampleRate) {
  const n = audioData.length;
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const silenceThreshold = 0.02;

  const speechSegments = [];
  const silenceSegments = [];
  const breathPauses = [];

  let inSpeech = false;
  let segmentStart = 0;

  for (let i = 0; i < n; i += windowSize) {
    // Calculate window energy
    let windowEnergy = 0;
    const windowEnd = Math.min(i + windowSize, n);
    for (let j = i; j < windowEnd; j++) {
      windowEnergy += audioData[j] * audioData[j];
    }
    windowEnergy /= windowEnd - i;

    const isSilent = windowEnergy < silenceThreshold;
    const timeMs = (i / sampleRate) * 1000;

    if (isSilent && inSpeech) {
      // End of speech segment
      speechSegments.push({ start: segmentStart, end: timeMs });
      segmentStart = timeMs;
      inSpeech = false;
    } else if (!isSilent && !inSpeech) {
      // Start of speech segment
      if (segmentStart > 0) {
        const silenceDuration = timeMs - segmentStart;
        silenceSegments.push({ start: segmentStart, end: timeMs });

        // Breath pauses are typically 200-500ms
        if (silenceDuration > 150 && silenceDuration < 600) {
          breathPauses.push({ position: segmentStart, duration: silenceDuration });
        }
      }
      segmentStart = timeMs;
      inSpeech = true;
    }
  }

  // Close final segment
  const finalTimeMs = (n / sampleRate) * 1000;
  if (inSpeech) {
    speechSegments.push({ start: segmentStart, end: finalTimeMs });
  } else {
    silenceSegments.push({ start: segmentStart, end: finalTimeMs });
  }

  return { speechSegments, silenceSegments, breathPauses };
}

// Message handler
parentPort.on('message', (job) => {
  const startTime = Date.now();

  try {
    let result;

    switch (job.type) {
      case 'prosody':
        result = analyzeProsody(job.audioData, job.sampleRate);
        break;
      case 'emotion': {
        const prosody = analyzeProsody(job.audioData, job.sampleRate);
        result = classifyEmotion(prosody);
        break;
      }
      case 'laughter':
        result = detectLaughter(job.audioData, job.sampleRate);
        break;
      case 'boundaries':
        result = detectBoundaries(job.audioData, job.sampleRate);
        break;
      default:
        throw new Error('Unknown analysis type: ' + job.type);
    }

    parentPort.postMessage({
      jobId: job.id,
      type: job.type,
      result,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    parentPort.postMessage({
      jobId: job.id,
      error: error.message || String(error),
    });
  }
});
