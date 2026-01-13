/**
 * Intelligence Module
 *
 * Provides conversational intelligence capabilities:
 * - Emotion detection
 * - Intent classification
 * - Topic tracking
 * - Conversation state management
 * - Session state management
 * - Voice emotion orchestration
 * - Distress level handling
 *
 * NEW: Unified Intelligence System (src/intelligence/unified/)
 * - Single entry point for all analysis: analyzeUnified()
 * - Voice/text mismatch as first-class signal
 * - Consolidated humanization
 * - Naturalness feedback loop
 *
 * @module intelligence
 */
export { UnifiedAnalyzer, analyzeUnified, analyze, // Backward-compat alias for analyzeUnified
type UnifiedAnalysisInput, type UnifiedAnalysisResult, type EmotionSignal, type IntentSignal, type ContextSignal, type MismatchSignal, type ResponseGuidance, } from './unified/unified-analyzer.js';
export { initIntelligenceSession, cleanupIntelligence, getIntelligenceForTurn, recordDomainSignal, markInsightSurfaced, recordInsightReaction, getDomainSignals, wasInsightSurfaced, getInsightReaction, getAllCorrelations, hasProactiveInsight, getTopProactiveInsight, clearIntelligenceCaches, type SurfaceMoment, type DomainSignal, type ImmediateContext, type ContextWindow, type CrossDomainCorrelation, type ProactiveIntelligenceInsight, type IntelligenceForTurnResult, type IntelligenceOptions, } from './unified-intelligence-api.js';
export { assembleContext, selectContextForTurn, formatAssembledContextForPrompt, clearContextCache, invalidateContext, contextAssembler, type AssemblyOptions, type TodayContext, type RecentContext, type RelationshipContext, type CapacityContext, } from './context-assembler.js';
export { recordDomainSignal as recordCorrelationSignal, getCorrelations, getRelevantCorrelations, markCorrelationSurfaced, formatCorrelationsForPrompt, clearCorrelatorState, getCrossCorrelator, crossDomainCorrelator, type CorrelationDomain, type CorrelationFilterOptions, } from './patterns/cross-domain-correlator.js';
export { checkProactiveTriggers, initProactiveSession, cleanupProactiveSession, getProactivePreferences, updateProactivePreferences, clearProactiveState, proactiveEngine, type InsightCategory, type ProactiveTriggerResult, type ProactivePreferences, } from './proactive/proactive-engine.js';
export { VoiceTextMismatchDetector, detectMismatch as detectVoiceTextMismatch, type MismatchResult, type MismatchType, type MismatchGuidance, } from './unified/mismatch-detector.js';
export { HumanizationOrchestrator, humanize, type HumanizationInput, type HumanizationResult, type ActiveListeningCue, type EmotionalMirror, type SpontaneousElement, } from './unified/humanization-orchestrator.js';
export { NaturalnessFeedbackLoop, recordResponse, recordReaction, getEffectivenessReport, getRecommendations, type ResponseContext as FeedbackResponseContext, type UserReaction as FeedbackUserReaction, type NaturalnessSignal, type BuilderEffectiveness, } from './unified/feedback-loop.js';
export { generateNaturalnessReport, logAnalysisSummary, checkNaturalnessIssues, type NaturalnessReport, } from './unified/naturalness-debug.js';
export { DISTRESS, DISTRESS_GUIDANCE, formatDistressForPrompt, getDistressCategory, getDistressGuidance, getSuggestedTone, isCrisis, needsEmotionalSupport, shouldBeGentle, type DistressGuidance, type DistressLevel, } from './distress-levels.js';
export { addReasoningApproach, addUserMessageForStyleDetection, getActiveReasoningChain, getCognitiveState, getCustomState, getLovableState, getSessionFlowState, getSessionState, incrementTurnCount, isInsightOnCooldown, markHabitUsed, markInsightShared, markMemoryReferenced, markQuirkUsed, recordKeyMoment, SessionStateManager, setActiveReasoningChain, setCustomState, updateCognitiveLoad, updateEmotionalTrajectory, updateLovableState, updateSessionFlowState, updateUserCognitiveStyle, updateVoiceEmotion, wasHabitUsed, wasInsightShared, wasMemoryReferenced, wasQuirkUsed, type CognitiveReasoningState, type ConversationFlowState, type EmotionalTrajectory, type LovablePresenceState, type PatternState, type CognitiveLoadState as SessionCognitiveLoadState, type SessionFlowTrackingState, type SessionState, type VoiceEmotionState, } from './session-state.js';
export { analyzeVoiceEmotion, detectEmotionSuppression, formatVoiceEmotionForPrompt, VoiceEmotionOrchestrator, type SuppressionResult, type TextEmotionInput, type VoiceEmotionAnalysis, type VoiceEmotionGuidance, type VoiceEmotionInput, } from './voice-emotion-orchestrator.js';
export { detectEmotion, EmotionDetector, getEmotionDetector, type EmotionResult, type PrimaryEmotion, type Valence, } from './emotion-detector.js';
export { classifyIntent, getIntentClassifier, IntentClassifier, type Intent, type IntentResult, } from './intent-classifier.js';
export { extractTopics, getTopicTracker, TopicTracker, type Topic, type TopicCategory, type TopicExtractionResult, } from './topic-tracker.js';
export { ConversationStateMachine, getStateMachine, resetStateMachine, type ConversationPhase, type ConversationState, type PhaseGuidance, } from './conversation-state.js';
export { detectCulturalMoment, detectUserEngagement, getPreferenceGuidance, getProactiveGoalReference, getRunningJokeCallback, getSpontaneousThought, getVoiceProsodyResponse, HumanBehaviors, inferUserPreferences, shouldInjectBackchannel, verifyTopicThreading, } from './human-behaviors.js';
export { calculatePacingScore, ConversationQuality, createSessionRecoveryState, extractFollowUps, extractSmallDetails, generateFarewellSummary, getDetailCallback, getFollowUpSuggestion, getGracefulErrorResponse, getPersonaPhysicalState, getPhysicalStateInterjection, shouldAttemptRecovery, type ConversationPacingScore, type FarewellSummary, type FollowUpItem, type GracefulError, type PersonaPhysicalState, type SessionRecoveryState, type SmallDetail, } from './conversation-quality.js';
export { getLearningEngine, resetLearningEngine, UserLearningEngine, type ConversationLearningData, type DynamicUserContext, type LearningInsight, } from './user-learning-engine.js';
export { getResponseQualityTracker, removeResponseQualityTracker, ResponseQualityTracker, type LearnedResponsePreferences, type ResponseSignal, type ResponseType, type UserReaction as QualityTrackerUserReaction, type UserResponseQuality, } from './response-quality-tracker.js';
export { ConversationPatternAnalyzer, getConversationPatternAnalyzer, removeConversationPatternAnalyzer, type ConversationPrediction, type ConversationSession, type DayOfWeek, type DurationBucket, type LearnedConversationPatterns, type OpeningStyle, type TimeOfDay, } from './conversation-pattern-analyzer.js';
export { getProactiveInsightEngine, ProactiveInsightEngine, removeProactiveInsightEngine, type InsightGenerationResult, type InsightPriority, type InsightType, type ProactiveInsight, } from './proactive-insight-engine.js';
export { FinancialJourneyTracker, getFinancialJourneyTracker, removeFinancialJourneyTracker, type FinancialJourney, type FinancialSnapshot, type JourneyMilestone, type ProgressTrend, } from './financial-journey-tracker.js';
export { CrossSessionThreader, getCrossSessionThreader, removeCrossSessionThreader, type OpenThread, type PromisedFollowUp, type SessionEndContext, type ThreadOpenReason, type ThreadPriority, } from './cross-session-threader.js';
export { getVoicePaceAdapter, removeVoicePaceAdapter, VoicePaceAdapter, type ConversationTempo, type CurrentPaceState, type EnergyLevel, type LearnedPacePreferences, type PaceCategory, type PaceObservation, } from './voice-pace-adapter.js';
export { CommunityInsightsEngine, getCommunityInsights, resetCommunityInsights, type CommunityJourneyPattern, type CommunityResponsePattern, type EffectiveQuestion, type JourneyTransition, type PhraseEffectiveness, type ResponseStrategySignal, type StoryResonance, } from './community-insights.js';
export { AgentEvolutionEngine, getAgentEvolution, resetAgentEvolution, type EmergentPattern, type PersonaAdjustment, type PersonaEvolutionState, type PersonaExperiment, type StoryRanking, } from './agent-evolution.js';
export { getCoachingQuestion, generateMemoryGroundedQuestion, generatePatternQuestion, generateMirror, getAnticipatoryQuestion, detectPatterns, type MemoryGroundedQuestion, type PatternObservation, type MirrorReflection, type AnticipatedNeed, } from './coaching-questions.js';
export { processTranscriptForPatterns, getUserPatterns, getPatternsToSurface, getPatternForSilence, markPatternSurfaced, generatePatternSurfacingQuestion, type UserPattern, type PatternType, type PatternContext, type PatternObservation as StoredPatternObservation, } from './coaching-patterns.js';
export { analyzeVoiceSignals, getAnticipatedNeed as getAnticipatedNeedFromSignals, initializeVoiceTracking, recordVoiceTurn, getVoiceSignalsForTurn, clearVoiceHistory, type VoiceSignals, type SignalContext, type AnticipatedNeed as VoiceAnticipatedNeed, } from './voice-signals.js';
export { loadCoachingMemories, getMemoriesForTopic, getSuggestedFollowUps, type CoachingMemory, type CoachingMemoryContext, } from './coaching-memory-loader.js';
export { buildConversationContext, createCriticalInjection, createHintInjection, createInjection, createStandardInjection, formatContextForPrompt, getRegisteredBuilders, registerContextBuilder, type ContextBuilder, type ContextBuilderInput, type ContextInjection, type ContextUserData, } from './context-builders/index.js';
export { getHumorCalibration, HumorCalibrationEngine, removeHumorCalibration, resetAllHumorCalibration, type HumorAttempt, type HumorGuidance, type HumorPreferences, type HumorReaction, type HumorType, } from './humor-calibration.js';
export { getStoryPreference, removeStoryPreference, StoryPreferenceEngine, type EmotionalDepth, type StoryAttempt, type StoryGuidance, type StoryLength, type StoryPreferences, type StoryType, type UserEngagement as StoryUserEngagement, } from './story-preference.js';
export { CommunicationMirroringEngine, getCommunicationMirroring, removeCommunicationMirroring, type CommunicationStyle, type FormalityLevel, type EnergyLevel as MirroringEnergyLevel, type StyleGuidance, type VocabularyLevel, } from './communication-mirroring.js';
export { EmotionalMemoryEngine, getEmotionalMemory, removeEmotionalMemory, type EmotionalCheckIn, type EmotionalContext, type EmotionalMoment, type EmotionalPattern, } from './emotional-memory.js';
import { type ConversationState } from './conversation-state.js';
import { type EmotionResult } from './emotion-detector.js';
import { type IntentResult } from './intent-classifier.js';
import { type TopicExtractionResult } from './topic-tracker.js';
/**
 * Combined analysis result
 */
