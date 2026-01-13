/**
 * Anticipatory Signal Learner
 *
 * Phase 5: Anticipatory Triggers
 *
 * Learns opening phrases and patterns that predict what the user is about
 * to say. This enables "Better than Human" anticipation - responding to
 * emotional needs BEFORE they're fully expressed.
 *
 * Key insight: "So... I was thinking..." + slight tremor in voice =
 * high probability of vulnerable disclosure. Respond with space-creating
 * support BEFORE they finish.
 *
 * @module AnticipatorySignalLearner
 */
import type { AnticipatorySignal, AnticipatoryIntelligence, AnticipatedOutcomeType, VoiceProsodyCue, AnticipationEvent, UserTriggerProfile } from './user-trigger-profile.types.js';
export interface SignalLearnerConfig {
    /** Minimum observations before a signal becomes active */
    minObservations: number;
    /** Minimum probability for a signal to be considered reliable */
    minProbability: number;
    /** Maximum signals to track per user */
    maxSignalsPerUser: number;
    /** Maximum example contexts to store per signal */
    maxExamplesPerSignal: number;
    /** How long to retain anticipation events (days) */
    eventRetentionDays: number;
    /** Weight for voice prosody in combined confidence */
    voiceProsodyWeight: number;
    /** Weight for text signal in combined confidence */
    textSignalWeight: number;
}
export declare const DEFAULT_SIGNAL_LEARNER_CONFIG: SignalLearnerConfig;
/**
 * Common opening phrases that often precede specific outcomes.
 * These serve as seed patterns for new users.
 */
export declare const COMMON_ANTICIPATORY_PHRASES: Array<{
    phrases: string[];
    anticipatedOutcome: AnticipatedOutcomeType;
    baselineProbability: number;
}>;
/**
 * Result of checking for anticipatory signals
 */
export interface SignalDetectionResult {
    /** Whether any signals were detected */
    detected: boolean;
    /** The matched signals, sorted by confidence */
    signals: Array<{
        signal: AnticipatorySignal;
        matchedPhrase: string;
        textConfidence: number;
        voiceConfidence: number;
        combinedConfidence: number;
    }>;
    /** Recommended anticipated outcome */
    anticipatedOutcome: AnticipatedOutcomeType | null;
    /** Combined confidence across all signals */
    overallConfidence: number;
    /** Whether safeguards allow anticipation now */
    safeguardsAllowed: boolean;
    /** Reason if safeguards block */
    safeguardBlockReason?: string;
}
/**
 * Detect anticipatory signals in partial input
 */
export declare function detectAnticipatorySignals(partialInput: string, intelligence: AnticipatoryIntelligence, voiceProsody?: {
    cues: VoiceProsodyCue[];
    overallScore: number;
}, sessionContext?: {
    sessionId: string;
    anticipationsThisSession: number;
    lastAnticipationTime?: Date;
    currentTopic?: string;
    currentHour: number;
}, config?: SignalLearnerConfig): SignalDetectionResult;
/**
 * Input for learning from a completed utterance
 */
export interface LearningInput {
    /** The full utterance that was completed */
    fullUtterance: string;
    /** What the user actually expressed (outcome) */
    actualOutcome: AnticipatedOutcomeType;
    /** Voice prosody cues during the utterance */
    voiceCues: VoiceProsodyCue[];
    /** Session context */
    sessionId: string;
    /** Trigger categories that were activated */
    activatedTriggers: string[];
}
/**
 * Learn from a completed utterance to improve signal detection
 */
export declare function learnFromUtterance(profile: UserTriggerProfile, input: LearningInput, config?: SignalLearnerConfig): UserTriggerProfile;
/**
 * Record an anticipation event
 */
export declare function recordAnticipationEvent(profile: UserTriggerProfile, event: AnticipationEvent, config?: SignalLearnerConfig): UserTriggerProfile;
export interface AnticipatoryAnalytics {
    totalSignalsLearned: number;
    activeSignals: number;
    totalAnticipationEvents: number;
    overallAccuracy: number;
    outcomeDistribution: Record<AnticipatedOutcomeType, number>;
    topSignals: Array<{
        phrase: string;
        outcome: AnticipatedOutcomeType;
        probability: number;
        observations: number;
    }>;
    reactionDistribution: Record<AnticipationEvent['userReaction'], number>;
}
/**
 * Get analytics for anticipatory intelligence
 */
export declare function getAnticipatoryAnalytics(intelligence: AnticipatoryIntelligence, config?: SignalLearnerConfig): AnticipatoryAnalytics;
export { DEFAULT_ANTICIPATORY_INTELLIGENCE, type AnticipatorySignal, type AnticipatoryIntelligence, type AnticipatedOutcomeType, type VoiceProsodyCue, type AnticipationEvent, } from './user-trigger-profile.types.js';
//# sourceMappingURL=anticipatory-signal-learner.d.ts.map