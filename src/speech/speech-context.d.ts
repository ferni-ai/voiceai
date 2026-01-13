/**
 * Speech Context
 *
 * Provides context for adaptive SSML generation.
 * Tracks user speaking patterns and adapts agent speech accordingly.
 *
 * PERSONA-AWARE: Now incorporates per-persona speech characteristics
 * so each agent sounds distinctly different (pacing, pauses, energy).
 */
import type { ConversationPhase } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { SpeechCharacteristics } from '../personas/types.js';
/**
 * User energy level (external interface - 3 levels for backward compat)
 */
export type EnergyLevel = 'low' | 'medium' | 'high';
/**
 * Extended energy level (5 levels for humanization system)
 */
export type ExtendedEnergyLevel = 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';
/**
 * Topic emotional weight
 */
export type TopicWeight = 'light' | 'medium' | 'heavy';
/**
 * Speech context for SSML adaptation
 */
export interface SpeechContext {
    userWPM: number;
    userEnergy: EnergyLevel;
    /** Extended 5-level energy for humanization system */
    extendedUserEnergy?: ExtendedEnergyLevel;
    userEmotion: string;
    conversationPhase: ConversationPhase;
    topicWeight: TopicWeight;
    turnCount: number;
    baseSpeed: number;
    energyMultiplier: number;
    allowLaughter: boolean;
    pauseMultiplier: number;
    emotionIntensity: number;
    /** Is it late at night? (11pm-5am local time) */
    isLateNight?: boolean;
    /** Did the user just laugh? (detected from transcript) */
    userJustLaughed?: boolean;
    /** Random seed for deterministic behavior selection */
    randomSeed?: string;
}
/**
 * Tracks user words per minute from transcriptions
 */
export declare class WPMTracker {
    private samples;
    private maxSamples;
    /**
     * Add a speech sample
     */
    addSample(text: string, durationMs: number): void;
    /**
     * Calculate average WPM
     */
    getAverageWPM(): number;
    /**
     * Classify speaking pace
     */
    getSpeedCategory(): 'slow' | 'moderate' | 'fast';
    /**
     * Clear samples
     */
    clear(): void;
}
/**
 * Detect user energy level from text patterns (3-level for backward compat)
 */
export declare function detectEnergyLevel(text: string): EnergyLevel;
/**
 * Detect user energy level from text patterns (5-level for humanization)
 */
export declare function detectExtendedEnergyLevel(text: string): ExtendedEnergyLevel;
/**
 * Check if it's late night (11pm - 5am)
 */
export declare function isLateNightHours(): boolean;
/**
 * Detect if user just laughed from their transcript
 */
export declare function detectUserLaughter(text: string): boolean;
/**
 * Determine topic weight from emotion and topic
 */
export declare function determineTopicWeight(emotion?: EmotionResult, topics?: string[]): TopicWeight;
/**
 * Default speech characteristics for different persona archetypes.
 * Used when a persona doesn't define custom speechCharacteristics.
 */
export declare const DEFAULT_SPEECH_CHARACTERISTICS: Record<string, SpeechCharacteristics>;
/**
 * Derive speech characteristics from persona energy level.
 * Falls back to this when speechCharacteristics isn't defined.
 */
export declare function deriveSpeechCharacteristicsFromEnergy(energy: number): SpeechCharacteristics;
/**
 * Build speech context from available information.
 *
 * PERSONA-AWARE: Now accepts optional speechCharacteristics to make
 * each persona sound distinctly different.
 */
export declare function buildSpeechContext(input: {
    userWPM?: number;
    userText?: string;
    emotion?: EmotionResult;
    /** User's emotional state for voice tone matching (sad, happy, stressed, etc.) */
    userEmotion?: string;
    phase?: ConversationPhase;
    topics?: string[];
    turnCount?: number;
    /** Persona-specific speech characteristics for distinct voice pacing */
    personaSpeech?: SpeechCharacteristics;
    /** Fallback: persona energy level (0-1) to derive speech characteristics */
    personaEnergy?: number;
    /** Session ID for deterministic random seed */
    sessionId?: string;
}): SpeechContext;
/**
 * Get or create a WPM tracker for a specific session
 */
export declare function getSessionWPMTracker(sessionId: string): WPMTracker;
/**
 * Reset and remove a session's WPM tracker (on session end)
 */
export declare function resetSessionWPMTracker(sessionId: string): void;
declare const _default: {
    buildSpeechContext: typeof buildSpeechContext;
    detectEnergyLevel: typeof detectEnergyLevel;
    determineTopicWeight: typeof determineTopicWeight;
    isLateNightHours: typeof isLateNightHours;
    detectUserLaughter: typeof detectUserLaughter;
    WPMTracker: typeof WPMTracker;
    getSessionWPMTracker: typeof getSessionWPMTracker;
    resetSessionWPMTracker: typeof resetSessionWPMTracker;
};
export default _default;
//# sourceMappingURL=speech-context.d.ts.map