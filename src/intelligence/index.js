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
// ============================================================================
// UNIFIED INTELLIGENCE SYSTEM (PREFERRED)
// ============================================================================
export { 
// Main analyzer
UnifiedAnalyzer, analyzeUnified, analyze, // Backward-compat alias for analyzeUnified
 } from './unified/unified-analyzer.js';
// ============================================================================
// UNIFIED INTELLIGENCE API (Levels 2-5)
// ============================================================================
export { 
// Session lifecycle
initIntelligenceSession, cleanupIntelligence, 
// Main API
getIntelligenceForTurn, 
// Domain signals
recordDomainSignal, 
// Insight tracking
markInsightSurfaced, recordInsightReaction, 
// Utility exports
getDomainSignals, wasInsightSurfaced, getInsightReaction, getAllCorrelations, hasProactiveInsight, getTopProactiveInsight, clearIntelligenceCaches, } from './unified-intelligence-api.js';
// ============================================================================
// CONTEXT ASSEMBLER (Level 2) - "Knows what matters RIGHT NOW"
// ============================================================================
export { assembleContext, selectContextForTurn, formatAssembledContextForPrompt, clearContextCache, invalidateContext, contextAssembler, } from './context-assembler.js';
// ============================================================================
// CROSS-DOMAIN CORRELATOR (Level 4) - "Connects dots humans miss"
// ============================================================================
export { recordDomainSignal as recordCorrelationSignal, getCorrelations, getRelevantCorrelations, markCorrelationSurfaced, formatCorrelationsForPrompt, clearCorrelatorState, getCrossCorrelator, crossDomainCorrelator, } from './patterns/cross-domain-correlator.js';
// ============================================================================
// PROACTIVE ENGINE (Level 5) - "Decides WHEN to share insights"
// ============================================================================
export { checkProactiveTriggers, initProactiveSession, cleanupProactiveSession, getProactivePreferences, updateProactivePreferences, clearProactiveState, proactiveEngine, } from './proactive/proactive-engine.js';
export { 
// THE superhuman signal
VoiceTextMismatchDetector, detectMismatch as detectVoiceTextMismatch, } from './unified/mismatch-detector.js';
export { 
// Consolidated humanization
HumanizationOrchestrator, humanize, } from './unified/humanization-orchestrator.js';
export { 
// Naturalness feedback
NaturalnessFeedbackLoop, recordResponse, recordReaction, getEffectivenessReport, getRecommendations, } from './unified/feedback-loop.js';
export { 
// Debug tools
generateNaturalnessReport, logAnalysisSummary, checkNaturalnessIssues, } from './unified/naturalness-debug.js';
// ============================================================================
// NEW INFRASTRUCTURE (added in refactor)
// ============================================================================
// Distress Levels - Centralized thresholds for emotional support
export { DISTRESS, DISTRESS_GUIDANCE, formatDistressForPrompt, getDistressCategory, getDistressGuidance, getSuggestedTone, isCrisis, needsEmotionalSupport, shouldBeGentle, } from './distress-levels.js';
// Session State - Centralized session state management
export { 
// Cognitive state helpers
addReasoningApproach, addUserMessageForStyleDetection, getActiveReasoningChain, getCognitiveState, 
// Core state management
getCustomState, 
// Lovable presence helpers
getLovableState, 
// Session flow helpers
getSessionFlowState, getSessionState, incrementTurnCount, isInsightOnCooldown, markHabitUsed, markInsightShared, markMemoryReferenced, markQuirkUsed, recordKeyMoment, SessionStateManager, setActiveReasoningChain, setCustomState, updateCognitiveLoad, updateEmotionalTrajectory, updateLovableState, updateSessionFlowState, updateUserCognitiveStyle, updateVoiceEmotion, wasHabitUsed, wasInsightShared, wasMemoryReferenced, wasQuirkUsed, } from './session-state.js';
// Voice Emotion Orchestrator - Unified voice emotion analysis
export { analyzeVoiceEmotion, detectEmotionSuppression, formatVoiceEmotionForPrompt, VoiceEmotionOrchestrator, } from './voice-emotion-orchestrator.js';
// ============================================================================
// CORE INTELLIGENCE
// ============================================================================
// Emotion Detection
export { detectEmotion, EmotionDetector, getEmotionDetector, } from './emotion-detector.js';
// Intent Classification
export { classifyIntent, getIntentClassifier, IntentClassifier, } from './intent-classifier.js';
// Topic Tracking
export { extractTopics, getTopicTracker, TopicTracker, } from './topic-tracker.js';
// Conversation State
export { ConversationStateMachine, getStateMachine, resetStateMachine, } from './conversation-state.js';
// Human-Like Behaviors
export { detectCulturalMoment, detectUserEngagement, getPreferenceGuidance, getProactiveGoalReference, getRunningJokeCallback, getSpontaneousThought, getVoiceProsodyResponse, HumanBehaviors, inferUserPreferences, shouldInjectBackchannel, verifyTopicThreading, } from './human-behaviors.js';
// Conversation Quality & Advanced Features
export { calculatePacingScore, ConversationQuality, createSessionRecoveryState, extractFollowUps, extractSmallDetails, generateFarewellSummary, getDetailCallback, getFollowUpSuggestion, getGracefulErrorResponse, getPersonaPhysicalState, getPhysicalStateInterjection, shouldAttemptRecovery, } from './conversation-quality.js';
// User Learning Engine - Makes Jack smarter over time
export { getLearningEngine, resetLearningEngine, UserLearningEngine, } from './user-learning-engine.js';
// Response Quality Tracker - Learn what responses work
export { getResponseQualityTracker, removeResponseQualityTracker, ResponseQualityTracker, } from './response-quality-tracker.js';
// Conversation Pattern Analyzer - Learn user habits
export { ConversationPatternAnalyzer, getConversationPatternAnalyzer, removeConversationPatternAnalyzer, } from './conversation-pattern-analyzer.js';
// Proactive Insight Engine - Generate suggestions
export { getProactiveInsightEngine, ProactiveInsightEngine, removeProactiveInsightEngine, } from './proactive-insight-engine.js';
// Financial Journey Tracker - Track long-term progress
export { FinancialJourneyTracker, getFinancialJourneyTracker, removeFinancialJourneyTracker, } from './financial-journey-tracker.js';
// Cross-Session Threader - Continue topics across sessions
export { CrossSessionThreader, getCrossSessionThreader, removeCrossSessionThreader, } from './cross-session-threader.js';
// Voice Pace Adapter - Match user's rhythm
export { getVoicePaceAdapter, removeVoicePaceAdapter, VoicePaceAdapter, } from './voice-pace-adapter.js';
// ============================================================================
// COLLECTIVE LEARNING SYSTEM
// ============================================================================
// Community Insights - Learn from all users
export { CommunityInsightsEngine, getCommunityInsights, resetCommunityInsights, } from './community-insights.js';
// Agent Evolution - Self-improvement from learnings
export { AgentEvolutionEngine, getAgentEvolution, resetAgentEvolution, } from './agent-evolution.js';
// ============================================================================
// COACHING INTELLIGENCE - "Better Than Human" Question Generation
// ============================================================================
// Coaching Questions - Memory-grounded, pattern-surfacing, anticipatory
export { getCoachingQuestion, generateMemoryGroundedQuestion, generatePatternQuestion, generateMirror, getAnticipatoryQuestion, detectPatterns, } from './coaching-questions.js';
// Pattern Tracking - Cross-session pattern detection
export { processTranscriptForPatterns, getUserPatterns, getPatternsToSurface, getPatternForSilence, markPatternSurfaced, generatePatternSurfacingQuestion, } from './coaching-patterns.js';
// Voice Signals - Anticipatory question triggers
export { analyzeVoiceSignals, getAnticipatedNeed as getAnticipatedNeedFromSignals, initializeVoiceTracking, recordVoiceTurn, getVoiceSignalsForTurn, clearVoiceHistory, } from './voice-signals.js';
// Memory Loader - Load memories for coaching questions
export { loadCoachingMemories, getMemoriesForTopic, getSuggestedFollowUps, } from './coaching-memory-loader.js';
// ============================================================================
// CONTEXT BUILDERS - Modular conversation intelligence injection
// ============================================================================
export { buildConversationContext, createCriticalInjection, createHintInjection, createInjection, createStandardInjection, formatContextForPrompt, getRegisteredBuilders, registerContextBuilder, } from './context-builders/index.js';
// ============================================================================
// HUMAN-LEVEL INTERACTION FEATURES
// ============================================================================
// Humor Calibration - Learn what jokes land
export { getHumorCalibration, HumorCalibrationEngine, removeHumorCalibration, resetAllHumorCalibration, } from './humor-calibration.js';
// Story Preference - Track what resonates
export { getStoryPreference, removeStoryPreference, StoryPreferenceEngine, } from './story-preference.js';
// Communication Style Mirroring - Match their language
export { CommunicationMirroringEngine, getCommunicationMirroring, removeCommunicationMirroring, } from './communication-mirroring.js';
// Emotional Memory - Cross-session emotional continuity
export { EmotionalMemoryEngine, getEmotionalMemory, removeEmotionalMemory, } from './emotional-memory.js';
// ============================================================================
// UNIFIED ANALYZER - Recommended single entry point for complete analysis
// ============================================================================
// ============================================================================
// LEGACY UNIFIED ANALYZER (DEPRECATED)
// ============================================================================
// The root unified-analyzer.ts has been consolidated into ./unified/unified-analyzer.ts
// Use analyzeUnified() from './unified/unified-analyzer.js' instead.
// The following exports were removed:
// - analyze (now exported from ./unified/ as backward-compat alias)
// - analyzeSync (was unused - use synchronous emotion detection if needed)
// - CombinedEmotion, DeepUnderstandingInsights, LegacyUnifiedAnalysisInput,
//   LegacyUnifiedAnalysisResult, UnifiedBehavioralSignals, UnifiedResponseGuidance
//   (internal types that were never imported externally)
// ============================================================================
// COMBINED ANALYSIS
// ============================================================================
import { getLogger } from '../utils/safe-logger.js';
import { getStateMachine, resetStateMachine, } from './conversation-state.js';
import { getEmotionDetector } from './emotion-detector.js';
import { getIntentClassifier } from './intent-classifier.js';
import { getTopicTracker } from './topic-tracker.js';
/**
 * Analyze a user message comprehensively
 */
