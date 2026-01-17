/**
 * Predictive Anticipation Types
 *
 * Type definitions for the predictive anticipation engine.
 *
 * @module conversation/predictive-anticipation/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type PredictedNeed =
  | 'venting' // Let them talk, don't solve
  | 'advice' // They want solutions
  | 'validation' // Affirm their feelings
  | 'distraction' // Help them think about something else
  | 'silence' // Just be present
  | 'energy' // Lift their spirits
  | 'grounding' // Help them feel stable
  | 'connection' // They need human connection
  | 'unknown'; // Can't determine yet

export type EmotionalTrajectory =
  | 'escalating' // Getting more intense
  | 'stable' // Holding steady
  | 'de_escalating' // Calming down
  | 'cycling' // Going up and down
  | 'building_to_something'; // Leading to a reveal

export interface VoiceStatePrediction {
  state: 'tired' | 'stressed' | 'excited' | 'calm' | 'upset' | 'distracted' | 'normal';
  confidence: number;
  indicators: string[];
  acknowledgment: string | null;
}

export interface TopicSequencePrediction {
  predictedTopic: string;
  confidence: number;
  evidence: string;
  shouldPrompt: boolean;
  promptPhrase?: string;
}

export interface NeedPrediction {
  primaryNeed: PredictedNeed;
  secondaryNeed?: PredictedNeed;
  confidence: number;
  evidence: string[];
  responseGuidance: string;
}

export interface EmotionalPrediction {
  currentState: {
    valence: number;
    arousal: number;
    dominantEmotion: string;
  };
  trajectory: EmotionalTrajectory;
  predictedDirection: 'more_positive' | 'more_negative' | 'stable' | 'unknown';
  confidence: number;
  adjustmentSuggestion?: {
    type: 'energy' | 'pace' | 'tone' | 'topic';
    direction: 'increase' | 'decrease' | 'shift';
    reason: string;
  };
}

export interface PredictionResult {
  voiceState: VoiceStatePrediction;
  topicSequence: TopicSequencePrediction | null;
  need: NeedPrediction;
  emotional: EmotionalPrediction;
  overallConfidence: number;
  suggestions: string[];
}

export interface ProsodyInput {
  pitchMean: number;
  pitchVariance: number;
  speechRate: number;
  energy: number;
  strain: number;
  breathiness: number;
}

export interface UserBaseline {
  avgValence: number;
  avgArousal: number;
  typicalTopicFlow: Map<string, string[]>;
  preferredNeed: PredictedNeed;
  speechRateBaseline: number;
  energyBaseline: number;
}

export interface EmotionalHistoryEntry {
  valence: number;
  arousal: number;
  emotion: string;
  turn: number;
  timestamp: number;
}

export interface TopicTransition {
  from: string;
  to: string;
  count: number;
  contexts?: string[];
}

export interface PredictContext {
  turnCount: number;
  topic?: string;
  emotion?: string;
  valence?: number;
  arousal?: number;
  prosody?: ProsodyInput;
}
