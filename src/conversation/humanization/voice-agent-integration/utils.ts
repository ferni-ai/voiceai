/**
 * Voice Agent Integration - Utility Functions
 *
 * @module @ferni/humanization/voice-agent-integration/utils
 */

import { simulateBreathPattern, type BreathPattern } from '../breathing-sync.js';
import { getHumanizationOrchestrator } from '../index.js';
import type { VoiceSnapshot } from '../voice-print.js';

import type { HumanizationSessionState } from './types.js';
import { getSession } from './session-store.js';

/**
 * Create a VoiceSnapshot from prosody analysis data
 */
export function createVoiceSnapshot(prosodyData: {
  pitchHz?: number;
  pitchMin?: number;
  pitchMax?: number;
  speechRate?: number;
  energy?: number;
  breathiness?: number;
  roughness?: number;
  strain?: number;
  valence?: number;
  arousal?: number;
}): VoiceSnapshot {
  return {
    pitchMean: prosodyData.pitchHz || 150,
    pitchMin: prosodyData.pitchMin || 100,
    pitchMax: prosodyData.pitchMax || 200,
    pitchVariance:
      prosodyData.pitchMax && prosodyData.pitchMin
        ? (prosodyData.pitchMax - prosodyData.pitchMin) / 4
        : 25,
    speechRate: prosodyData.speechRate || 150,
    pauseRate: 8,
    avgPauseDuration: 400,
    energyMean: prosodyData.energy || 0.5,
    energyVariance: 0.15,
    breathiness: prosodyData.breathiness || 0.3,
    roughness: prosodyData.roughness || 0.2,
    strain: prosodyData.strain || 0.1,
    valence: prosodyData.valence || 0,
    arousal: prosodyData.arousal || 0.5,
    timestamp: new Date(),
  };
}

/**
 * Simulate breath pattern from emotional state
 */
export function simulateBreathFromEmotion(emotion: string): BreathPattern {
  const emotionMap: Record<string, Parameters<typeof simulateBreathPattern>[0]> = {
    calm: { isCalm: true },
    relaxed: { isCalm: true },
    peaceful: { isCalm: true },
    anxious: { isAnxious: true },
    worried: { isAnxious: true },
    stressed: { isAnxious: true },
    tired: { isTired: true },
    exhausted: { isTired: true },
    excited: { isExcited: true },
    happy: { isExcited: true },
    enthusiastic: { isExcited: true },
  };

  const hints = emotionMap[emotion.toLowerCase()] || {};
  return simulateBreathPattern(hints);
}

/**
 * Get current session state
 */
export function getSessionState(sessionId: string): HumanizationSessionState | null {
  return getSession(sessionId) || null;
}

/**
 * Get all engine states for debugging
 */
export function getEngineStates(sessionId: string): Record<string, unknown> | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const orchestrator = getHumanizationOrchestrator(sessionId);
  return {
    sessionState: state,
    engines: orchestrator.getEngineStates(),
  };
}
