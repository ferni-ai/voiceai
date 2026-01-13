/**
 * Unified Backchanneling Types
 *
 * Consolidated types for all backchanneling modes:
 * - Standard: Basic verbal nods (5-8s triggers)
 * - Enhanced: Context-aware, research-backed (3-5s triggers)
 * - Live: Real-time during speech (breath-pause detection)
 *
 * @module backchanneling/types
 */
import type { EmotionResult } from '../../intelligence/emotion-detector.js';
import type { BackchannelCategory, BackchannelEmotionType } from '../persona-phrases.js';
/**
 * Backchanneling mode determines timing and behavior
 * - standard: Basic verbal nods (5-8s triggers)
 * - enhanced: Context-aware, research-backed (3-5s triggers)
 * - live: Real-time during speech (breath-pause detection)
 * - adaptive: Automatically switches between modes based on context
 */
export type BackchannelMode = 'standard' | 'enhanced' | 'live' | 'adaptive';
/**
 * Unified backchannel context that works for all modes
 */
export interface BackchannelContext {
    /** Session ID for session-scoped tracking */
    sessionId: string;
    /** Persona ID for persona-specific phrases */
    personaId: string;
    /** How long user has been speaking (ms) */
    userSpeechDuration: number;
    /** Current pause duration (ms) */
    currentPauseDuration: number;
    /** Is the user in a natural breath pause? (for live mode) */
    isBreathPause?: boolean;
    /** User's detected emotion */
    userEmotion: EmotionResult;
    /** Topic weight (light/medium/heavy) */
    topicWeight: 'light' | 'medium' | 'heavy';
    /** Recent user content (for context-aware responses) */
    recentContent?: string;
    /** Turn count in conversation */
    turnCount: number;
    /** Number of backchannels already given this turn */
    backchannelCountThisTurn: number;
    /** Time of last backchannel (ms timestamp) */
    lastBackchannelTime?: number;
    /** Time since last backchannel (ms) - computed from lastBackchannelTime */
    timeSinceLastBackchannel?: number;
    /** Is the user sharing something emotional? */
    isEmotionalMoment?: boolean;
}
/**
 * Unified backchannel decision result
 */
export interface BackchannelDecision {
    /** Should we emit a backchannel? */
    shouldEmit: boolean;
    /** The raw phrase to use */
    phrase: string | null;
    /** SSML-formatted output (with volume, emotion tags) */
    ssml: string | null;
    /** Category of backchannel */
    category: BackchannelCategory | null;
    /** Emotion type used for selection */
    emotionType: BackchannelEmotionType | null;
    /** Timing - when to emit */
    timing: 'immediate' | 'after_pause' | 'never';
    /** Volume ratio (0-1) for live mode */
    volumeRatio: number;
    /** Whether this can overlap with user speech (live mode only) */
    allowOverlap: boolean;
    /** Reason for the decision (for debugging) */
    reason: string;
}
/**
 * Timing configuration for a backchanneling mode
 */
export interface BackchannelTiming {
    /** Minimum user speech duration before backchannel (ms) */
    minSpeechDuration: number;
    /** Pause duration that triggers backchannel (ms) */
    pauseTriggerDuration: number;
    /** Minimum time between backchannels (ms) */
    cooldownPeriod: number;
    /** Maximum backchannels per conversation turn */
    maxPerTurn: number;
    /** Base probability of backchannel when conditions are met */
    baseProbability?: number;
    /** Increased probability for emotional moments */
    emotionalProbability?: number;
}
/**
 * Options for creating a backchanneling engine
 */
export interface BackchannelEngineOptions {
    /** Mode determines timing and behavior */
    mode: BackchannelMode;
    /** Custom timing configuration (overrides mode defaults) */
    customTiming?: Partial<BackchannelTiming>;
    /** Persona ID for persona-specific phrases */
    personaId?: string;
}
/**
 * @deprecated Use BackchannelContext from unified module
 */
export type LegacyBackchannelContext = {
    userHasBeenSpeaking: number;
    userPausedBriefly: boolean;
    userEmotion: EmotionResult;
    topicWeight: 'light' | 'medium' | 'heavy';
    lastBackchannelTime?: number;
    personaId?: string;
};
/**
 * @deprecated Use BackchannelDecision from unified module
 */
export type LegacyBackchannelResult = {
    shouldBackchannel: boolean;
    phrase: string | null;
    timing: 'immediate' | 'after_pause' | 'never';
};
/**
 * Audio frame interface for breath-pause detection
 */
export interface AudioFrameData {
    data: Int16Array | Uint8Array;
    sampleRate: number;
    channels?: number;
}
/**
 * Breath pause detection configuration
 */
export interface BreathPauseConfig {
    /** RMS energy threshold below which we consider silence (0-1 scale) */
    silenceThreshold: number;
    /** Minimum energy to consider "speech" vs ambient noise */
    speechThreshold: number;
    /** Number of consecutive low-energy frames to confirm pause */
    pauseConfirmationFrames: number;
    /** Number of consecutive high-energy frames to confirm speech */
    speechConfirmationFrames: number;
    /** Smoothing factor for energy (0-1, higher = more smoothing) */
    energySmoothing: number;
    /** Minimum speaking time before detecting pauses (ms) */
    minSpeakingTime: number;
    /** Max pause duration to be considered a breath pause (ms) */
    breathPauseMaxDuration: number;
}
/**
 * Breath pause statistics
 */
export interface BreathPauseStats {
    totalPauses: number;
    breathPauseCount: number;
    averagePauseMs: number | undefined;
    adaptiveSilenceThreshold: number;
    adaptiveSpeechThreshold: number;
}
//# sourceMappingURL=types.d.ts.map