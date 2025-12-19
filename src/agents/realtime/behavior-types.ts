/**
 * Behavior Types
 *
 * Type definitions for the bidirectional behavior system.
 * This system enables both:
 * - System → LLM: Events that trigger behavioral responses
 * - LLM → System: Behavior functions that change HOW Ferni speaks
 *
 * @module BehaviorTypes
 */

// ============================================================================
// BEHAVIOR MODES
// ============================================================================

/**
 * Behavioral modes Ferni can enter.
 * Each mode changes HOW Ferni speaks, not WHAT Ferni does.
 */
export type BehaviorMode =
  | 'presence' // Just be here, minimal words, full attention
  | 'deep_listening' // Slow, receptive, few words, lots of space
  | 'processing' // Visibly thinking (shows in avatar)
  | 'celebration' // Upbeat energy, excitement
  | 'holding_space' // After something heavy landed
  | 'energy_match' // Match user's current energy level
  | 'grounding'; // Calming, centering presence

/**
 * Speech pacing options
 */
export type PacingSpeed = 'slower' | 'normal' | 'faster';
export type PauseDuration = 'shorter' | 'normal' | 'longer';

/**
 * Processing types that affect how Ferni shows thinking
 */
export type ProcessingType =
  | 'thinking' // General thinking
  | 'emotional' // Processing emotional content
  | 'tool_call' // Waiting for tool execution
  | 'memory_recall' // Searching memory
  | 'after_tool_result' // Processing tool results (show interest in what was found)
  | 'context_loading'; // Loading contextual information (persona bundle, settings, etc.)

/**
 * Weight of what's being processed (affects phrase selection)
 */
export type ProcessingWeight = 'light' | 'medium' | 'heavy';

/**
 * Non-verbal presence expressions
 */
export type PresenceExpression = 'breath' | 'hum' | 'nod' | 'sigh' | 'soft_sound';

/**
 * Duration for intentional silences
 */
export type SilenceDuration = 'brief' | 'medium' | 'extended';

// ============================================================================
// SYSTEM EVENTS (System → LLM)
// ============================================================================

/**
 * Event types the system can dispatch to the LLM
 */
export type BehaviorEventType =
  | 'voice_tremor_detected'
  | 'extended_silence'
  | 'emotional_shift'
  | 'tool_started'
  | 'tool_completed'
  | 'user_interrupted'
  | 'late_night_detected'
  | 'energy_drop'
  | 'energy_spike'
  | 'breakthrough_moment'
  | 'vulnerability_shared'
  | 'topic_weight_heavy'
  | 'relationship_milestone'
  | 'speech_pace_changed';

/**
 * Suggested response from system to LLM
 */
export interface SuggestedBehaviorResponse {
  mode?: BehaviorMode;
  pacing?: PacingSpeed;
  expression?: string;
  holdSpace?: boolean;
}

/**
 * Behavior event dispatched from system to LLM
 */
export interface BehaviorEvent {
  /** Event type identifier */
  event: BehaviorEventType;
  /** Event-specific data */
  data: Record<string, unknown>;
  /** When the event occurred */
  timestamp: number;
  /** System's suggested response (LLM can ignore) */
  suggestedResponse?: SuggestedBehaviorResponse;
}

/**
 * Context for detecting behavior events
 */
export interface BehaviorDetectionContext {
  /** Current emotional state */
  emotionalState?: {
    primary: string;
    intensity: number;
    distressLevel: number;
    trajectory?: string;
  };
  /** Previous emotional state (for detecting shifts) */
  previousEmotionalState?: {
    primary: string;
    intensity: number;
  };
  /** Voice prosody analysis */
  voiceAnalysis?: {
    tremorDetected?: boolean;
    tremorIntensity?: number;
    energyLevel?: number;
    pacingSpeed?: number;
  };
  /** Silence duration in ms */
  silenceDuration?: number;
  /** Time of day (hour, 0-23) */
  hourOfDay?: number;
  /** Current topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** User was interrupted */
  userInterrupted?: boolean;
  /** Tool execution status */
  toolStatus?: {
    inProgress: boolean;
    toolName?: string;
    startTime?: number;
  };
  /** Relationship stage */
  relationshipStage?: string;
  /** Turn count */
  turnCount?: number;
}

// ============================================================================
// BEHAVIOR FUNCTION ARGS (LLM → System)
// ============================================================================

