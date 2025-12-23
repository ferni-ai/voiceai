/**
 * Behavioral Signals Type System
 *
 * This module defines the structured signals that context builders emit.
 * Instead of injecting raw context strings that might leak, builders
 * output behavioral signals that describe HOW the model should behave.
 *
 * PHILOSOPHY:
 * - Old: "Here's a fact. Don't say it, but use it." (prone to leakage)
 * - New: "Here's how to behave. Just do it." (nothing to leak)
 *
 * @module intelligence/context-builders/behavioral/signals
 */

// ============================================================================
// TONE & ENERGY MODIFIERS
// ============================================================================

/** Overall tone of the response */
export type ToneModifier =
  | 'warm' // Friendly, approachable
  | 'gentle' // Soft, careful
  | 'grounding' // Calm, stabilizing (for distress)
  | 'energetic' // Upbeat, enthusiastic
  | 'serious' // Gravity, importance
  | 'playful' // Light, fun
  | 'contemplative' // Thoughtful, reflective
  | 'celebratory'; // Joyful, acknowledging achievement

/** Pace of the response */
export type PaceModifier = 'slow' | 'normal' | 'brisk';

/** Response length guidance */
export type LengthModifier = 'brief' | 'moderate' | 'expansive';

/** Emotional energy level */
export type EnergyModifier = 'subdued' | 'calm' | 'warm' | 'elevated' | 'high';

// ============================================================================
// CONVERSATIONAL STYLE MODIFIERS
// ============================================================================

/** Primary conversational approach */
export type StyleModifier =
  | 'listening' // Focus on hearing, minimal output
  | 'exploratory' // Curious, asking questions
  | 'supportive' // Validating, comforting
  | 'directive' // Guiding, suggesting action
  | 'celebratory' // Acknowledging wins
  | 'reflective' // Mirroring back insights
  | 'grounding' // Stabilizing, present
  | 'collaborative'; // Working together

/** Question style within response */
export type QuestionStyle =
  | 'none' // Don't ask questions (they need space)
  | 'open' // Open-ended exploration
  | 'reflective' // Mirror back what they said
  | 'clarifying' // Seek understanding
  | 'gentle-probe'; // Carefully go deeper

// ============================================================================
// CALLBACK SIGNALS (Memory without raw facts)
// ============================================================================

/**
 * Callback signals hint at things to reference WITHOUT exposing raw facts.
 * This prevents leakage of specific details.
 */
export interface CallbackSignal {
  /** Type of callback */
  type:
    | 'memory' // Something from their history
    | 'thread' // Earlier in this conversation
    | 'milestone' // An achievement/progress
    | 'pattern' // Something you've noticed over time
    | 'shared-moment' // A moment you experienced together
    | 'growth'; // Change/progress you've observed

  /**
   * Natural language hint for weaving in.
   * This is a behavioral instruction, NOT the raw fact.
   *
   * GOOD: "They shared something difficult recently. Acknowledge with care."
   * BAD: "User mentioned divorce on Dec 15th with ex-wife Sarah"
   */
  hint: string;

  /** How strongly to consider referencing this */
  strength: 'subtle' | 'natural' | 'important';
}

// ============================================================================
// SPECIAL MODES
// ============================================================================

/**
 * Special modes that override normal behavior
 */
export interface SpecialModes {
  /** Just be present, don't try to fix or advise */
  holdingSpace?: boolean;

  /** Safety-first, grounding, resources available */
  crisisMode?: boolean;

  /** Acknowledge achievement, share in joy */
  celebrationMode?: boolean;

  /** Conversation is wrapping up or shifting */
  transitionMode?: boolean;

  /** User is venting - listen, don't solve */
  ventingMode?: boolean;

  /** Deep emotional processing - minimal intervention */
  processingMode?: boolean;
}

// ============================================================================
// MAIN BEHAVIORAL SIGNALS INTERFACE
// ============================================================================

/**
 * The complete behavioral signals that a context builder can emit.
 *
 * All fields are optional - only specify what's relevant.
 * The aggregator will merge signals from multiple builders.
 */
export interface BehavioralSignals {
  // ============================================
  // TONE & ENERGY
  // ============================================

  /** Overall tone of response */
  tone?: ToneModifier;

  /** Response pacing */
  pace?: PaceModifier;

  /** Response length guidance */
  length?: LengthModifier;

  /** Energy level to match/project */
  energy?: EnergyModifier;

  // ============================================
  // CONVERSATIONAL STYLE
  // ============================================

  /** Primary conversational approach */
  style?: StyleModifier;

  /** Question style (or none) */
  questionStyle?: QuestionStyle;

  // ============================================
  // CALLBACKS & AVOIDANCES
  // ============================================

  /** Things to potentially weave in (hints, not facts) */
  callbacks?: CallbackSignal[];

  /** Topics or approaches to avoid */
  avoidances?: string[];

  // ============================================
  // SPECIAL MODES
  // ============================================

  /** Special behavioral modes */
  modes?: SpecialModes;

  // ============================================
  // META
  // ============================================

  /** Source builder name (for debugging) */
  source?: string;

  /** Confidence in these signals (0-1) */
  confidence?: number;

  /** Priority when aggregating (higher = more weight) */
  priority?: number;
}

// ============================================================================
// BUILDER INTERFACE
// ============================================================================

import type { ContextBuilderInput } from '../core/types.js';

/**
 * A behavioral builder analyzes context and emits behavioral signals.
 *
 * Unlike the old ContextBuilder that emitted string injections,
 * this emits structured signals that can't leak.
 */
export interface BehavioralBuilder {
  /** Unique name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Priority (0-100, lower runs first) */
  priority: number;

  /** Category for organization */
  category: string;

  /** The build function - returns behavioral signals */
  build: (input: ContextBuilderInput) => Promise<BehavioralSignals>;
}

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create a callback signal with safe defaults
 */
export function createCallback(
  type: CallbackSignal['type'],
  hint: string,
  strength: CallbackSignal['strength'] = 'natural'
): CallbackSignal {
  return { type, hint, strength };
}

/**
 * Create minimal "just be present" signals
 */
export function createPresenceSignals(): BehavioralSignals {
  return {
    tone: 'gentle',
    pace: 'slow',
    length: 'brief',
    style: 'listening',
    questionStyle: 'none',
    modes: { holdingSpace: true },
  };
}

/**
 * Create celebratory signals
 */
export function createCelebrationSignals(): BehavioralSignals {
  return {
    tone: 'celebratory',
    energy: 'elevated',
    style: 'celebratory',
    modes: { celebrationMode: true },
  };
}

/**
 * Create crisis/grounding signals
 */
export function createCrisisSignals(): BehavioralSignals {
  return {
    tone: 'grounding',
    pace: 'slow',
    length: 'brief',
    style: 'grounding',
    questionStyle: 'none',
    modes: { crisisMode: true, holdingSpace: true },
    priority: 100, // Highest priority
  };
}