export function analyzeMessage(message, options) {
    // Get or create components
    const emotionDetector = getEmotionDetector();
    const intentClassifier = getIntentClassifier();
    const topicTracker = getTopicTracker();
    const stateMachine = getStateMachine(options?.isReturningUser);
    // Run all analyses
    const emotion = emotionDetector.detect(message);
    const intent = intentClassifier.classify(message);
    const topics = topicTracker.extract(message);
    // Update state machine
    const state = stateMachine.processTurn({
        userMessage: message,
        emotion,
        intent,
        topics: topics.detected,
        userName: options?.userName,
    });
    // Build context for prompt injection
    const guidance = stateMachine.getGuidance();
    const contextForPrompt = buildContextForPrompt(emotion, intent, topics, state, guidance);
    // Determine suggested tone
    const suggestedTone = determineSuggestedTone(emotion, state);
    // Determine priority focus
    const priorityFocus = determinePriorityFocus(emotion, intent, state);
    getLogger().info(`Analysis: emotion=${emotion.primary}, intent=${intent.primary}, phase=${state.phase}`);
    return {
        emotion,
        intent,
        topics,
        state,
        contextForPrompt,
        suggestedTone,
        priorityFocus,
    };
}
/**
 * Build context string for prompt injection
 */
function buildContextForPrompt(emotion, intent, topics, state, guidance) {
    const sections = [];
    // Emotional awareness
    if (emotion.distressLevel > 0.5) {
        sections.push(`[PRIORITY] User appears distressed (${emotion.primary}, distress: ${emotion.distressLevel.toFixed(2)}). Focus on emotional support first.`);
    }
    else if (emotion.valence === 'positive') {
        sections.push(`[MOOD] User seems ${emotion.primary}. Match their energy.`);
    }
    // Intent guidance
    if (intent.requiresEmpathy) {
        sections.push(`[APPROACH] ${intent.suggestedApproach}`);
    }
    // Phase guidance
    sections.push(`[PHASE] ${state.phase} - ${guidance.focus}`);
    // Topic context
    if (topics.isTopicShift) {
        sections.push(`[TOPIC SHIFT] User is changing subjects. Acknowledge and follow.`);
    }
    if (state.topicsToCircleBack.length > 0 && state.turnCount % 5 === 0) {
        sections.push(`[CIRCLE BACK] Consider returning to: ${state.topicsToCircleBack[0]}`);
    }
    return sections.join('\n');
}
/**
 * Determine suggested tone
 */
