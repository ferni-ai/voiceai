/**
 * Human Listening Pipeline Types
 *
 * Type definitions for the unified human-like listening capabilities.
 */

import type { EngagementScoringResult } from '../../conversation/engagement-scoring.js';
import type { NarrativeArcResult } from '../../conversation/narrative-arc.js';
import type { CognitiveLoadState } from '../../intelligence/detectors/cognitive-load.js';
import type { HedgingAnalysisResult } from '../../intelligence/detectors/hedging.js';
import type { SelfSoothingResult } from '../../intelligence/detectors/self-soothing.js';
import type { BreathPatternResult } from '../breath-detection.js';
import type { EnergyDynamicsResult } from '../energy-dynamics.js';
import type { FillerAnalysisResult } from '../filler-analysis.js';
import type { FluencyAnalysisResult } from '../fluency-analysis.js';
import type { VoiceTremorResult } from '../voice-tremor.js';
import type { VolumeDynamicsState } from '../volume-dynamics.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Pre-computed prosody features from audio-prosody.ts
 * If provided, we derive audio insights from these instead of raw samples
 */
export interface ProsodyFeaturesInput {
  pitchVariance?: number;
  jitter?: number; // Tremor indicator
  shimmer?: number; // Voice strain indicator
  breathiness?: number;
  energyMean?: number;
  energyVariance?: number;
  speechRate?: number;
  pauseDuration?: number;
  pauseFrequency?: number;
  utteranceDuration?: number;
  voiceQuality?: 'clear' | 'breathy' | 'strained' | 'trembling';
}

/**
 * Context for human listening analysis
 */
export interface HumanListeningContext {
  /** Session ID */
  sessionId: string;

  /** User's text */
  text: string;

  /** Audio samples (if available) */
  audioSamples?: Float32Array;

  /** Audio sample rate */
  sampleRate?: number;

  /** Pre-computed prosody features from existing audio analysis */
  prosodyFeatures?: ProsodyFeaturesInput;

  /** Turn number in conversation */
  turnNumber: number;

  /** Current topic */
  currentTopic?: string;

  /** Detected emotion from other systems */
  emotion?: string;

  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;

  /** Duration of utterance (ms) */
  durationMs?: number;

  /** Pause info if available */
  pauseInfo?: { count: number; totalDurationMs: number };

  /** Time since last agent message (for engagement) */
  timeSinceAgentMessage?: number;
}

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

/**
 * Audio-based analysis results
 */
export interface AudioAnalysis {
  breath: BreathPatternResult | null;
  tremor: VoiceTremorResult | null;
  volumeDynamics: VolumeDynamicsState | null;
  energyDynamics: EnergyDynamicsResult | null;
}

/**
 * Text-based analysis results
 */
export interface TextAnalysis {
  cognitiveLoad: CognitiveLoadState;
  fluency: FluencyAnalysisResult;
  hedging: HedgingAnalysisResult;
  fillers: FillerAnalysisResult;
  selfSoothing: SelfSoothingResult;
}

/**
 * Conversation-based analysis results
 */
export interface ConversationAnalysis {
  narrativeArc: NarrativeArcResult;
  engagement: EngagementScoringResult;
}

/**
 * Synthesized emotional undercurrent
 */
export interface EmotionalUndercurrent {
  /** Primary underlying emotion detected */
  primary: string;

  /** Confidence in detection */
  confidence: number;

  /** Evidence sources */
  evidence: string[];

  /** Is this possibly masked by their words? */
  possiblyMasked: boolean;
}

/**
 * SSML suggestion adjustments
 */
export interface SsmlSuggestions {
  speedMultiplier: number;
  pauseMultiplier: number;
  volumeLevel: 'softer' | 'normal' | 'match';
}

/**
 * Complete human listening result
 */
export interface HumanListeningResult {
  /** Audio-based analysis (if audio provided) */
  audio: AudioAnalysis;

  /** Text-based analysis */
  text: TextAnalysis;

  /** Conversation-based analysis */
  conversation: ConversationAnalysis;

  /** Synthesized emotional undercurrent */
  emotionalUndercurrent: EmotionalUndercurrent;

  /** Overall assessment of how they're doing */
  overallAssessment: string;

  /** Priority signals the agent should attend to */
  prioritySignals: string[];

  /** Unified guidance for agent response */
  agentGuidance: string;

  /** Should agent slow down? */
  shouldSlowDown: boolean;

  /** Should agent give more space? */
  shouldGiveSpace: boolean;

  /** Is user possibly in distress? */
  possibleDistress: boolean;

  /** Suggested SSML adjustments */
  ssmlSuggestions: SsmlSuggestions;

  /** Overall confidence (0-1) */
  confidence: number;
}

/**
 * Quick analysis result (subset for real-time use)
 */
export interface QuickAnalysisResult {
  cognitiveLoad: CognitiveLoadState;
  hedging: HedgingAnalysisResult;
  selfSoothing: SelfSoothingResult;
  shouldSlowDown: boolean;
}
