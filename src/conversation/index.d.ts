/**
 * Conversation Module
 *
 * Exports all conversation-related utilities:
 * - Emotional arc tracking
 * - Response dynamics
 * - Interruption handling
 * - Turn-taking monitoring
 * - Topic change detection
 * - Story timing
 * - Proactive conversation starters
 * - Speech naturalization (disfluencies, hedging, self-correction)
 * - Active listening (backchanneling, mirroring, silence handling)
 * - Conversational memory (callbacks, threading, commitments)
 * - Question patterns (diverse question types for natural conversation)
 *
 * ============================================================================
 * 🎭 RECOMMENDED: UNIFIED INTEGRATION API
 * ============================================================================
 *
 * For voice agent integration, use the unified session-based API:
 *
 * ```typescript
 * // In voice-agent.ts
 * import {
 *   initConversationSession,
 *   humanizeAgentResponse,
 *   cleanupConversationSession,
 * } from './agents/integrations/conversation-session-integration.js';
 *
 * // At session start
 * initConversationSession({ sessionId, userId, personaId, ... });
 *
 * // For POST-LLM humanization
 * const result = await humanizeAgentResponse(sessionId, rawResponse, context);
 *
 * // At session end
 * cleanupConversationSession(sessionId);
 * ```
 *
 * For direct orchestrator access, use:
 * ```typescript
 * import { createConversationSession } from '../conversation/unified-integration.js';
 * ```
 *
 * @see unified-integration.ts for the main session API
 * @see orchestrator/ for the underlying ConversationOrchestrator
 */