export interface ConversationAnalysis {
    emotion: EmotionResult;
    intent: IntentResult;
    topics: TopicExtractionResult;
    state: ConversationState;
    contextForPrompt: string;
    suggestedTone: string;
    priorityFocus: string;
}
/**
 * Analyze a user message comprehensively
 */
export declare function analyzeMessage(message: string, options?: {
    userName?: string;
    isReturningUser?: boolean;
}): ConversationAnalysis;
/**
 * Reset all intelligence components (for new session)
 */
export declare function resetIntelligence(isReturningUser?: boolean): void;
export { CognitiveLoadDetector, getCognitiveLoadDetector, resetAllCognitiveLoadDetectors, resetCognitiveLoadDetector, type CognitiveLoadIndicators, type CognitiveLoadLevel, type CognitiveLoadObservation, type CognitiveLoadState, } from './cognitive-load.js';
export { getHedgingDetector, HedgingDetector, resetAllHedgingDetectors, resetHedgingDetector, type HedgingAnalysisResult, type HedgingCategory, type HedgingInstance, } from './hedging-detection.js';
export { getSelfSoothingDetector, resetAllSelfSoothingDetectors, resetSelfSoothingDetector, SelfSoothingDetector, type SelfSoothingCategory, type SelfSoothingInstance, type SelfSoothingResult, } from './self-soothing-detection.js';
export { analyzeSilence, formatSilenceForPrompt, getSilencePattern, importSilencePattern, recordSilence, resetSilenceIntelligence, type SilenceAnalysis, type SilencePattern, type SilenceResponse, type SilenceType, } from './silence-intelligence.js';
export { addAnniversary, formatPredictionForPrompt, getLifeRhythmProfile, importLifeRhythmProfile, predictUserState, recordConversationObservation, resetLifeRhythmPrediction, type AnniversaryDate, type LifeRhythmProfile, type MonthlyPattern, type RhythmPrediction, type SeasonalPattern, type WeeklyPattern, } from './life-rhythm-prediction.js';
export { analyzeSupportNetwork, detectUnspokenTension, extractPersonMentions, formatRelationalInsightsForPrompt, generateRelationalInsights, getRelationalNetwork, importRelationalNetwork, recordPersonMention, resetRelationalNetwork, type PersonInLife, type RelationalInsight, type RelationalNetwork, type RelationshipQuality, type RelationshipType, type SupportNetwork, type Triangulation, type UnspokenTension, } from './relational-network.js';
export { analyzeResistance, formatResistanceForPrompt, getResistanceProfile, getResistanceSummary, identifyGrowthEdges, importResistanceProfile, resetResistanceDetection, type AvoidedTopic, type DefensePattern, type GrowthEdge, type ResistanceAnalysis, type ResistanceProfile, type SelfProtectiveProfile, } from './resistance-detection.js';
export { assessEnergyState, formatEnergyForPrompt, getEnergyPattern, importEnergyPattern, markTopicEnergy, resetEnergyStateInference, type EnergyAssessment, type EnergyPattern, type EnergyLevel as EnergyStateLevel, type MentalCapacity, type MentalEnergyState, type PhysicalEnergyState, type SleepQuality, } from './energy-state.js';
export { analyzeSubconscious, formatSubconsciousForPrompt, getSubconsciousProfile, getSubconsciousSummary, importSubconsciousProfile, recordSurfaceReaction, resetSubconsciousGoals, type Contradiction, type EmergingDesire, type GoalCategory, type RecurringPattern, type SubconsciousAnalysis, type SubconsciousProfile, } from './subconscious-goals.js';
export { analyzeFlow, formatFlowForPrompt, getFlowProfile, importFlowProfile, resetConversationalFlow, type ConversationDepth, type DepthIndicators, type FlowAnalysis, type FlowDirection, type FlowProfile, type FlowState, type FlowTransition, type UserSignal, } from './conversational-flow.js';
export { detectMisunderstanding, formatRepairForPrompt, generateRepair, getRepairProfile, importRepairProfile, quickRepairCheck, recordAIResponse, recordRepairOutcome, resetRepairIntelligence, type MisunderstandingDetection, type MisunderstandingSeverity, type MisunderstandingType, type RepairApproach, type RepairAttempt, type RepairProfile, type RepairStrategy, } from './repair-intelligence.js';
export { analyzeHope, formatHopeForPrompt, getHopeProfile, importHopeProfile, resetHopeTrajectory, type HopeAnalysis, type HopeObservation, type HopeProfile, type HopeTrajectory, type TrajectoryDirection, type UrgencyLevel, } from './hope-trajectory.js';
export { analyzeChapter, formatChapterForPrompt, getChapterProfile, importChapterProfile, resetLifeChapterAwareness, type ChapterAnalysis, type ChapterEvidence, type ChapterProfile, type ChapterType, type LifeChapter, type TransitionPhase, } from './life-chapter.js';
export { periodicSync as deepUnderstandingPeriodicSync, deleteDeepUnderstandingProfiles, exportDeepUnderstandingBundle, importDeepUnderstandingBundle, loadDeepUnderstandingProfiles, onSessionEnd as onDeepUnderstandingSessionEnd, onSessionStart as onDeepUnderstandingSessionStart, saveDeepUnderstandingProfiles, type DeepUnderstandingBundle, } from './deep-understanding-persistence.js';
export { analyzeResponseLength, analyzeResponseType, analyzeUserEngagement, flushLearningSignals, getCollectiveRecommendations, initializeCollectiveLearning, recordBreakthroughForLearning, recordResponseForLearning, recordStoryForLearning, shutdownCollectiveLearning, type BreakthroughSignal, type ConversationSignalContext, type ResponseSignalData, type StoryUsageSignal, type UserReactionSignal, } from './collective-learning-integration.js';
export { forceRunAllJobs as forceRunCollectiveLearningJobs, getSchedulerStatus as getCollectiveLearningSchedulerStatus, startCollectiveLearningScheduler, stopCollectiveLearningScheduler, } from './collective-learning-scheduler.js';
export { analyzeVoicePatterns, buildSuperhumanContext, checkUpcomingDates, cleanupDeliveryRecords, detectTopicAbsences, findCelebratableGrowth, findSurfaceableJokes, getComfortGuidance, getTemporalContext, markInsightDelivered as markSuperhumanInsightDelivered, recordVoicePattern, wasRecentlyDelivered, type ComfortGuidance, type SuperhumanContext, type ProactiveInsight as SuperhumanInsight, type TopicAbsenceInsight, type VoicePatternObservation, } from './superhuman-memory.js';
declare const _default: {
    analyzeMessage: typeof analyzeMessage;
    resetIntelligence: typeof resetIntelligence;
};
export default _default;
export { processDataCapture, captureDataBetterThanHuman } from './data-capture/index.js';
export { allDataCaptureDefinitions, contactCaptureDefinition, commitmentCaptureDefinition, dreamCaptureDefinition, relationshipCaptureDefinition, } from './data-capture/definitions/index.js';
export type { DataCaptureDefinition, DataCaptureContext, DataCaptureResult, } from './data-capture/types.js';
//# sourceMappingURL=index.d.ts.map