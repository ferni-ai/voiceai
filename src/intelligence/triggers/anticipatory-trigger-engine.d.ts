/**
 * Anticipatory Trigger Engine
 *
 * Phase 5: Anticipatory Triggers
 *
 * This is the core engine that fires triggers BEFORE full expression, enabling
 * "Better than Human" anticipation. It:
 *
 * 1. Monitors partial input in real-time
 * 2. Detects anticipatory signals (text + voice prosody)
 * 3. Decides whether to fire early based on confidence
 * 4. Generates appropriate "space-creating" responses
 *
 * Key insight: Responding supportively before someone finishes expressing
 * vulnerability creates a feeling of being truly understood.
 *
 * @module AnticipatoryTriggerEngine
 */
import type { AnticipatoryIntelligence, AnticipatedOutcomeType, VoiceProsodyCue, AnticipationEvent, UserTriggerProfile } from './user-trigger-profile.types.js';
import { type SignalDetectionResult, type SignalLearnerConfig } from './anticipatory-signal-learner.js';
export interface AnticipatoryEngineConfig {
    /** Minimum confidence to fire an anticipatory response */
    minFiringConfidence: number;
    /** How long to wait after last word before considering anticipation (ms) */
    pauseThresholdMs: number;
    /** Cooldown after firing before checking again (ms) */
    postFiringCooldownMs: number;
    /** Maximum input length to consider for anticipation (chars) */
    maxInputLengthForAnticipation: number;
    /** Minimum input length to consider for anticipation (chars) */
    minInputLengthForAnticipation: number;
    /** Signal learner config */
    signalConfig: SignalLearnerConfig;
}
export declare const DEFAULT_ENGINE_CONFIG: AnticipatoryEngineConfig;
/**
 * Space-creating responses for each anticipated outcome type.
 * These are gentle responses that create room for the user to continue.
 */
export interface AnticipatoryResponseTemplate {
    /** Short verbal response */
    verbal: string[];
    /** Non-verbal cue for avatar (e.g., micro-nod, softened expression) */
    nonVerbal: AvatarCue;
    /** Whether to lower voice volume slightly */
    softenVoice: boolean;
    /** Whether to add a pause after the response */
    pauseAfter: boolean;
    /** Pause duration in ms */
    pauseDurationMs: number;
}
export interface AvatarCue {
    expression: 'soften' | 'concern' | 'warmth' | 'excitement' | 'attentive' | 'neutral';
    gesture: 'micro-nod' | 'lean-in' | 'open-hands' | 'gentle-smile' | 'none';
    eyeContact: 'maintain' | 'soften' | 'give-space';
}
/**
 * Default response templates by anticipated outcome.
 * Personas can override these with their own voice.
 */
export declare const DEFAULT_RESPONSE_TEMPLATES: Record<AnticipatedOutcomeType, AnticipatoryResponseTemplate>;
/**
 * Result from the anticipatory engine
 */
export interface AnticipatoryEngineResult {
    /** Whether to fire an anticipatory response */
    shouldFire: boolean;
    /** The anticipated outcome type */
    anticipatedOutcome: AnticipatedOutcomeType | null;
    /** Confidence in the anticipation */
    confidence: number;
    /** Recommended response template */
    responseTemplate: AnticipatoryResponseTemplate | null;
    /** Selected verbal response */
    verbalResponse: string | null;
    /** Why we decided (not) to fire */
    reason: string;
    /** Signal detection details */
    detection: SignalDetectionResult | null;
}
/**
 * Process partial input and determine if we should fire anticipatory response.
 *
 * Call this on each partial transcript update during user speech.
 */
export declare function processPartialInput(sessionId: string, partialInput: string, intelligence: AnticipatoryIntelligence, voiceProsody?: {
    cues: VoiceProsodyCue[];
    overallScore: number;
}, currentTopic?: string, config?: AnticipatoryEngineConfig): AnticipatoryEngineResult;
/**
 * Check if there's a pending anticipation that should fire now.
 * Call this when detecting a pause in user speech.
 */
export declare function checkPendingAnticipation(sessionId: string, pauseDurationMs: number, config?: AnticipatoryEngineConfig): AnticipatoryEngineResult | null;
/**
 * Record the outcome of an anticipatory response.
 * Call this after the user continues speaking following an anticipation.
 */
export declare function recordAnticipatoryOutcome(profile: UserTriggerProfile, sessionId: string, detection: SignalDetectionResult, userReaction: AnticipationEvent['userReaction'], responseType: AnticipationEvent['responseType'], voiceProsodyScore?: number, predictionCorrect?: boolean): UserTriggerProfile;
/**
 * Get custom response templates for a persona.
 * Returns null if persona uses defaults.
 */
export declare function getPersonaResponseTemplates(_personaId: string): Record<AnticipatedOutcomeType, AnticipatoryResponseTemplate> | null;
/**
 * Clear session state (for testing or session end).
 */
export declare function clearAnticipatorySession(sessionId: string): void;
/**
 * Clear all session states (for testing).
 */
export declare function clearAllAnticipatorySessions(): void;
/**
 * Get session stats (for monitoring).
 */
export declare function getAnticipatorySessionStats(sessionId: string): {
    anticipationsThisSession: number;
    lastAnticipationTime: Date | null;
    hasPendingAnticipation: boolean;
} | null;
interface AnticipatoryEngineAnalytics {
    totalActiveSessions: number;
    totalAnticipationsFired: number;
    averageAnticipationsPerSession: number;
    lastFiringTime: Date | null;
}
/**
 * Record an anticipation firing for analytics.
 */
export declare function recordAnticipationFiring(): void;
/**
 * Get engine analytics.
 */
export declare function getAnticipatoryEngineAnalytics(): AnticipatoryEngineAnalytics;
/**
 * Reset analytics (for testing).
 */
export declare function resetAnticipatoryEngineAnalytics(): void;
export {};
//# sourceMappingURL=anticipatory-trigger-engine.d.ts.map