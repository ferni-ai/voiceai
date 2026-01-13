/**
 * Types for Sesame-Inspired Prosody Enhancements
 */
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
/**
 * Emotional trajectory direction
 */
export type EmotionalTrajectory = 'rising' | 'falling' | 'stable' | 'volatile';
/**
 * Anticipated emotional response preparation
 */
export interface AnticipatedResponse {
    /** Predicted emotion for response */
    emotion: CartesiaEmotion;
    /** Confidence in prediction (0-1) */
    confidence: number;
    /** Suggested speed ratio */
    speed: number;
    /** Suggested volume ratio */
    volume: number;
    /** Opening micro-reaction (if any) */
    openingReaction?: string;
    /** Reason for anticipation */
    reason: string;
}
/**
 * Partial transcript for anticipation
 */
export interface PartialTranscript {
    /** Current partial text */
    text: string;
    /** Is user still speaking? */
    isSpeaking: boolean;
    /** Detected tone (if available) */
    tone?: 'neutral' | 'excited' | 'sad' | 'frustrated' | 'curious';
    /** Speech rate of user */
    userSpeechRate?: 'slow' | 'normal' | 'fast';
    /** Time since last word (ms) */
    silenceMs?: number;
}
/**
 * Types of micro-reactions
 */
export type MicroReactionType = 'gasp' | 'hmm' | 'oh' | 'ah' | 'mm' | 'huh' | 'wow' | 'ooh' | 'oof' | 'aww' | 'whoa' | 'yikes' | 'nice' | 'right';
/**
 * Micro-reaction with SSML
 */
export interface MicroReaction {
    /** Type of reaction */
    type: MicroReactionType;
    /** SSML-tagged audio */
    ssml: string;
    /** Duration in ms */
    durationMs: number;
    /** Appropriate contexts */
    contexts: MicroReactionContext[];
}
/**
 * Context for when to use micro-reactions
 */
export type MicroReactionContext = 'user_sharing_good_news' | 'user_sharing_bad_news' | 'user_making_realization' | 'user_asking_question' | 'user_expressing_frustration' | 'user_being_vulnerable' | 'user_joking' | 'user_trailing_off' | 'user_finishing_thought' | 'user_pausing_to_think';
/**
 * Emotional state tracking across conversation
 */
export interface ConversationEmotionalState {
    /** Current dominant emotion */
    currentEmotion: CartesiaEmotion;
    /** Previous emotions (last 5 turns) */
    emotionHistory: CartesiaEmotion[];
    /** Overall trajectory */
    trajectory: EmotionalTrajectory;
    /** Intensity level (0-1) */
    intensity: number;
    /** Is this a heavy/serious conversation? */
    isHeavyTopic: boolean;
    /** Turn count in current emotional arc */
    turnsInCurrentArc: number;
}
/**
 * Prosody recommendation based on conversation context
 */
export interface ConversationProsodyRecommendation {
    /** Base speed multiplier */
    baseSpeed: number;
    /** Base volume multiplier */
    baseVolume: number;
    /** Suggested emotion */
    emotion: CartesiaEmotion;
    /** Pause multiplier (1.0 = normal, 1.5 = more pauses) */
    pauseMultiplier: number;
    /** Should include micro-reactions? */
    includeMicroReactions: boolean;
    /** Should use softer delivery? */
    softerDelivery: boolean;
    /** Reasoning */
    reason: string;
}
/**
 * Disfluency type for natural speech
 */
export type DisfluencyType = 'filled_pause' | 'restart' | 'self_correction' | 'trail_off' | 'false_start' | 'word_search' | 'hedge' | 'thinking_aloud' | 'repetition';
/**
 * Disfluency pattern with SSML
 */
export interface DisfluencyPattern {
    /** Type of disfluency */
    type: DisfluencyType;
    /** Pattern options */
    patterns: string[];
    /** SSML-enhanced version */
    ssmlPatterns: string[];
    /** Appropriate emotional contexts */
    emotionalContexts: CartesiaEmotion[];
    /** Probability weight (0-1) */
    weight: number;
}
/**
 * Disfluency injection result
 */
export interface DisfluencyInjection {
    /** Original text */
    original: string;
    /** Text with disfluency */
    enhanced: string;
    /** Type of disfluency added */
    type: DisfluencyType;
    /** Position of injection */
    position: 'start' | 'mid' | 'end';
}
//# sourceMappingURL=types.d.ts.map