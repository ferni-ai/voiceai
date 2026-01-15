/**
 * EmotionDetector Interface (Port)
 *
 * Defines the contract for text-based emotion detection.
 * Domain depends on this interface, infrastructure implements it.
 *
 * @module personality/domain/interfaces/emotion-detector
 */

import type {
  PrimaryEmotion,
  GranularEmotion,
  EmotionalTrajectory,
} from '../model/value-objects/emotional-state.js';
import type { EmotionalState } from '../model/value-objects/emotional-state.js';

/**
 * Text input for emotion detection
 */
export interface EmotionDetectionInput {
  /** The text to analyze */
  text: string;
  /** Recent messages for context */
  recentMessages?: string[];
  /** Known user vocabulary */
  userVocabulary?: Map<string, PrimaryEmotion>;
}

/**
 * Result of emotion detection
 */
export interface EmotionDetectionResult {
  /** Primary emotion */
  primary: PrimaryEmotion;
  /** Granular emotion */
  granular: GranularEmotion | null;
  /** Confidence (0-1) */
  confidence: number;
  /** Intensity (0-1) */
  intensity: number;
  /** Topics associated with this emotion */
  associatedTopics: string[];
  /** Evidence strings that led to this detection */
  evidence: string[];
}

/**
 * Result of contradiction detection
 */
export interface ContradictionResult {
  /** Was a contradiction detected? */
  detected: boolean;
  /** The contradicting emotions */
  emotions?: [PrimaryEmotion, PrimaryEmotion];
  /** Granular emotions if available */
  granularEmotions?: [GranularEmotion | null, GranularEmotion | null];
  /** Validation phrase to use */
  validationPhrase?: string;
  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Result of trajectory analysis
 */
export interface TrajectoryResult {
  /** Current trajectory */
  trajectory: EmotionalTrajectory;
  /** Confidence (0-1) */
  confidence: number;
  /** Evidence for this assessment */
  evidence: string[];
  /** Days of data considered */
  daysAnalyzed: number;
}

/**
 * First-time vulnerability detection result
 */
export interface FirstTimeVulnerabilityResult {
  /** Is this a first-time share? */
  isFirstTime: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** Markers detected */
  markers: string[];
  /** Suggested acknowledgment */
  suggestedAcknowledgment?: string;
  /** Vulnerability level (1-5) */
  vulnerabilityLevel: number;
}

/**
 * EmotionDetector Interface
 *
 * This port defines what text-based emotion detection the domain needs.
 * Can be implemented with LLM, rule-based, or hybrid approaches.
 */
export interface EmotionDetector {
  /**
   * Detect emotion from text
   *
   * Basic emotion detection from user message
   */
  detectEmotion(input: EmotionDetectionInput): Promise<EmotionDetectionResult>;

  /**
   * Detect emotional contradictions (both/and)
   *
   * SUPERHUMAN: We validate contradictions instead of trying to resolve them
   */
  detectContradiction(
    text: string,
    detectedEmotions: PrimaryEmotion[]
  ): Promise<ContradictionResult>;

  /**
   * Analyze emotional trajectory over time
   *
   * SUPERHUMAN: Track if things are getting better or worse
   */
  analyzeTrajectory(emotionalHistory: EmotionalState[]): Promise<TrajectoryResult>;

  /**
   * Detect first-time vulnerability
   *
   * SUPERHUMAN: Notice when someone shares something for the first time
   */
  detectFirstTimeVulnerability(text: string, userId: string): Promise<FirstTimeVulnerabilityResult>;

  /**
   * Extract topics associated with emotions
   *
   * For pattern detection (topic → emotion correlations)
   */
  extractEmotionalTopics(text: string): Promise<{
    topics: string[];
    topicEmotionPairs: Array<{ topic: string; emotion: PrimaryEmotion; confidence: number }>;
  }>;

  /**
   * Detect vague emotions that need clarification
   *
   * SUPERHUMAN: Help them name their feelings more precisely
   */
  detectVagueEmotions(text: string): Promise<{
    vagueTerms: string[];
    suggestedPreciseEmotions: Map<string, GranularEmotion[]>;
    clarifyingQuestions: string[];
  }>;

  /**
   * Detect crisis signals in text
   *
   * SUPERHUMAN: Catch crisis before it escalates
   */
  detectCrisisSignals(text: string): Promise<{
    isCrisis: boolean;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    signals: string[];
    recommendedResponse: string;
  }>;
}

/**
 * Type helper for emotion detector implementations
 */
export type EmotionDetectorImpl = EmotionDetector;
