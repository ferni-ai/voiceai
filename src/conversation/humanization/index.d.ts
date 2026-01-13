/**
 * Advanced Humanization System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module orchestrates all advanced humanization features to create
 * natural, human-like conversations. It coordinates:
 *
 * - **Self-Correction**: Natural restarts and refinements
 * - **Disfluencies**: Strategic "um", "well", "you know"
 * - **Phonetic Mirroring**: Match user's speech patterns
 * - **Catching Yourself**: Meta-awareness moments
 *
 * The key insight: humans don't speak perfectly. These imperfections
 * make speech feel authentic and create subconscious rapport.
 *
 * @module @ferni/humanization
 */
import { type SelfCorrectionEngine } from './self-correction.js';
import { type DisfluencyEngine } from './disfluency-injection.js';
import { type PhoneticMirroringEngine } from './phonetic-mirroring.js';
import { type CatchingYourselfEngine } from './catching-yourself.js';
import { type VocalFatigueEngine } from './vocal-fatigue.js';
import { type SessionDynamicsEngine } from './session-dynamics.js';
import { type ComfortProgressionEngine } from './comfort-progression.js';
import { type VoicePrintEngine } from './voice-print.js';
import { type AmbientAwarenessEngine } from './ambient-awareness.js';
import { type EmotionalLeadingEngine } from './emotional-leading.js';
import { type BreathingSyncEngine } from './breathing-sync.js';
import { type CrossSessionVoiceEngine } from './cross-session-voice.js';
import type { HumanizationConfig, HumanizationContext, HumanizedResponseResult } from './types.js';
export * from './ambient-awareness.js';
export * from './breathing-sync.js';
export * from './catching-yourself.js';
export * from './comfort-progression.js';
export * from './cross-session-voice.js';
export * from './disfluency-injection.js';
export * from './emotional-leading.js';
export * from './phonetic-mirroring.js';
export * from './self-correction.js';
export * from './session-dynamics.js';
export * from './types.js';
export * from './vocal-fatigue.js';
export * from './voice-print.js';
export { getActiveRapportScorerCount, getAvailableStrategies, getRapportScorer, getStrategyContextInjection, getStrategyTtsAdjustments, RAPPORT_CONFIG, RapportScorer, rapportScorer, resetRapportScorer, selectRepairStrategy, type EngagementObservation, type EmotionalAlignmentObservation, type FlowContinuityObservation, type InterruptionObservation, type RapportLevel, type RapportScore, type RapportScorerState, type RapportSignal, type RepairState, type RepairStrategy, type RepairStrategyType, type TrustSignalObservation, type TurnBalanceObservation, type TurnObservation, } from '../rapport/index.js';
export { getActiveVoicePatternEngineCount, getCurrentTimeOfDay, getRecommendedAgentWpm, getRecommendedTurnGap, getVoicePatternEngine, getVoicePatterns, initializeVoicePatterns, loadVoicePatterns, persistVoicePatterns, recordVoiceObservation, resetVoicePatternEngine, saveVoicePatterns, voicePatternLearning, VOICE_PATTERN_CONFIG, type TimeOfDay, type TimeOfDayPattern, type VoiceObservation, type VoicePatternData, type VoicePatternEngine, } from './voice-pattern-learning.js';
export { cleanupProsodyBridge, getBridgeState, getCrossSessionInsight, getVoiceStateInsight, inferAmbientFromProsody, initProsodyBridge, processProsodyForHumanization, prosodyToBreathPattern, prosodyToVoiceSnapshot, type BridgeState, } from './prosody-bridge.js';
export { clearHumanizationData, initializeFromPersistence, loadAllHumanizationData, loadComfortState, loadCrossSessionMemory, loadVoicePrint, persistOnSessionEnd, saveAllHumanizationData, saveComfortState, saveCrossSessionMemory, saveVoicePrint, type HumanizationPersistenceBundle, } from './persistence.js';
export { getHumanizationAnalytics, humanizationAnalytics, resetHumanizationAnalytics, type FeatureStats, type GlobalAnalytics, type HumanizationEvent, type HumanizationEventType, type HumanizationFeature, type SessionAnalytics, } from './analytics.js';
export { CONSERVATIVE_CONFIG, DEFAULT_HUMANIZATION_CONFIG, EXPRESSIVE_CONFIG, MINIMAL_CONFIG, getHumanizationConfig, humanizationConfig, resetHumanizationConfig, type HumanizationConfig, } from './config.js';
export { applyBreathingSync, createVoiceSnapshot, detectVoiceState, getAmbientAcknowledgment, getAmbientContext, getBreathingSyncAdjustments, getConversationPhase, getCrossSessionAcknowledgment, getEmotionalLeadingGuidance, getEngineStates, getPhaseBehavior, getSessionState, humanizeResponse, isBehaviorUnlocked, markCrossSessionAcknowledged, onSessionEnd, onSessionStart, processUserMessage, recordComfortEvent, simulateBreathFromEmotion, type HumanizationSessionState, } from './voice-agent-integration.js';
export interface HumanizationEngines {
    selfCorrection: SelfCorrectionEngine;
    disfluency: DisfluencyEngine;
    phoneticMirroring: PhoneticMirroringEngine;
    catchingYourself: CatchingYourselfEngine;
    vocalFatigue: VocalFatigueEngine;
    sessionDynamics: SessionDynamicsEngine;
    comfortProgression: ComfortProgressionEngine;
    voicePrint: VoicePrintEngine;
    ambientAwareness: AmbientAwarenessEngine;
    emotionalLeading: EmotionalLeadingEngine;
    breathingSync: BreathingSyncEngine;
    crossSessionVoice: CrossSessionVoiceEngine;
}
export interface HumanizationOrchestratorConfig {
    /** Maximum total humanizations per response */
    maxPerResponse: number;
    /** Maximum total humanizations per session */
    maxPerSession: number;
    /** Feature-specific configs */
    features: Partial<HumanizationConfig>;
    /** Debug mode - logs all decisions */
    debug: boolean;
}
export declare class HumanizationOrchestrator {
    private sessionId;
    private userId;
    private engines;
    private config;
    private sessionHumanizationCount;
    private currentTurn;
    constructor(sessionId: string, config?: Partial<HumanizationOrchestratorConfig>, userId?: string);
    /**
     * Record a user message for learning
     */
    recordUserMessage(message: string): void;
    /**
     * Apply humanization to a response
     *
     * This is the main entry point for humanizing agent responses.
     */
    humanize(response: string, context: Omit<HumanizationContext, 'responseText' | 'responseWordCount'>): HumanizedResponseResult;
    /**
     * Record a comfort-building event
     */
    recordComfortEvent(event: string, turnCount: number): void;
    /**
     * Check if a behavior is unlocked at current comfort level
     */
    isBehaviorUnlocked(behaviorName: string): boolean;
    /**
     * Get current conversation phase
     */
    getConversationPhase(): string;
    /**
     * Get phase-specific behavior guidance
     */
    getPhaseBehavior(): import("./session-dynamics.js").PhaseBehavior;
    /**
     * Get all engine states for debugging
     */
    getEngineStates(): Record<string, unknown>;
    /**
     * Get emotional leading decision
     */
    getEmotionalLeadingDecision(userState: {
        valence: number;
        arousal: number;
        emotion: string;
        distressLevel: number;
        energy: 'high' | 'medium' | 'low';
        inCrisis: boolean;
    }, userMessage: string): import("./emotional-leading.js").EmotionalLeadingDecision;
    /**
     * Get ambient awareness context
     */
    getAmbientContext(): import("./ambient-awareness.js").AmbientContext | null;
    /**
     * Get cross-session acknowledgment if available
     */
    getCrossSessionAcknowledgment(currentVoice: {
        pitchMean: number;
        pitchMin: number;
        pitchMax: number;
        pitchVariance: number;
        speechRate: number;
        pauseRate: number;
        avgPauseDuration: number;
        energyMean: number;
        energyVariance: number;
        breathiness: number;
        roughness: number;
        strain: number;
        valence: number;
        arousal: number;
        timestamp: Date;
    }): import("./cross-session-voice.js").CrossSessionAcknowledgment | null;
    /**
     * Reset all engines for new session
     */
    reset(): void;
    private detectTopicWeight;
    private estimateComplexity;
    private detectAdviceGiving;
    private detectEmotionalContent;
}
/**
 * Get or create a humanization orchestrator for a session
 */
export declare function getHumanizationOrchestrator(sessionId: string, config?: Partial<HumanizationOrchestratorConfig>, userId?: string): HumanizationOrchestrator;
/**
 * Reset humanization for a session
 */
export declare function resetHumanization(sessionId: string, userId?: string): void;
/**
 * Reset all humanization instances
 */
export declare function resetAllHumanization(): void;
export default HumanizationOrchestrator;
//# sourceMappingURL=index.d.ts.map