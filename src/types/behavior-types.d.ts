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
/**
 * Behavioral modes Ferni can enter.
 * Each mode changes HOW Ferni speaks, not WHAT Ferni does.
 */
export type BehaviorMode = 'presence' | 'deep_listening' | 'processing' | 'celebration' | 'holding_space' | 'energy_match' | 'grounding';
/**
 * Speech pacing options
 */
export type PacingSpeed = 'slower' | 'normal' | 'faster';
export type PauseDuration = 'shorter' | 'normal' | 'longer';
/**
 * Processing types that affect how Ferni shows thinking
 */
export type ProcessingType = 'thinking' | 'emotional' | 'tool_call' | 'memory_recall' | 'after_tool_result' | 'context_loading';
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
/**
 * Event types the system can dispatch to the LLM
 */
export type BehaviorEventType = 'voice_tremor_detected' | 'extended_silence' | 'emotional_shift' | 'tool_started' | 'tool_completed' | 'user_interrupted' | 'late_night_detected' | 'energy_drop' | 'energy_spike' | 'breakthrough_moment' | 'vulnerability_shared' | 'topic_weight_heavy' | 'relationship_milestone' | 'speech_pace_changed';
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
/**
 * Signal types sent to frontend
 */
export type BehaviorSignalType = 'mode_shift' | 'pacing_change' | 'expression' | 'hold_space' | 'processing_start' | 'processing_end';
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
    modeHistory: Array<{
        mode: BehaviorMode;
        timestamp: number;
    }>;
}
/**
 * Default behavior state
 */
export declare const DEFAULT_BEHAVIOR_STATE: BehaviorState;
export declare const SILENCE_DURATIONS: Record<SilenceDuration, number>;
export declare const PACING_MULTIPLIERS: Record<PacingSpeed, number>;
export declare const PAUSE_MULTIPLIERS: Record<PauseDuration, number>;
//# sourceMappingURL=behavior-types.d.ts.map