function determineSuggestedTone(emotion, state) {
    // Distress overrides everything
    if (state.userNeedsSupport || emotion.distressLevel > 0.6) {
        return 'gentle';
    }
    // Phase-based
    switch (state.phase) {
        case 'greeting':
        case 'follow_up':
            return 'warm';
        case 'supporting':
            return 'gentle';
        case 'advising':
            return 'wise';
        case 'wrapping_up':
            return 'warm';
        default:
            return emotion.suggestedTone;
    }
}
/**
 * Determine priority focus
 */
function determinePriorityFocus(emotion, intent, state) {
    // Emotional support is always priority
    if (state.userNeedsSupport) {
        return 'Provide emotional support - acknowledge feelings before anything else';
    }
    // Intent-based
    if (intent.requiresEmpathy) {
        return `Validate their feelings about ${intent.primary}`;
    }
    if (intent.requiresAction) {
        return `Help with: ${intent.primary}`;
    }
    // Phase-based
    switch (state.phase) {
        case 'greeting':
            return 'Make genuine personal connection';
        case 'warming_up':
            return 'Get to know them as a person';
        case 'exploring':
            return 'Understand their complete picture';
        case 'advising':
            return 'Share relevant wisdom';
        case 'wrapping_up':
            return 'Leave them feeling supported';
        default:
            return 'Listen and respond naturally';
    }
}
/**
 * Reset all intelligence components (for new session)
 */
