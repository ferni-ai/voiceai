/**
 * Conversation Module Interfaces
 *
 * Clean architecture interfaces for dependency injection and testing.
 * These define contracts that engines must implement.
 *
 * @module @ferni/conversation/interfaces
 */

import type { ConcernState, ProsodySignals, BreathingSignals, TemporalContext as ConcernTemporalContext } from '../concern-detection/types.js';
import type { Question, QuestionContext } from '../question-patterns/types.js';
import type { TemporalGuidance, TemporalState, UpcomingEvent } from '../temporal-context/types.js';

// ============================================================================
// CONCERN DETECTION INTERFACE
// ============================================================================

/**
 * Context for concern analysis
 */
export interface ConcernAnalysisContext {
  turnCount: number;
  userEmotion?: string;
  engagementLevel?: number;
  responseLatencyMs?: number;
  prosody?: ProsodySignals;
  breathing?: BreathingSignals;
  temporal?: ConcernTemporalContext;
  previousTopics?: string[];
  currentTopic?: string;
}

/**
 * Interface for concern detection engines
 */
export interface IConcernDetector {
  /**
   * Analyze user message for concern signals
   */
  analyze(userMessage: string, context: ConcernAnalysisContext): ConcernState;

  /**
   * Get current concern state without new analysis
   */
  getCurrentState(): ConcernState;

  /**
   * Update user baseline metrics
   */
  updateBaseline(metrics: Partial<{
    avgResponseLength: number;
    avgEngagement: number;
    avgEnergy: number;
    normalSpeechRate: number;
  }>): void;

  /**
   * Record positive outcome
   */
  recordPositiveOutcome(): void;

  /**
   * Reset for new session
   */
  reset(): void;
}

// ============================================================================
// EMOTIONAL ARC INTERFACE
// ============================================================================

/**
 * Emotional state snapshot
 */
export interface EmotionalSnapshot {
  timestamp: number;
  textEmotion: string;
  textIntensity: number;
  voiceEmotion?: string;
  voiceArousal?: number;
  voiceValence?: number;
  combinedValence: number;
  combinedArousal: number;
}

/**
 * Emotional arc state
 */
export interface EmotionalArc {
  currentEmotion: string;
  currentValence: number;
  currentArousal: number;
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';
  trajectoryConfidence: number;
  valenceMomentum: number;
  arousalMomentum: number;
  conversationTemperature: number;
  smoothedValence: number;
  smoothedArousal: number;
  turnsSinceEmotionalPeak: number;
  turnsSinceDistress: number;
  needsEmotionalSupport: boolean;
  emotionStabilizing: boolean;
  suddenShiftDetected: boolean;
}

/**
 * Emotional response guidance
 */
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
 * Interface for emotional arc tracking
 */
export interface IEmotionalArcTracker {
  /**
   * Record user emotional state
   */
  recordUserEmotion(
    textEmotion: { emotion: string; intensity: number },
    voiceEmotion?: { emotion: string; arousal: number; valence: number }
  ): void;

  /**
   * Get current emotional arc
   */
  getCurrentArc(): EmotionalArc;

  /**
   * Get response recommendation based on emotional arc
   */
  getResponseRecommendation(): EmotionalResponse;

  /**
   * Get transition phrase for emotional shift
   */
  getTransitionPhrase(): string | null;

  /**
   * Reset tracker
   */
  reset(): void;
}

// ============================================================================
// QUESTION PATTERN INTERFACE
// ============================================================================

/**
 * Interface for question pattern engine
 */
export interface IQuestionPatternEngine {
  /**
   * Generate a question appropriate for context
   */
  generateQuestion(context: QuestionContext): Question;

  /**
   * Generate an echo question from user statement
   */
  generateEchoQuestion(userStatement: string): Question;

  /**
   * Generate a follow-up question
   */
  generateFollowUp(
    intent: 'deepen' | 'clarify' | 'move_on' | 'validate',
    context: QuestionContext
  ): Question;

  /**
   * Get a conversational question tag
   */
  getQuestionTag(): string;

  /**
   * Check if question type is appropriate
   */
  isTypeAppropriate(type: string): boolean;

  /**
   * Reset tracking
   */
  reset(): void;
}

// ============================================================================
// TEMPORAL CONTEXT INTERFACE
// ============================================================================

