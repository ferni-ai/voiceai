/**
 * Prosody Bridge - Connects Voice Agent Audio Analysis to Humanization
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module bridges the gap between the voice agent's real-time audio prosody
 * analysis and the humanization system's voice learning capabilities.
 *
 * It enables:
 * - Voice print learning from real prosody data
 * - Breathing pattern detection
 * - Ambient sound awareness integration
 * - Cross-session voice characteristic tracking
 *
 * @module @ferni/humanization/prosody-bridge
 */

import type { ProsodyFeatures, VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { createLogger } from '../../utils/safe-logger.js';
import { type AmbientDetectionResult } from './ambient-awareness.js';
import { getBreathingSyncEngine, type BreathPattern } from './breathing-sync.js';
import { getCrossSessionVoiceEngine } from './cross-session-voice.js';
import { getVoicePrintEngine, type VoiceSnapshot } from './voice-print.js';

const logger = createLogger({ module: 'ProsodyBridge' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface BridgeState {
  lastProcessedAt: number;
  snapshotCount: number;
  calibrationComplete: boolean;
  baselinePitch: number;
  baselineEnergy: number;
  baselineRate: number;
}

const bridgeStates = new Map<string, BridgeState>();

// ============================================================================
// PROSODY TO VOICE SNAPSHOT CONVERSION
// ============================================================================

/**
 * Convert prosody features to a VoiceSnapshot for the humanization system
 */
export function prosodyToVoiceSnapshot(
  prosody: ProsodyFeatures,
  emotion: VoiceEmotionResult
): VoiceSnapshot {
  return {
    // Pitch characteristics
    pitchMean: prosody.pitchMean || 150,
    pitchMin: Math.max(50, prosody.pitchMean - prosody.pitchRange / 2),
    pitchMax: prosody.pitchMean + prosody.pitchRange / 2,
    pitchVariance: prosody.pitchVariance || 25,

    // Speech rate
    speechRate: prosody.speechRate * 30 || 150, // Convert syllables/sec to words/min

    // Pause patterns
    pauseRate: prosody.pauseFrequency || 8,
    avgPauseDuration: prosody.pauseDuration || 400,

    // Energy
    energyMean: normalizeEnergy(prosody.energyMean),
    energyVariance: Math.abs(prosody.energyVariance) / 20 || 0.15,

    // Voice quality
    breathiness: prosody.breathiness || 0.3,
    roughness: prosody.jitter || 0.2,
    strain: emotion.stressLevel || 0.1,

    // Emotional valence
    valence: emotion.valence || 0,
    arousal: emotion.arousal || 0.5,

    timestamp: new Date(),
  };
}

/**
 * Normalize dB energy to 0-1 scale
 */
function normalizeEnergy(energyDb: number): number {
  // Typical range: -60 dB (silence) to 0 dB (max)
  const normalized = (energyDb + 60) / 60;
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// BREATH PATTERN DETECTION
// ============================================================================

/**
 * Estimate breathing pattern from prosody features
 */
export function prosodyToBreathPattern(prosody: ProsodyFeatures): BreathPattern {
  // Estimate breaths per minute from pause patterns
  // Average adult: 12-20 breaths/min
  // Longer pauses often indicate breath-taking
  const pausesPerMin = prosody.pauseFrequency;
  const avgPauseDuration = prosody.pauseDuration;

  // Longer pauses (>300ms) often indicate breathing
  const likelyBreathPauses = avgPauseDuration > 300;
  const breathsPerMin = likelyBreathPauses ? Math.min(20, Math.max(8, pausesPerMin)) : 14;

  // Cycle duration in ms
  const cycleDuration = 60000 / breathsPerMin;

  // Inhale/exhale ratio (typically 1:1.5 to 1:2)
  // Stressed speakers have shorter exhales
  const stressIndicator = prosody.jitter + prosody.shimmer;
  const exhaleRatio = stressIndicator > 0.1 ? 1.3 : 1.7;

  const inhaleDuration = cycleDuration / (1 + exhaleRatio);
  const exhaleDuration = cycleDuration - inhaleDuration;
  const pauseDuration = avgPauseDuration;

  // Depth estimation from energy variance
  const depth: 'deep' | 'normal' | 'shallow' =
    prosody.energyVariance > 10 ? 'deep' : prosody.energyVariance > 5 ? 'normal' : 'shallow';

  return {
    breathsPerMinute: breathsPerMin,
    cycleDuration,
    inhaleDuration,
    exhaleDuration,
    pauseDuration,
    currentPhase: 'exhale' as const,
    nextExhaleMs: cycleDuration,
    depth,
    confidence: likelyBreathPauses ? 0.7 : 0.4,
  };
}

// ============================================================================
// MAIN BRIDGE FUNCTIONS
// ============================================================================

/**
 * Process voice emotion result through the humanization bridge
 *
 * Call this when the voice agent's prosody analyzer produces a result.
 * It feeds the data into all relevant humanization engines.
 */
export function processProsodyForHumanization(
  sessionId: string,
  userId: string,
  voiceEmotion: VoiceEmotionResult
): void {
  // Get or create bridge state
  let state = bridgeStates.get(sessionId);
  if (!state) {
    state = {
      lastProcessedAt: 0,
      snapshotCount: 0,
      calibrationComplete: false,
      baselinePitch: 150,
      baselineEnergy: 0.5,
      baselineRate: 150,
    };
    bridgeStates.set(sessionId, state);
  }

  // Rate limit to avoid overwhelming the system
  const now = Date.now();
  if (now - state.lastProcessedAt < 500) {
    return; // Skip if processed less than 500ms ago
  }
  state.lastProcessedAt = now;

  // Skip low-confidence results
  if (voiceEmotion.confidence < 0.3) {
    return;
  }

  const prosody = voiceEmotion.prosody;
  if (!prosody) {
    return;
  }

  // 1. Convert to voice snapshot and feed to voice print engine
  const snapshot = prosodyToVoiceSnapshot(prosody, voiceEmotion);
  const voicePrint = getVoicePrintEngine(userId);
  voicePrint.recordSnapshot(snapshot);
  state.snapshotCount++;

  // Calibrate baseline after 5 snapshots
  if (!state.calibrationComplete && state.snapshotCount >= 5) {
    state.baselinePitch = prosody.pitchMean;
    state.baselineEnergy = normalizeEnergy(prosody.energyMean);
    state.baselineRate = prosody.speechRate * 30;
    state.calibrationComplete = true;
    logger.debug({ sessionId, userId }, '✅ Voice baseline calibrated');
  }

  // 2. Convert to breath pattern and feed to breathing sync
  const breathPattern = prosodyToBreathPattern(prosody);
  const breathingSync = getBreathingSyncEngine(sessionId);
  breathingSync.updateUserPattern(breathPattern);

  // 3. Cross-session voice tracking is handled by startSession/endSession
  // The engine automatically detects changes when sessions start

  // 4. Record the user message context for the orchestrator
  // (The orchestrator is called with each user message via processUserMessage)

  logger.debug(
    {
      sessionId,
      userId,
      confidence: voiceEmotion.confidence,
      emotion: voiceEmotion.primary,
      snapshotCount: state.snapshotCount,
    },
    '🎤 Prosody processed for humanization'
  );
}

/**
 * Get voice state detection for current user
 * Returns insights like "you sound tired today" or "more energetic than usual"
 */
export function getVoiceStateInsight(
  sessionId: string,
  userId: string,
  currentProsody: ProsodyFeatures,
  currentEmotion: VoiceEmotionResult
): {
  hasInsight: boolean;
  insight?: string;
  suggestedAcknowledgment?: string;
  deviation?: 'significant' | 'moderate' | 'none';
} {
  const voicePrint = getVoicePrintEngine(userId);

  if (!voicePrint.isCalibrated()) {
    return { hasInsight: false, deviation: 'none' };
  }

  const snapshot = prosodyToVoiceSnapshot(currentProsody, currentEmotion);
  const detection = voicePrint.detectState(snapshot);

  // Check if there's significant deviation from baseline
  const hasDeviation = detection.currentState.deviationFromBaseline > 0.15;
  if (!hasDeviation) {
    return { hasInsight: false, deviation: 'none' };
  }

  return {
    hasInsight: true,
    insight: detection.currentState.emotion || undefined,
    suggestedAcknowledgment: detection.suggestedAcknowledgments[0] || undefined,
    deviation: detection.currentState.deviationFromBaseline > 0.3 ? 'significant' : 'moderate',
  };
}

/**
 * Get cross-session acknowledgment if user's voice has changed significantly
 */
export function getCrossSessionInsight(
  sessionId: string,
  userId: string,
  currentProsody: ProsodyFeatures,
  currentEmotion: VoiceEmotionResult
): {
  hasInsight: boolean;
  acknowledgment?: string;
  changeType?: string;
} {
  const snapshot = prosodyToVoiceSnapshot(currentProsody, currentEmotion);
  const crossSession = getCrossSessionVoiceEngine(userId);
  const ack = crossSession.generateAcknowledgment(snapshot);

  if (!ack) {
    return { hasInsight: false };
  }

  return {
    hasInsight: true,
    acknowledgment: ack.text,
    changeType: ack.type,
  };
}

// ============================================================================
// AMBIENT SOUND INTEGRATION
// ============================================================================

/**
 * Simulate ambient detection from prosody (placeholder for real ambient detection)
 *
 * In a full implementation, this would use:
 * - Background noise classification from audio frames
 * - Environmental sound detection models
 *
 * For now, we infer from prosody features:
 * - High noise floor → public/noisy environment
 * - Echo patterns → large/open space
 * - Etc.
 */
export function inferAmbientFromProsody(prosody: ProsodyFeatures): AmbientDetectionResult | null {
  // This is a simplified inference - real implementation would use
  // actual audio classification
  const speakingRatio = prosody.speakingRatio;
  const noiseLevel = 1 - speakingRatio; // Rough proxy for background activity

  if (noiseLevel < 0.2) {
    return null; // Quiet environment, nothing notable
  }

  // If there's significant background activity, might be in a busy place
  if (noiseLevel > 0.4) {
    return {
      sounds: [
        {
          sound: 'crowd' as const,
          confidence: noiseLevel,
        },
      ],
      overallConfidence: noiseLevel,
      features: {
        energyLevel: noiseLevel,
        frequencyProfile: 'broadband',
        periodicityScore: 0.3,
        noisiness: noiseLevel,
      },
    };
  }

  return null;
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize the prosody bridge for a session
 */
export function initProsodyBridge(sessionId: string, userId: string): void {
  bridgeStates.set(sessionId, {
    lastProcessedAt: 0,
    snapshotCount: 0,
    calibrationComplete: false,
    baselinePitch: 150,
    baselineEnergy: 0.5,
    baselineRate: 150,
  });
  logger.info({ sessionId, userId }, '🌉 Prosody bridge initialized');
}

/**
 * Clean up the prosody bridge for a session
 */
export function cleanupProsodyBridge(sessionId: string): void {
  bridgeStates.delete(sessionId);
  logger.debug({ sessionId }, '🌉 Prosody bridge cleaned up');
}

/**
 * Get bridge state for debugging
 */
export function getBridgeState(sessionId: string): BridgeState | null {
  return bridgeStates.get(sessionId) || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { BridgeState };