export { evaluateConversationQuality, type ConversationQualityInput, type ConversationQualityScore, } from './eval/index.js';
export { EmotionalArcTracker, getEmotionalArcTracker, resetEmotionalArcTracker, type CrossSessionArcSummary, type EmotionalArc, type EmotionalResponse, type EmotionalSnapshot, type NarrativePhase, } from './emotional-arc.js';
export { getResponseDynamicsEngine, resetResponseDynamicsEngine, ResponseDynamicsEngine, type PacingAnalysis, type ResponseLengthRecommendation, type TopicTransition, type UserEngagementMetrics, } from './response-dynamics.js';
export { getInterruptionHandler, InterruptionHandler, resetInterruptionHandler, type InterruptionEvent, } from './interruption-handler.js';
export { getTurnTakingMonitor, resetTurnTakingMonitor, TurnTakingMonitor, type TurnRecord, type TurnTakingStats, } from './turn-taking.js';
export { getStoryTimingEngine, resetStoryTimingEngine, StoryTimingEngine, type StoryMetrics, type StoryRecommendation, type StoryTimingContext, } from './story-timing.js';
export { buildOpenerContext, generateProactiveOpener, generateProactiveOpenerAsync, type ConversationOpener, type OpenerContext, type OpenerType, } from './proactive-starters.js';
export { applyRandomImperfection, DOUBT_TO_CONVICTION, generateCourseCorrection, generateDoubtToConviction, generateFragment, generateGracefulUncertainty, generateSelfInterruption, generateThinkingOutLoud, getSpeechNaturalizer, GRACEFUL_UNCERTAINTY, MID_THOUGHT_CORRECTIONS, resetSpeechNaturalizer, SELF_INTERRUPTIONS, shouldApplyImperfection, SpeechNaturalizer, THINKING_OUT_LOUD, type DisfluencyConfig, type NaturalizationContext, type ThinkingPattern, } from './speech-naturalizer.js';
export { ActiveListeningEngine, getActiveListeningEngine, resetActiveListeningEngine, type Backchannel, type BackchannelContext, type ClarifyingQuestion, type MirroredPhrase, } from './active-listening.js';
export { ConversationalMemoryEngine, getConversationalMemory, resetConversationalMemory, type ConversationCommitment, type ConversationThread, type MemoryCallback, type QuotedMemory, type TopicChange, type UserStatement, } from './conversational-memory.js';
export { getQuestionPatternEngine, QuestionPatternEngine, resetQuestionPatternEngine, type Question, type QuestionContext, type QuestionType, } from './question-patterns.js';
export { ConversationHumanizer, getConversationHumanizer, resetConversationHumanizer, type ContextGuidance, type HumanizationContext, type HumanizedResponse, type PreResponseActions, } from './humanizer.js';
export { getThinkingPhraseCoordinator, requestThinkingPhrase, resetThinkingPhraseCoordinator, wasPhraseUsedThisTurn, type ThinkingPhraseRequest, type ThinkingPhraseResult, type ThinkingPhraseSource, } from './thinking-phrase-coordinator.js';
export { applyPreset, getEffectiveRate, getHumanizingConfig, getRecommendedPreset, HUMANIZING_PRESETS, resetHumanizingConfig, shouldApplyFeature, updateHumanizingConfig, type HumanizingConfig, } from './humanizing-config.js';
export { DEFAULT_TUNING, getEffectiveProbability, getPersonaTuning, getTuningValue, shouldFireFeature, TUNING_PRESETS, type HumanizationTuning, } from './humanization-tuning.js';
export { getEffectCoordinator, getEffectTracker, resetEffectCoordinator, resetEffectTracker, resetAllEffectCoordinators, resetAllEffectTrackers, createBreathSoundEffect, createFirstTurnNoticingEffect, createExcitementInterruptionEffect, createSpeechFillerEffect, registerDefaultEffects, createCoordinatorWithEffects, buildEffectContext, type AppliedEffect, type EffectApplicationResult, type EffectConfig, type EffectContext, type EffectCoordinator, type EffectResult, type EffectTracker, type HumanizationCapability, type HumanizationEffect, type SkippedEffect as EffectSkipped, type DetectedSignals as EffectDetectedSignals, type SessionData as EffectSessionData, type EffectPlacement, } from './effects/index.js';
export { applyDeepHumanization, getMoodTracker, resetDeepHumanization, resetMoodTracker, resetAllDeepHumanization, type ConversationMood, type HumanizationContext as DeepHumanizationContext, type HumanizationInjection, type HumanizationType, type SessionMemory, } from './deep-humanization/index.js';
export { classifyTopicWeight, detectAdviceGiving, detectBreakthrough, detectEvidence, } from './utils/detection.js';
export { getSilencePresenceEngine, resetSilencePresenceEngine, SilencePresenceEngine, type SilenceConfig, type SilenceDecision, type SilenceReason, } from './silence-presence.js';
export { ConversationRhythmTracker, getConversationRhythmTracker, resetConversationRhythmTracker, type EnergyTrend, type PausePattern, type RhythmGuidance, type RhythmSnapshot, type UserPacing, } from './conversation-rhythm.js';
export { getNarrativeArcTracker, NarrativeArcTracker, resetAllNarrativeArcTrackers, resetNarrativeArcTracker, type InterventionType, type NarrativeArcResult, type NarrativeContext, type NarrativePoint, type NarrativeStructure, } from './narrative-arc.js';
export { EngagementScorer, getEngagementScorer, resetAllEngagementScorers, resetEngagementScorer, type EngagementAction, type EngagementLevel, type EngagementObservation, type EngagementScoringResult, type EngagementSignals, } from './engagement-scoring.js';
export { ConcernDetectionEngine, getConcernDetectionEngine, resetAllConcernDetectionEngines, resetConcernDetectionEngine, type BreathingSignals, type ConcernApproach, type ConcernLevel, type ConcernSignal, type ConcernState, type ConcernType, type ProsodySignals, type TemporalContext, } from './concern-detection.js';
export { clearProactiveMemoryEngine, getProactiveMemoryEngine, ProactiveMemoryEngine, resetProactiveMemoryEngine, type MemoryType, type PatternDetection, type ProactiveMemorySuggestion, type StoredMemory, } from './proactive-memory.js';
export { clearPredictiveAnticipationEngine, getPredictiveAnticipationEngine, PredictiveAnticipationEngine, resetPredictiveAnticipationEngine, type EmotionalHistoryEntry, type EmotionalPrediction, type EmotionalTrajectory, type NeedPrediction, type PredictedNeed, type PredictionResult, type ProsodyInput, type TopicSequencePrediction, type UserBaseline, type VoiceStatePrediction, } from './predictive-anticipation.js';
export { clearSessionIntelligence, getSessionIntelligence, resetSessionIntelligence, SessionIntelligenceOrchestrator, type ResponseGuidance, type ResponseModification, type SessionIntelligenceContext, type SessionIntelligenceInsight, } from './session-intelligence.js';
export { addSignposting, analyzeContent, applyDeliveryPacing, detectContentType, getSummaryIntro, shouldApplyDeliveryPacing, type ContentAnalysis, type ContentSegment, type ContentType, type DeliveryOptions, type SegmentPacing, } from './content-delivery-pacing.js';
export { addIntakeBreath, addMidSentenceReactions, addPitchVariation, applyEmotionBleeding, detectEmotionalContent, detectHeavyContent, detectUserEnergy, enforceContractions, generateVocalProfile, humanizeVocals, type EnergyLevel, type HumanizedVocals, type VocalContext, type VocalProfile, } from './vocal-humanization.js';
export { analyzeMessage, detectDisengagement, detectEngagementLevel, detectHesitation, detectHighEngagement, detectUserEnergyDetailed, type EngagementLevel as DetectedEngagementLevel, type DetectionResult, type MessageAnalysis, type TopicWeight, } from './utils/index.js';
export { clearSubtextDetectionEngine, getSubtextDetectionEngine, resetSubtextDetectionEngine, SubtextDetectionEngine, type SubtextContext, type SubtextDetection, type SubtextType, } from './subtext-detection.js';
export { clearEmotionalAftercareEngine, EmotionalAftercareEngine, getEmotionalAftercareEngine, resetEmotionalAftercareEngine, type AftercareGuidance, type AftercarePhase, type AftercarePriority, type AftercareState, type EmotionalEvent, type EmotionalIntensity, } from './emotional-aftercare.js';
export { clearConversationalRepairEngine, ConversationalRepairEngine, getConversationalRepairEngine, resetConversationalRepairEngine, type MiscueSignal, type MiscueType, type RepairDecision, type RepairStrategy, } from './conversational-repair.js';
export { clearHopeInjectionEngine, getHopeInjectionEngine, HopeInjectionEngine, resetHopeInjectionEngine, type FutureAnchor, type HopeContext, type HopeGuidance, type HopeInjection, type HopeType, } from './hope-injection.js';
export { clearCuriosityEngine, CuriosityEngine, getCuriosityEngine, resetCuriosityEngine, type CuriosityPrompt, type CuriosityState, type ConversationThread as CuriosityThread, type LifeDetail, } from './curiosity-engine.js';
export { clearEnergyRegulationEngine, EnergyRegulationEngine, getEnergyRegulationEngine, resetEnergyRegulationEngine, type EnergyGuidance, type EnergyHistory, type EnergyLevel as EnergyRegulationLevel, type EnergyState, type EnergyValence, type RegulationDecision, type RegulationStrategy, } from './energy-regulation.js';
export { clearMicroAffirmationEngine, getMicroAffirmationEngine, MicroAffirmationEngine, resetMicroAffirmationEngine, type AffirmationContext, type AffirmationDecision, type AffirmationDensityConfig, type AffirmationType, type MicroAffirmation, } from './micro-affirmations.js';
export { clearTemporalContextEngine, getTemporalContextEngine, resetTemporalContextEngine, TemporalContextEngine, type DayType, type TemporalGuidance, type TemporalMood, type TemporalState, type TimeOfDay, type UpcomingEvent, } from './temporal-context.js';
export { clearRelationshipEventsEngine, getRelationshipEventsEngine, RelationshipEventsEngine, resetRelationshipEventsEngine, type MilestoneOpportunity, type MilestoneType, type RelationshipMilestone, type RelationshipState, type SharedMemory, } from './relationship-events.js';
export { clearParadoxicalInterventionEngine, getParadoxicalInterventionEngine, ParadoxicalInterventionEngine, resetParadoxicalInterventionEngine, type AdviceHistory, type InterventionDecision, type InterventionType as ParadoxicalInterventionType, type ResistanceDetection, type ResistanceType, } from './paradoxical-intervention.js';
export { buildEmotionalContext, orchestrateEmotionalJourney, type EmotionalContext, type EmotionalMomentType, type JourneyDecision, type JourneyPhase, } from './emotional-journey-orchestrator.js';
export { AdvancedHumanizationOrchestrator, clearAdvancedHumanization, getAdvancedHumanization, resetAdvancedHumanization, type AdvancedHumanizationContext, type AdvancedHumanizationResult, type SessionStartResult, } from './advanced-humanization.js';
export { addSharedMemory as addAdvancedSharedMemory, addSignificantDate as addAdvancedSignificantDate, cleanupAdvancedHumanization, getClosingGuidance as getAdvancedClosingGuidance, getAdvancedHumanizationState, getResponseModifications as getAdvancedResponseModifications, initAdvancedHumanization, processAdvancedTurn, recordAdviceGiven as recordAdvancedAdviceGiven, recordAgentResponse as recordAdvancedAgentResponse, recordMilestone as recordAdvancedMilestone, type AdvancedHumanizationSessionConfig, type ResponseModification as AdvancedResponseModification, type TurnGuidance, } from './advanced-humanization-integration.js';
export { createConversationSession, endConversationSession, getActiveSessions, getConversationSession, quickHumanize, type ConversationSession, type ConversationSessionConfig, type TurnInput, type TurnResult, } from './unified-integration.js';
/**
 * Reset all conversation tracking for a new session
 */