/**
 * Interface for temporal context engine
 */
export interface ITemporalContextEngine {
  /**
   * Get current temporal state
   */
  getState(now?: Date): TemporalState;

  /**
   * Get temporal guidance for response
   */
  getGuidance(turnCount: number, now?: Date): TemporalGuidance;

  /**
   * Get appropriate closing
   */
  getClosing(now?: Date, context?: { emotion?: string; topic?: string }): string;

  /**
   * Record upcoming event
   */
  recordEvent(
    description: string,
    date: Date,
    category: UpcomingEvent['category'],
    sentiment: UpcomingEvent['sentiment'],
    turnCount: number
  ): void;

  /**
   * Extract events from message
   */
  extractEvents(message: string, turnCount: number): UpcomingEvent[];

  /**
   * Mark event as followed up
   */
  markEventFollowedUp(description: string): void;

  /**
   * Get all events
   */
  getEvents(): UpcomingEvent[];

  /**
   * Reset for new session
   */
  resetSession(): void;

  /**
   * Full reset
   */
  reset(): void;
}

// ============================================================================
// SPEECH NATURALIZER INTERFACE
// ============================================================================

/**
 * Context for speech naturalization
 */
export interface NaturalizationContext {
  emotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  turnNumber: number;
  randomSeed?: string;
}

/**
 * Interface for speech naturalization
 */
export interface ISpeechNaturalizer {
  /**
   * Naturalize text with persona-appropriate imperfections
   */
  naturalize(text: string, personaId: string, context: NaturalizationContext): string;

  /**
   * Add uncertainty/hedging to text
   */
  addUncertainty(
    text: string,
    personaId: string,
    level: 'low' | 'medium' | 'high',
    options?: { randomSeed?: string }
  ): string;

  /**
   * Get a thinking phrase
   */
  getThinkingPhrase(
    personaId: string,
    type: 'processing' | 'recalling' | 'considering' | 'uncertain',
    options?: { randomSeed?: string; sessionId?: string; turnNumber?: number }
  ): { phrase: string; ssml: string };

  /**
   * Reset naturalizer state
   */
  reset(): void;
}

// ============================================================================
// SESSION INTELLIGENCE INTERFACE
// ============================================================================

/**
 * Session intelligence context
 */
export interface SessionIntelligenceContext {
  sessionId: string;
  userId?: string;
  turnCount: number;
  userMessage: string;
  topic?: string;
  emotion?: string;
  wasVulnerable?: boolean;
  isSessionStart?: boolean;
  engagementLevel?: number;
}

/**
 * Session intelligence insight
 */
export interface SessionIntelligenceInsight {
  concern: {
    level: string;
    responseGuidance: string;
  };
  predictions: {
    need: {
      confidence: number;
      primaryNeed: string;
      responseGuidance: string;
    };
    voiceState: {
      confidence: number;
      state: string;
      acknowledgment: string;
    };
  };
  memorySuggestions: Array<{
    priority: number;
    reason: string;
    phrase: string;
  }>;
  responseModifications: Array<{
    type: string;
    content: string;
  }>;
  responseGuidance: {
    approach: string;
    pacing: string;
    energy: string;
    avoid: string[];
  };
  suggestedOpening?: string;
  confidence: number;
}

/**
 * Interface for session intelligence
 */
export interface ISessionIntelligence {
  /**
   * Analyze session context
   */
  analyze(context: SessionIntelligenceContext): SessionIntelligenceInsight;

  /**
   * Apply modifications to response
   */
  applyModifications(text: string, insight: SessionIntelligenceInsight): string;

  /**
   * Reset for new session
   */
  reset(): void;
}

// ============================================================================
// DI TOKENS
// ============================================================================

/**
 * Dependency injection tokens for conversation module
 */
export const ConversationTokens = {
  ConcernDetector: Symbol('ConcernDetector'),
  EmotionalArcTracker: Symbol('EmotionalArcTracker'),
  QuestionPatternEngine: Symbol('QuestionPatternEngine'),
  TemporalContextEngine: Symbol('TemporalContextEngine'),
  SpeechNaturalizer: Symbol('SpeechNaturalizer'),
  SessionIntelligence: Symbol('SessionIntelligence'),
} as const;
