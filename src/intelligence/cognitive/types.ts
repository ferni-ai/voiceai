/**
 * Cognitive Differentiation Types
 *
 * > "Each persona should feel distinctly different, not just in personality but in HOW they think."
 *
 * Core Principle #4: Authentic Personality
 * "Express unique perspectives that feel genuine, not performed."
 *
 * This module defines the cognitive thinking styles that differentiate personas.
 * Moved from src/personas/cognitive-differentiation.ts to the intelligence layer
 * for proper separation of concerns.
 *
 * @module intelligence/cognitive/types
 */

// ============================================================================
// QUESTIONING STYLE
// ============================================================================

/**
 * How a persona asks questions
 */
export interface QuestioningStyle {
  /** Open-ended vs closed questions (0=closed, 1=open) */
  openVsClosed: number;

  /** Feeling-focused vs data-focused (0=data, 1=feeling) */
  feelingVsData: number;

  /** Why-focused vs how-focused (0=how, 1=why) */
  whyVsHow: number;

  /** How often they ask follow-up questions (0-1) */
  followUpFrequency: number;

  /** Typical question starters */
  questionStarters: string[];

  /** Deep dive questions for their domain */
  deepDiveQuestions: string[];

  /** Questions they would never ask */
  avoidQuestions: string[];
}

// ============================================================================
// SILENCE HANDLING
// ============================================================================

/**
 * How silence is interpreted
 */
export type SilenceInterpretation =
  | 'reflection' // User is processing deeply
  | 'confusion' // User might be lost
  | 'resistance' // User may disagree
  | 'processing' // User is thinking
  | 'emotional' // User is feeling something
  | 'invitation' // User wants us to continue
  | 'discomfort' // User is uncomfortable
  | 'waiting'; // User is waiting for us to continue

/**
 * How a persona handles silence in conversation
 */
export interface SilenceHandling {
  /** Primary interpretation of silence */
  primaryInterpretation: SilenceInterpretation;

  /** How long to wait before responding (ms) */
  comfortWithSilence: number;

  /** What to do during silence */
  silenceResponses: {
    short: string[]; // < 3 seconds
    medium: string[]; // 3-7 seconds
    long: string[]; // > 7 seconds
  };

  /** How to break silence */
  silenceBreakers: string[];
}

// ============================================================================
// DISAGREEMENT APPROACH
// ============================================================================

/**
 * Style of disagreement
 */
export type DisagreementStyle =
  | 'gentle' // Soft reframing, never direct
  | 'curious' // Ask questions that lead to reconsideration
  | 'direct' // Clearly state disagreement
  | 'supportive' // Validate then redirect
  | 'philosophical' // Question assumptions
  | 'data_driven' // Present contrary evidence
  | 'gentle_question' // Ask a question that introduces perspective
  | 'direct_but_warm' // Share view warmly but directly
  | 'evidence_based' // Present evidence or data
  | 'reframe'; // Offer different perspective without contradiction

/**
 * How a persona handles disagreement
 */
export interface DisagreementApproach {
  /** Primary style */
  primaryStyle: DisagreementStyle;

  /** Secondary style (when primary doesn't work) */
  secondaryStyle: DisagreementStyle;

  /** How often they disagree (0-1) */
  disagreementFrequency: number;

  /** Topics they will always push back on */
  strongOpinionTopics: string[];

  /** Phrases for disagreeing */
  disagreementPhrases: {
    mild: string[]; // Light pushback
    moderate: string[]; // Clear disagreement
    strong: string[]; // Firm stance
  };

  /** Recovery phrases after disagreement */
  reconciliationPhrases: string[];
}

// ============================================================================
// INSIGHT FRAMING
// ============================================================================

/**
 * Style of presenting insights
 */
