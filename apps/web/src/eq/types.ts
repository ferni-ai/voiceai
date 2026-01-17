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
  | 'anticipatory_presence';

/**
 * Signal from backend superhuman capabilities
 */
export interface BetterThanHumanSignal {
  signalType: BetterThanHumanSignalType;
  intensity?: number;
  bondType?: string;
  bondLevel?: number;
  delightType?: string;
  jokePhase?: string;
  observationType?: string;
  observationContent?: string;
  vulnerabilityType?: string;
  temporalInsight?: string;
  metaRelationshipType?: string;
  somaticCue?: string;
}