/**
 * Arguments for shiftMode function
 */
export interface ShiftModeArgs {
  mode: BehaviorMode;
  reason?: string;
}

/**
 * Arguments for adjustPacing function
 */
export interface AdjustPacingArgs {
  speed: PacingSpeed;
  pauses?: PauseDuration;
  reason?: string;
}

/**
 * Arguments for processing function
 */
export interface ProcessingArgs {
  type: ProcessingType;
  weight?: ProcessingWeight;
  reason?: string;
}

/**
 * Arguments for holdSpace function
 */
export interface HoldSpaceArgs {
  duration: SilenceDuration;
  reason?: string;
}

/**
 * Arguments for expressPresence function
 */
export interface ExpressPresenceArgs {
  type: PresenceExpression;
  intensity?: 'subtle' | 'visible';
}

// ============================================================================
// BEHAVIOR SIGNAL (Backend → Frontend)
// ============================================================================

/**
 * Signal types sent to frontend
 */
export type BehaviorSignalType =
  | 'mode_shift'
  | 'pacing_change'
  | 'expression'
  | 'hold_space'
  | 'processing_start'
  | 'processing_end';

/**
 * Signal sent to frontend to update avatar/waveform
 */
export interface BehaviorSignal {
  type: BehaviorSignalType;
  mode?: BehaviorMode;
  pacing?: PacingSpeed;
  duration?: number;
  expression?: string;
  reason?: string;
  timestamp: number;
}

// ============================================================================
// PROCESSING INTELLIGENCE
// ============================================================================

/**
 * Context for composing processing expressions
 */
export interface ProcessingContext {
  /** What triggered the processing (tool call, emotional weight, etc.) */
  trigger: ProcessingType;
  /** Weight of what's being processed */
  weight: ProcessingWeight;
  /** User's emotional state */
  emotionalState?: {
    primary: string;
    intensity: number;
  };
  /** Relationship stage with user */
  relationshipStage?: 'new' | 'developing' | 'established' | 'deep';
  /** Time of day (hour) */
  hourOfDay?: number;
  /** Current persona ID */
  personaId?: string;
  /** Topic being discussed */
  currentTopic?: string;
}

/**
 * Result from ProcessingIntelligence
 */
export interface ProcessingResult {
  /** The spoken phrase (may include SSML) */
  phrase: string;
  /** Pause duration in ms before speaking */
  prePause: number;
  /** Pause duration in ms after speaking */
  postPause: number;
  /** Avatar expression to show */
  avatarExpression?: string;
  /** Additional SSML to wrap the phrase */
  ssmlWrapper?: string;
}

// ============================================================================
// BEHAVIOR STATE
// ============================================================================

/**
 * Current behavior state for a session
 */
export interface BehaviorState {
  /** Current mode */
  currentMode: BehaviorMode;
  /** Current pacing */
  currentPacing: {
    speed: PacingSpeed;
    pauses: PauseDuration;
  };
  /** When mode was last changed */
  modeChangedAt: number;
  /** Is currently in processing state */
  isProcessing: boolean;
  /** Is currently holding space */
  isHoldingSpace: boolean;
  /** History of recent mode changes */
  modeHistory: Array<{ mode: BehaviorMode; timestamp: number }>;
}

/**
 * Default behavior state
 */
export const DEFAULT_BEHAVIOR_STATE: BehaviorState = {
  currentMode: 'presence',
  currentPacing: {
    speed: 'normal',
    pauses: 'normal',
  },
  modeChangedAt: Date.now(),
  isProcessing: false,
  isHoldingSpace: false,
  modeHistory: [],
};

// ============================================================================
// SILENCE DURATIONS (in ms)
// ============================================================================

export const SILENCE_DURATIONS: Record<SilenceDuration, number> = {
  brief: 3000, // 3 seconds
  medium: 5000, // 5 seconds
  extended: 8000, // 8 seconds
};

// ============================================================================
// PACING MULTIPLIERS
// ============================================================================

export const PACING_MULTIPLIERS: Record<PacingSpeed, number> = {
  slower: 1.3, // 30% slower
  normal: 1.0,
  faster: 0.8, // 20% faster
};

export const PAUSE_MULTIPLIERS: Record<PauseDuration, number> = {
  shorter: 0.6, // 40% shorter
  normal: 1.0,
  longer: 1.5, // 50% longer
};