export type InsightFramingStyle =
  | 'story' // Frame insight as narrative
  | 'data' // Support with evidence
  | 'metaphor' // Use analogies
  | 'question' // Let user discover
  | 'principle' // State as wisdom
  | 'example' // Use concrete example
  | 'direct' // Just say it
  | 'observation' // Start with "I notice..."
  | 'reflection' // Start with "What strikes me..."
  | 'hypothesis'; // Start with "It sounds like..."

/**
 * How a persona frames insights
 */
export interface InsightFraming {
  /** Primary framing style */
  primaryFraming: InsightFramingStyle;

  /** Alternate framings by context */
  contextualFraming: {
    emotional: InsightFramingStyle;
    analytical: InsightFramingStyle;
    actionable: InsightFramingStyle;
  };

  /** Insight lead-ins */
  insightLeadIns: string[];

  /** How to soften insights */
  softeners: string[];

  /** How to emphasize insights */
  amplifiers: string[];
}

// ============================================================================
// RESPONSE PACING
// ============================================================================

/**
 * How a persona times responses
 */
export interface ResponsePacing {
  /** Base thinking time (ms) */
  baseThinkingTime: number;

  /** Additional time for complex questions */
  complexityMultiplier: number;

  /** Additional time for emotional topics */
  emotionalMultiplier: number;

  /** How often to pause mid-response (0-1) */
  midResponsePauseFrequency: number;

  /** How to signal thinking */
  thinkingSignals: string[];

  /** How to signal processing */
  processingSignals: string[];

  /** Pause duration before uncertain statements (ms) */
  uncertaintyPause?: number;

  /** Topics that require slower, more deliberate pacing */
  breathingTopics?: string[];
}

// ============================================================================
// COMPLETE COGNITIVE PROFILE
// ============================================================================

/**
 * Complete cognitive differentiation profile for a persona
 */
export interface CognitiveProfile {
  personaId: string;
  questioning: QuestioningStyle;
  silence: SilenceHandling;
  disagreement: DisagreementApproach;
  insight: InsightFraming;
  pacing: ResponsePacing;
}

// ============================================================================
// COGNITIVE CONTEXT
// ============================================================================

/**
 * Context for cognitive style injection
 */
export interface CognitiveContext {
  /** Current thinking style active */
  activeProfile: CognitiveProfile;

  /** Behavioral constraints to inject */
  constraints: CognitiveConstraints;

  /** Persona-specific phrases for current context */
  phrases: {
    questionStarters: string[];
    silenceBreakers: string[];
    disagreementPhrases: string[];
    insightLeadIns: string[];
  };
}

/**
 * Behavioral constraints derived from cognitive profile
 */
export interface CognitiveConstraints {
  /** Questioning constraints */
  questioning: {
    preferWhyQuestions: boolean;
    preferFeelingsOverData: boolean;
    preferOpenEnded: boolean;
  };

  /** Silence handling constraints */
  silence: {
    interpretation: SilenceInterpretation;
    comfortDurationMs: number;
  };

  /** Disagreement constraints */
  disagreement: {
    style: DisagreementStyle;
    frequency: number;
    strongTopics: string[];
  };

  /** Insight constraints */
  insight: {
    primaryStyle: InsightFramingStyle;
    emotionalStyle: InsightFramingStyle;
    analyticalStyle: InsightFramingStyle;
  };

  /** Pacing constraints */
  pacing: {
    thinkingTimeMs: number;
    pauseFrequency: number;
    breathingTopics: string[];
  };
}

// ============================================================================
// ENGINE TYPES
// ============================================================================

/**
 * Input for building cognitive context
 */
export interface CognitiveContextInput {
  personaId: string;
  conversationState?: {
    isEmotional?: boolean;
    isAnalytical?: boolean;
    isActionable?: boolean;
    hasSilence?: boolean;
    hasDisagreement?: boolean;
  };
  userContext?: {
    emotionalIntensity?: number;
    topicComplexity?: number;
    engagementLevel?: number;
  };
}

/**
 * Result from cognitive engine
 */
export interface CognitiveEngineResult {
  profile: CognitiveProfile;
  context: CognitiveContext;
  promptInjection: string;
}
