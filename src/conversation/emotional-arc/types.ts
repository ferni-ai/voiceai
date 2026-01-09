/**
 * Emotional Arc Types
 *
 * Types for emotional trajectory tracking.
 *
 * @module @ferni/conversation/emotional-arc/types
 */

export interface EmotionalSnapshot {
  timestamp: number;
  textEmotion: string;
  textIntensity: number;
  voiceEmotion?: string;
  voiceArousal?: number;
  voiceValence?: number;
  combinedValence: number; // -1 to 1
  combinedArousal: number; // -1 to 1
}

export interface EmotionalArc {
  // Current state
  currentEmotion: string;
  currentValence: number;
  currentArousal: number;

  // Trajectory
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';
  trajectoryConfidence: number;

  // Momentum (rate of change)
  valenceMomentum: number;
  arousalMomentum: number;

  // Temperature (overall intensity)
  conversationTemperature: number;

  // Smoothed values for stable output
  smoothedValence: number;
  smoothedArousal: number;

  // Turn count since significant emotional event
  turnsSinceEmotionalPeak: number;
  turnsSinceDistress: number;

  // Flags
  needsEmotionalSupport: boolean;
  emotionStabilizing: boolean;
  suddenShiftDetected: boolean;
}

export interface EmotionalResponse {
  suggestedTone: 'match' | 'calm' | 'uplift' | 'celebrate' | 'support';
  speedAdjust: number;
  volumeAdjust: number;
  warmthLevel: 'high' | 'medium' | 'low';
  pauseFrequency: 'more' | 'normal' | 'less';
  guidance: string;
  suggestedEmotion: string;
  suggestedBreaks: boolean;
}

/**
 * Narrative arc phase - the dramatic structure of a conversation
 */
export type NarrativePhase = 'opening' | 'building' | 'peak' | 'release' | 'closing';

/**
 * Cross-session emotional arc summary
 */
export interface CrossSessionArcSummary {
  sessionCount: number;
  lastSessionDate: number;
  emotionalBaseline: {
    valence: number;
    arousal: number;
  };
  emotionalTriggers: Array<{
    topic: string;
    avgValence: number;
    avgArousal: number;
    occurrences: number;
  }>;
  growthTrajectory: 'improving' | 'stable' | 'struggling';
  dominantEmotions: string[];
}

/**
 * Emotion to valence mapping
 */
export const EMOTION_VALENCE_MAP: Record<string, number> = {
  // Positive
  happy: 0.8,
  excited: 0.7,
  grateful: 0.7,
  hopeful: 0.6,
  curious: 0.3,
  confident: 0.5,
  // Negative
  sad: -0.7,
  angry: -0.6,
  frustrated: -0.5,
  anxious: -0.4,
  worried: -0.4,
  fearful: -0.6,
  overwhelmed: -0.5,
  guilty: -0.4,
  // Neutral
  neutral: 0,
  calm: 0.1,
  confused: -0.1,
};