export declare function resetAllConversationState(personaId?: string, sessionId?: string, userId?: string): void;
export { CircuitBreaker, clearABTests, clearDetectionCache, clearSessionRecords, ConversationOrchestrator, createABTest, createHumanizer, createOrchestratedHumanizer, createProfiler, DEFAULT_ORCHESTRATOR_CONFIG, endABTest, exportSession, getABTestStats, getABTestVariant, getAggregatedMetrics, getCircuitBreaker, getCircuitBreakerStatus, getConfigAdapter, getConversationOrchestrator, getDebugSnapshot, getHealthStatus, getMetricsCollector, getOrchestratedHumanizer, getOrComputeDetection, getPerformanceStats, getSessionRecords, getSystemHealth, logDebugSummary, logFeatureStats, logMetricsSummary, logSlowOrchestration, LRUCache, orchestratorConfig, orchestratorDebug, profileOrchestration, recordOrchestration, resetAllCircuitBreakers, resetAllMetrics, resetAllOrchestratedHumanizers, resetAllOrchestrators, resetConfigAdapter, resetConversationOrchestrator, resetMetrics, resetOrchestratedHumanizer, resetPerformanceOptimizations, withTimeout, type ABTestConfig, type AnalysisContext, type AnalysisPhaseResult, type AppliedFeature, type CircuitBreakerConfig, type CircuitState, type DebugSnapshot, type DetectedSignals, type ExtendedHumanizationContext, type ExtendedHumanizedResponse, type FeatureMetrics, type HealthIndicators, type HumanizationPhaseResult, type IntelligenceGuidance, type IntelligencePhaseResult, type MetricsCollector, type MetricsSnapshot, type OrchestratedHumanizer, type OrchestrationRecord, type OrchestratorConfig, type OrchestratorConfigAdapter, type OrchestratorInput, type OrchestratorMetrics, type OrchestratorOutput, type OutputMetadata, type PhaseMetrics, type PriorityAction, type ResponseAdditions, type SkippedFeature, type UnifiedFeatureState, type UnifiedPreset, } from './orchestrator/index.js';
//# sourceMappingURL=index.d.ts.map