export function resetIntelligence(isReturningUser = false) {
    getEmotionDetector().clearHistory();
    getTopicTracker().clear();
    resetStateMachine(isReturningUser);
    getLogger().info('Intelligence components reset');
}
// ============================================================================
// COGNITIVE LOAD DETECTION
// ============================================================================
export { CognitiveLoadDetector, getCognitiveLoadDetector, resetAllCognitiveLoadDetectors, resetCognitiveLoadDetector, } from './cognitive-load.js';
// ============================================================================
// HEDGING LANGUAGE DETECTION
// ============================================================================
export { getHedgingDetector, HedgingDetector, resetAllHedgingDetectors, resetHedgingDetector, } from './hedging-detection.js';
// ============================================================================
// SELF-SOOTHING DETECTION
// ============================================================================
export { getSelfSoothingDetector, resetAllSelfSoothingDetectors, resetSelfSoothingDetector, SelfSoothingDetector, } from './self-soothing-detection.js';
// ============================================================================
// DEEP UNDERSTANDING SYSTEMS - Superhuman Emotional Intelligence
// ============================================================================
// Silence Intelligence - Understanding what different pauses mean
export { analyzeSilence, formatSilenceForPrompt, getSilencePattern, importSilencePattern, recordSilence, resetSilenceIntelligence, } from './silence-intelligence.js';
// Life Rhythm Prediction - Anticipating support needs
export { addAnniversary, formatPredictionForPrompt, getLifeRhythmProfile, importLifeRhythmProfile, predictUserState, recordConversationObservation, resetLifeRhythmPrediction, } from './life-rhythm-prediction.js';
// Relational Network Intelligence - Understanding people in their life
export { analyzeSupportNetwork, detectUnspokenTension, extractPersonMentions, formatRelationalInsightsForPrompt, generateRelationalInsights, getRelationalNetwork, importRelationalNetwork, recordPersonMention, resetRelationalNetwork, } from './relational-network.js';
// Resistance Pattern Detection - What they're avoiding
export { analyzeResistance, formatResistanceForPrompt, getResistanceProfile, getResistanceSummary, identifyGrowthEdges, importResistanceProfile, resetResistanceDetection, } from './resistance-detection.js';
// Energy State Inference - Physical/mental capacity
export { assessEnergyState, formatEnergyForPrompt, getEnergyPattern, importEnergyPattern, markTopicEnergy, resetEnergyStateInference, } from './energy-state.js';
// Subconscious Goal Detection - What they want but haven't articulated
export { analyzeSubconscious, formatSubconsciousForPrompt, getSubconsciousProfile, getSubconsciousSummary, importSubconsciousProfile, recordSurfaceReaction, resetSubconsciousGoals, } from './subconscious-goals.js';
// Conversational Flow Optimizer - When to go deep vs light
export { analyzeFlow, formatFlowForPrompt, getFlowProfile, importFlowProfile, resetConversationalFlow, } from './conversational-flow.js';
// Repair Intelligence - Fixing misunderstandings
export { detectMisunderstanding, formatRepairForPrompt, generateRepair, getRepairProfile, importRepairProfile, quickRepairCheck, recordAIResponse, recordRepairOutcome, resetRepairIntelligence, } from './repair-intelligence.js';
// Hope Trajectory Tracking - Long-term resilience
export { analyzeHope, formatHopeForPrompt, getHopeProfile, importHopeProfile, resetHopeTrajectory, } from './hope-trajectory.js';
// Life Chapter Awareness - Major life phases
export { analyzeChapter, formatChapterForPrompt, getChapterProfile, importChapterProfile, resetLifeChapterAwareness, } from './life-chapter.js';
// Deep Understanding Persistence
export { periodicSync as deepUnderstandingPeriodicSync, deleteDeepUnderstandingProfiles, exportDeepUnderstandingBundle, importDeepUnderstandingBundle, loadDeepUnderstandingProfiles, onSessionEnd as onDeepUnderstandingSessionEnd, onSessionStart as onDeepUnderstandingSessionStart, saveDeepUnderstandingProfiles, } from './deep-understanding-persistence.js';
// ============================================================================
// COLLECTIVE LEARNING INTEGRATION
// ============================================================================
export { analyzeResponseLength, analyzeResponseType, analyzeUserEngagement, flushLearningSignals, getCollectiveRecommendations, initializeCollectiveLearning, recordBreakthroughForLearning, recordResponseForLearning, recordStoryForLearning, shutdownCollectiveLearning, } from './collective-learning-integration.js';
// ============================================================================
// COLLECTIVE LEARNING SCHEDULER
// ============================================================================
export { forceRunAllJobs as forceRunCollectiveLearningJobs, getSchedulerStatus as getCollectiveLearningSchedulerStatus, startCollectiveLearningScheduler, stopCollectiveLearningScheduler, } from './collective-learning-scheduler.js';
// ============================================================================
// SUPERHUMAN MEMORY - "Better than Human" proactive memory intelligence
// ============================================================================
export { analyzeVoicePatterns, 
// Main context builder
buildSuperhumanContext, 
// Date awareness
checkUpcomingDates, cleanupDeliveryRecords, 
// Topic absence
detectTopicAbsences, 
// Growth celebration
findCelebratableGrowth, 
// Inside jokes
findSurfaceableJokes, 
// Comfort patterns
getComfortGuidance, 
// Temporal
getTemporalContext, 
// Delivery tracking
markInsightDelivered as markSuperhumanInsightDelivered, 
// Voice patterns
recordVoicePattern, wasRecentlyDelivered, } from './superhuman-memory.js';
export default {
    analyzeMessage,
    resetIntelligence,
};
// ============================================================================
// SEMANTIC DATA CAPTURE ROUTER ("Better than Human" - passive learning)
// ============================================================================
export { processDataCapture, captureDataBetterThanHuman } from './data-capture/index.js';
export { allDataCaptureDefinitions, contactCaptureDefinition, commitmentCaptureDefinition, dreamCaptureDefinition, relationshipCaptureDefinition, } from './data-capture/definitions/index.js';
//# sourceMappingURL=index.js.map