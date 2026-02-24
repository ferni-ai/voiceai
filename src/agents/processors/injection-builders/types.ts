/**
 * Types for Context Injection Builders
 *
 * All shared interfaces and type aliases used across injection builder modules.
 */

import type { PersonaConfig } from '../../../personas/types.js';
import type { ConversationAnalysis } from '../../../services/index.js';
import type { SessionServices } from '../../../services/types.js';
import type { UserData } from '../../shared/types.js';
import type { ContextInjection, EmotionalState } from '../types.js';

// ============================================================================
// LAZY-LOADED PERSONA BUILDER TYPES
// ============================================================================

export type ContextBuilderInjection =
  import('../../../intelligence/context-builders/core/types.js').ContextInjection;

export type PersonaContextBuilder = (
  input: import('../../../intelligence/context-builders/index.js').ContextBuilderInput
) => Promise<ContextBuilderInjection[]>;

// ============================================================================
// SHARED BUILDER CONTEXT
// ============================================================================

export interface InjectionBuilderContext {
  userText: string;
  services: SessionServices;
  userData: UserData;
  persona: PersonaConfig;
  analysis: ConversationAnalysis;
  currentTopic?: string;
  emotionalState: EmotionalState;
  /** Session ID for session-scoped services like SessionDynamicsEngine */
  sessionId?: string;
}

// ============================================================================
// SAFETY & COACHING TYPES
// ============================================================================

export interface ScientificCoachingInjectionResult {
  injections: ContextInjection[];
  /** Adaptive endpointing recommendation for voice agent */
  endpointingRecommendation?: {
    minDelay: number;
    maxDelay: number;
  };
}

// ============================================================================
// TRUST SYSTEM TYPES
// ============================================================================

/**
 * Trust systems result including injections AND summary for post-response validation
 */
export interface TrustSystemsResult {
  /** Injections to add to LLM context */
  injections: ContextInjection[];
  /** Summary for post-response monitoring (used by trust enforcement) */
  summary: {
    hasEmotionalMismatch: boolean;
    topicsToAvoid: string[];
    hasGrowthReflection: boolean;
    hasCelebration: boolean;
    hasProactiveOutreach: boolean;
    proactiveOutreach?: {
      type: string;
      message: string;
      personaId?: string;
      context?: string;
    };
  };
}

// ============================================================================
// CONVERSATION DYNAMICS TYPES
// ============================================================================

export interface ConversationDynamicsResult {
  narrativeArc?: {
    structure: string;
    climaxApproaching: boolean;
    hasReachedCore: boolean;
    suggestedIntervention: string;
    interventionGuidance: string;
  };
  engagement?: {
    level: 'low' | 'medium' | 'high' | 'distracted';
    declining: boolean;
    suggestedAction: string;
    actionGuidance: string;
  };
  rhythm?: {
    lengthMultiplier: number;
    energyLevel: 'low' | 'medium' | 'high';
    guidance: string;
  };
  silence?: {
    useSilence: boolean;
    reason: string;
    duration: number;
  };
}

// ============================================================================
// HUMAN-LEVEL FEATURES TYPES
// ============================================================================

export interface HumanLevelFeaturesContext {
  services: SessionServices;
  userData: UserData;
  userText: string;
  analysis: ConversationAnalysis;
  currentTopic?: string;
  humorGuidance?: {
    shouldAttempt: boolean;
    type?: string;
    avoid?: string[];
  };
  logger: {
    warn: (data: Record<string, unknown>, msg: string) => void;
  };
}

// ============================================================================
// DEEP HUMAN SYSTEM TYPES
// ============================================================================

export interface DeepHumanInjectionContext {
  sessionId: string;
  userId: string;
  userText: string;
  persona: PersonaConfig;
  turnCount: number;
  detectedEmotion?: string;
  emotionIntensity?: number;
  analysis?: ConversationAnalysis;
  userProfile?: {
    relationshipDepth?: number;
    sessionCount?: number;
    name?: string;
  };
}

export interface DeepHumanInjectionResult {
  /** All personality/humanization injections */
  injections: ContextInjection[];
  /** Active secret mode (if any) */
  activeSecretMode?: string;
  /** Detected user energy level */
  detectedEnergy?: 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';
  /** Speech naturalizer applied */
  speechNaturalizerApplied?: boolean;
  /** Laughter contagion triggered */
  laughterTriggered?: boolean;
}

// ============================================================================
// ADVANCED HUMANIZATION TYPES
// ============================================================================

export interface AdvancedHumanizationInjectionContext {
  sessionId: string;
  userId: string;
  userText: string;
  turnCount: number;
  detectedEmotion?: string;
  valence?: number;
  arousal?: number;
  topic?: string;
  relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
  prosodyHints?: {
    speechRate?: number;
    volume?: number;
    pitchVariance?: number;
  };
}

export interface AdvancedHumanizationInjectionResult {
  injections: ContextInjection[];
  /** Response prefix (repair phrase, milestone, etc.) */
  responsePrefix?: string;
  /** Response suffix (affirmation, hope, etc.) */
  responseSuffix?: string;
  /** Whether to stop giving direct advice */
  stopDirectAdvice: boolean;
  /** Tone guidance for response */
  toneGuidance: string;
  /** Length guidance for response */
  lengthGuidance: 'shorter' | 'normal' | 'longer';
}

// ============================================================================
// EMOTIONAL JOURNEY TYPES
// ============================================================================

export interface EmotionalJourneyContext {
  userId: string;
  sessionId: string;
  turnCount: number;
  sessionCount: number;
  relationshipStage?: string;
  emotion?: {
    primary: string;
    intensity?: number;
    distressLevel?: number;
  };
  voiceEmotion?: {
    arousal?: number;
    valence?: number;
    speechRate?: number;
  };
  resistanceDetected?: boolean;
  vulnerabilityShared?: boolean;
  wasAdviceGiven?: boolean;
  topicsTouched?: string[];
  isLastTurn?: boolean;
}

export interface EmotionalJourneyResult {
  injections: ContextInjection[];
  highEmotionMode: boolean;
  coachingMode: 'direct' | 'exploratory' | 'paradoxical' | 'celebratory' | 'supportive';
  suppressedSystems: string[];
  phase: string;
  momentType: string | null;
}

// ============================================================================
// BOUNDARY & AWARENESS TYPES
// ============================================================================

export interface BoundaryCheckContext {
  userId: string;
  proposedContent?: string;
  currentTopic?: string;
}

// ============================================================================
// SEMANTIC INTELLIGENCE TYPES
// ============================================================================

/**
 * Enhanced result from semantic intelligence that includes:
 * - The context injection for LLM (if any)
 * - The tool prediction for learning loop comparison
 */
export interface SemanticIntelligenceInjectionResult {
  /** Context injection for LLM (null if no meaningful hints) */
  injection: ContextInjection | null;

  /**
   * Tool prediction to store in userData for learning loop.
   * When a tool is actually executed, the executor compares this prediction
   * to the actual tool to detect implicit corrections.
   */
  prediction?: {
    toolId: string;
    confidence: number;
    isToolRequest: boolean;
  };
}

// ============================================================================
// PERSONA-SPECIFIC TYPES
// ============================================================================

export interface PersonaSpecificContextInput {
  services: SessionServices;
  userData: UserData;
  persona: PersonaConfig;
  userText: string;
  analysis: ConversationAnalysis;
  turnCount: number;
  /** Whether this is a handoff turn (just transferred to this persona) */
  isHandoff?: boolean;
}
