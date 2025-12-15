/**
 * Types for the Advanced Cognitive Intelligence System
 *
 * Extracted from cognitive-advanced.ts for better modularity
 */

import type { AttentionFocus, ReasoningStyle } from '../cognitive-types.js';

// ============================================================================
// USER COGNITIVE STYLE TYPES
// ============================================================================

/**
 * User's cognitive style - how THEY think
 */
export type UserCognitiveStyle =
  | 'analytical' // Asks data questions, uses numbers, wants evidence
  | 'emotional' // Leads with feelings, uses emotional language
  | 'practical' // Focuses on actions, what to do, outcomes
  | 'narrative' // Tells stories, uses metaphors, asks "why"
  | 'systematic' // Wants step-by-step, process-oriented
  | 'intuitive' // Goes with gut, big picture, abstract
  | 'unknown';

/**
 * Signals that indicate cognitive style
 */
export interface CognitiveSignals {
  analyticalScore: number;
  emotionalScore: number;
  practicalScore: number;
  narrativeScore: number;
  systematicScore: number;
  intuitiveScore: number;
  totalSignals: number;
}

/**
 * Cache entry for cognitive style detection
 */
export interface CognitiveStyleCacheEntry {
  result: {
    primary: UserCognitiveStyle;
    secondary?: UserCognitiveStyle;
    confidence: number;
    signals: CognitiveSignals;
  };
  createdAt: number;
  messageCount: number;
}

// ============================================================================
// HANDOFF TYPES
// ============================================================================

/**
 * Cognitive context to transfer during handoffs
 */
export interface CognitiveHandoffContext {
  /** What the previous persona noticed */
  noticed: string[];

  /** What the previous persona might have missed (their blind spots) */
  potentialBlindSpots: AttentionFocus[];

  /** User's detected cognitive style */
  userCognitiveStyle: UserCognitiveStyle;

  /** Reasoning approaches that worked */
  effectiveApproaches: ReasoningStyle[];

  /** Topics where user showed expertise */
  userExpertiseTopics: string[];

  /** Topics that need more explanation */
  needsMoreExplanation: string[];

  /** Suggested approach for receiving persona */
  suggestedApproach?: string;

  /** Cognitive "handoff note" - natural language summary */
  handoffNote: string;
}

// ============================================================================
// REASONING CHAIN TYPES
// ============================================================================

export interface ReasoningStep {
  step: number;
  approach: ReasoningStyle;
  purpose: string;
  duration: 'brief' | 'moderate' | 'extended';
  showReasoning: boolean;
}

export interface ReasoningChain {
  id: string;
  steps: ReasoningStep[];
  totalSteps: number;
  currentStep: number;
  context: string;
}

// ============================================================================
// CONFLICT RESOLUTION TYPES
// ============================================================================

export interface CognitiveConflict {
  type:
    | 'values' // "I want X but also Y"
    | 'information' // "I've heard different things"
    | 'time_pressure' // "I need to decide but need more info"
    | 'social_pressure' // "Others want me to..."
    | 'identity'; // "Who am I becoming?"
  sides: string[];
  intensity: number;
  hasBeenAcknowledged: boolean;
}

export interface ConflictResolutionApproach {
  approach: 'integration' | 'reframe' | 'prioritize' | 'accept_ambiguity' | 'delay';
  reasoning: string;
  suggestedFraming: string;
  questions: string[];
}

// ============================================================================
// LEARNING TRACKER TYPES
// ============================================================================

export interface CognitiveLearningEvent {
  timestamp: Date;
  eventType: 'clarification_needed' | 'aha_moment' | 'resistance' | 'engagement' | 'confusion';
  approach: ReasoningStyle;
  topic?: string;
  effectiveness: number;
}

export interface CognitiveLearningProfile {
  userId: string;
  totalInteractions: number;
  effectiveApproaches: Map<ReasoningStyle, number>;
  ineffectiveApproaches: Map<ReasoningStyle, number>;
  preferredDepth: 'surface' | 'moderate' | 'deep';
  preferredPace: 'quick' | 'measured' | 'deliberate';
  topicsOfExpertise: Set<string>;
  topicsNeedingExplanation: Set<string>;
  recentEvents: CognitiveLearningEvent[];
}

// ============================================================================
// KNOWLEDGE STATE TYPES
// ============================================================================

export interface KnowledgeState {
  userId: string;
  personaId: string;
  knownFacts: Map<string, KnownFact>;
  assumptions: Map<string, Assumption>;
  uncertainties: Map<string, Uncertainty>;
  lastUpdated: Date;
}

export interface KnownFact {
  fact: string;
  source: 'user_stated' | 'inferred' | 'confirmed';
  confidence: number;
  firstLearned: Date;
  lastMentioned: Date;
  timesReferenced: number;
}

export interface Assumption {
  assumption: string;
  basis: string;
  confidence: number;
  needsValidation: boolean;
}

export interface Uncertainty {
  topic: string;
  questions: string[];
  importance: number;
  askedBefore: boolean;
}

// ============================================================================
// GROWTH ARC TYPES
// ============================================================================

export interface CognitiveGrowthArc {
  userId: string;
  stages: GrowthStage[];
  currentStage: number;
  lastGrowthEvent: Date;
  totalGrowthEvents: number;
}

export interface GrowthStage {
  name: string;
  description: string;
  reachedAt?: Date;
  markers: GrowthMarker[];
}

export interface GrowthMarker {
  type:
    | 'self_awareness'
    | 'pattern_recognition'
    | 'emotional_regulation'
    | 'cognitive_flexibility'
    | 'perspective_taking';
  achieved: boolean;
  achievedAt?: Date;
  evidence?: string;
}

