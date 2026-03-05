/**
 * EQ System Types
 *
 * Shared type definitions for the Ferni EQ (Emotional Intelligence) system.
 * All capabilities share these core types.
 *
 * @module @ferni/eq/types
 */

import type { EmotionalExpression } from '../ui/ferni-expressions.ui.js';

// Re-export emotion types from emotion state
export type { EmotionId, EmotionState, EmotionColor, BreathingParams, MovementParams, WaveformParams, QuirkParams } from '../emotion/emotion-state.js';

// ============================================================================
// MICRO-EXPRESSIONS
// ============================================================================

/**
 * Configuration for a micro-expression.
 * Micro-expressions are subliminal (40-150ms) emotional flashes.
 */
export interface MicroExpression {
  /** The expression to display */
  expression: EmotionalExpression;
  /** Duration in ms (40-150ms enforced) */
  duration: number;
  /** How visible (0-1) */
  intensity: number;
  /** Probability of occurring (0-1) */
  probability: number;
}

/**
 * Content analysis for triggering micro-expressions
 */
export interface MicroExpressionTriggerContent {
  transcript?: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'emotional';
  intensity?: number;
  isNewTopic?: boolean;
  mentionedMemory?: boolean;
  hasAchievement?: boolean;
  hasInsight?: boolean;
  isVulnerable?: boolean;
  isProcessingDeep?: boolean;
}

// ============================================================================
// ACTIVE LISTENING
// ============================================================================

/**
 * State for active listening behavior
 */
export interface ActiveListeningState {
  isListening: boolean;
  lastNodTime: number;
  nodCount: number;
  pauseCount: number;
}

/**
 * Intensity levels for micro-nods
 */
export type NodIntensity = 'micro' | 'subtle' | 'visible';

// ============================================================================
// BREATH SYNC
// ============================================================================

/**
 * State for breath synchronization
 */
export interface BreathSyncState {
  isEnabled: boolean;
  userBreathRate: number;
  syncStrength: number;
  lastSyncTime: number;
}

// ============================================================================
// CONCERN DETECTION
// ============================================================================

/**
 * Concern level detected in user's speech/behavior
 */
export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'significant';

/**
 * State for concern detection
 */
export interface ConcernState {
  level: ConcernLevel;
  duration: number;
  triggers: string[];
  lastCheckTime: number;
}

/**
 * Input for concern analysis
 */
export interface ConcernAnalysisInput {
  transcript?: string;
  voiceStrain?: number;
  pauseFrequency?: number;
  sighing?: boolean;
  voiceBreaking?: boolean;
}

// ============================================================================
// ANTICIPATION
// ============================================================================

/**
 * Input for emotion anticipation
 */
export interface AnticipationInput {
  transcript: string;
  tone: 'rising' | 'falling' | 'flat';
  energy: number;
  context?: string[];
}

// ============================================================================
// BETTER THAN HUMAN SIGNALS
// ============================================================================

/**
 * Signal types from backend superhuman capabilities
 */
export type BetterThanHumanSignalType =
  | 'emotional_bond_deepen'
  | 'protective_instinct'
  | 'spontaneous_delight'
  | 'inside_joke_callback'
  | 'superhuman_observation'
  | 'visible_vulnerability'
  | 'temporal_insight'
  | 'meta_relationship_moment'
  | 'somatic_presence'
  | 'anticipatory_presence'
  | 'micro_expression'; // Backend-driven subliminal flash (concern 60ms, delight 100ms, recognition 80ms)

/**
 * Signal from backend superhuman capabilities
 */
export interface BetterThanHumanSignal {
  signalType: BetterThanHumanSignalType;
  intensity?: number;

  // emotional_bond_deepen
  bondType?: string;
  bondLevel?: number;

  // spontaneous_delight
  delightType?: string;
  /** What triggered the delight (e.g., "recognition", "achievement") */
  trigger?: string;

  // inside_joke_callback
  jokePhase?: string;
  /** Reference to the memory being recalled (for inside_joke, temporal_insight) */
  memoryReference?: string;

  // superhuman_observation
  observationType?: string;
  observationContent?: string;

  // visible_vulnerability
  vulnerabilityType?: string;

  // temporal_insight
  temporalInsight?: string;
  /** Time span for temporal insights (e.g., "months", "years") */
  timeSpan?: string;

  // meta_relationship_moment
  metaRelationshipType?: string;
  /** Context about the relationship (e.g., "milestone", "turning_point") */
  relationshipContext?: string;

  // somatic_presence
  /** @deprecated Use somaticType instead */
  somaticCue?: string;
  /** Type of somatic presence: breathing, settling, grounding, pause */
  somaticType?: 'breathing' | 'settling' | 'grounding' | 'pause';

  // anticipatory_presence
  /** Time context for anticipatory care: late_night, early_morning, weekend, monday, evening */
  timeContext?: 'late_night' | 'early_morning' | 'weekend' | 'monday' | 'evening';

  // micro_expression (backend-driven subliminal flash)
  /** Subtype: concern_flash (60ms), delight_flash (100ms), recognition (80ms) */
  microExpressionSubtype?: 'concern_flash' | 'delight_flash' | 'recognition';
  /** Duration in ms (40-150) when signalType is micro_expression */
  durationMs?: number;
}
