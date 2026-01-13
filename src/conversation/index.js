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
// Import reset functions for local use
import { resetActiveListeningEngine as _resetActiveListening } from './active-listening.js';
import { resetAdvancedHumanization as _resetAdvancedHumanization } from './advanced-humanization.js';
import { resetConcernDetectionEngine as _resetConcernDetection } from './concern-detection.js';
import { resetConversationRhythmTracker as _resetConversationRhythm } from './conversation-rhythm.js';
import { resetConversationalMemory as _resetConversationalMemory } from './conversational-memory.js';
import { resetConversationalRepairEngine as _resetConversationalRepair } from './conversational-repair.js';
import { resetCuriosityEngine as _resetCuriosity } from './curiosity-engine.js';
import { resetDeepHumanization as _resetDeepHumanization } from './deep-humanization/index.js';
import { resetEmotionalAftercareEngine as _resetEmotionalAftercare } from './emotional-aftercare.js';
import { resetEmotionalArcTracker as _resetEmotionalArc } from './emotional-arc.js';
import { resetEnergyRegulationEngine as _resetEnergyRegulation } from './energy-regulation.js';
import { resetHopeInjectionEngine as _resetHopeInjection } from './hope-injection.js';
import { resetConversationHumanizer as _resetHumanizer } from './humanizer.js';
import { resetInterruptionHandler as _resetInterruption } from './interruption-handler.js';
import { resetMicroAffirmationEngine as _resetMicroAffirmation } from './micro-affirmations.js';
import { resetParadoxicalInterventionEngine as _resetParadoxicalIntervention } from './paradoxical-intervention.js';
import { resetPredictiveAnticipationEngine as _resetPredictiveAnticipation } from './predictive-anticipation.js';
import { resetProactiveMemoryEngine as _resetProactiveMemory } from './proactive-memory.js';
import { resetQuestionPatternEngine as _resetQuestionPatterns } from './question-patterns.js';
import { resetRelationshipEventsEngine as _resetRelationshipEvents } from './relationship-events.js';
import { resetResponseDynamicsEngine as _resetResponseDynamics } from './response-dynamics.js';
import { resetSessionIntelligence as _resetSessionIntelligence } from './session-intelligence.js';
import { resetSilencePresenceEngine as _resetSilencePresence } from './silence-presence.js';
import { resetSpeechNaturalizer as _resetSpeechNaturalizer } from './speech-naturalizer.js';
import { resetStoryTimingEngine as _resetStoryTiming } from './story-timing.js';
import { resetSubtextDetectionEngine as _resetSubtextDetection } from './subtext-detection.js';
import { resetTemporalContextEngine as _resetTemporalContext } from './temporal-context.js';
import { resetThinkingPhraseCoordinator as _resetThinkingPhraseCoordinator } from './thinking-phrase-coordinator.js';
import { resetTurnTakingMonitor as _resetTurnTaking } from './turn-taking.js';
// Evaluation / heuristics
export { evaluateConversationQuality, } from './eval/index.js';
// Emotional Arc Tracking
export { EmotionalArcTracker, getEmotionalArcTracker, resetEmotionalArcTracker, } from './emotional-arc.js';
// Response Dynamics (length adaptation, topic transitions)
export { getResponseDynamicsEngine, resetResponseDynamicsEngine, ResponseDynamicsEngine, } from './response-dynamics.js';
// Interruption Handling
export { getInterruptionHandler, InterruptionHandler, resetInterruptionHandler, } from './interruption-handler.js';
// Turn-Taking (speaking balance monitoring)
export { getTurnTakingMonitor, resetTurnTakingMonitor, TurnTakingMonitor, } from './turn-taking.js';
// Topic Tracking - Use TopicTracker from intelligence/topic-tracker.js
// (TopicChangeDetector wrapper has been removed - use the canonical tracker directly)
// Story Timing Intelligence
export { getStoryTimingEngine, resetStoryTimingEngine, StoryTimingEngine, } from './story-timing.js';
// Proactive Conversation Starters
export { buildOpenerContext, generateProactiveOpener, generateProactiveOpenerAsync, } from './proactive-starters.js';
// Speech Naturalization (disfluencies, hedging, self-correction)
export { applyRandomImperfection, 
// Enhanced imperfection patterns
DOUBT_TO_CONVICTION, generateCourseCorrection, generateDoubtToConviction, generateFragment, generateGracefulUncertainty, generateSelfInterruption, generateThinkingOutLoud, getSpeechNaturalizer, GRACEFUL_UNCERTAINTY, MID_THOUGHT_CORRECTIONS, resetSpeechNaturalizer, SELF_INTERRUPTIONS, shouldApplyImperfection, SpeechNaturalizer, THINKING_OUT_LOUD, } from './speech-naturalizer.js';
// Active Listening (backchanneling, mirroring, silence handling)
export { ActiveListeningEngine, getActiveListeningEngine, resetActiveListeningEngine, } from './active-listening.js';
// Conversational Memory (callbacks, threading, commitments, topic detection)
export { ConversationalMemoryEngine, getConversationalMemory, resetConversationalMemory, } from './conversational-memory.js';
// Question Patterns (diverse question types for natural conversation)
export { getQuestionPatternEngine, QuestionPatternEngine, resetQuestionPatternEngine, } from './question-patterns.js';
// Humanizer - High-level orchestration of all humanizing features
export { ConversationHumanizer, getConversationHumanizer, resetConversationHumanizer, } from './humanizer.js';
// Thinking Phrase Coordinator - Prevents duplicate "good question" phrases
export { getThinkingPhraseCoordinator, requestThinkingPhrase, resetThinkingPhraseCoordinator, wasPhraseUsedThisTurn, } from './thinking-phrase-coordinator.js';
// Humanizing Configuration - Tuning parameters for all features
export { applyPreset, getEffectiveRate, getHumanizingConfig, getRecommendedPreset, HUMANIZING_PRESETS, resetHumanizingConfig, shouldApplyFeature, updateHumanizingConfig, } from './humanizing-config.js';
// ============================================================================
// NEW: CENTRALIZED HUMANIZATION TUNING
// ============================================================================
// Single source of truth for all humanization probabilities and cooldowns
export { DEFAULT_TUNING, getEffectiveProbability, getPersonaTuning, getTuningValue, shouldFireFeature, TUNING_PRESETS, } from './humanization-tuning.js';
// ============================================================================
// NEW: COMPOSABLE EFFECTS SYSTEM
// ============================================================================
// Clean architecture replacement for procedural humanization
export { 
// Core components
getEffectCoordinator, getEffectTracker, resetEffectCoordinator, resetEffectTracker, resetAllEffectCoordinators, resetAllEffectTrackers, 
// Effect factories
createBreathSoundEffect, createFirstTurnNoticingEffect, createExcitementInterruptionEffect, createSpeechFillerEffect, 
// Registration helpers
registerDefaultEffects, createCoordinatorWithEffects, buildEffectContext, } from './effects/index.js';
// Deep Humanization - Clean architecture module
export { applyDeepHumanization, getMoodTracker, resetDeepHumanization, resetMoodTracker, resetAllDeepHumanization, } from './deep-humanization/index.js';
// Detection utilities - exported from deep humanization for backward compatibility
export { classifyTopicWeight, detectAdviceGiving, detectBreakthrough, detectEvidence, } from './utils/detection.js';
// Note: Humanization tuning already exported above
// Silence as Presence - Intentional meaningful silences
export { getSilencePresenceEngine, resetSilencePresenceEngine, SilencePresenceEngine, } from './silence-presence.js';
// Conversation Rhythm - Match user's communication patterns
export { ConversationRhythmTracker, getConversationRhythmTracker, resetConversationRhythmTracker, } from './conversation-rhythm.js';
// ============================================================================
// NARRATIVE ARC TRACKING
// ============================================================================
export { getNarrativeArcTracker, NarrativeArcTracker, resetAllNarrativeArcTrackers, resetNarrativeArcTracker, } from './narrative-arc.js';
// ============================================================================
// ENGAGEMENT SCORING
// ============================================================================
export { EngagementScorer, getEngagementScorer, resetAllEngagementScorers, resetEngagementScorer, } from './engagement-scoring.js';
// ============================================================================
// SUPERHUMAN CAPABILITIES - "Better Than Human" Features
// ============================================================================
// Unified Concern Detection - Detect distress before explicit mention
export { ConcernDetectionEngine, getConcernDetectionEngine, resetAllConcernDetectionEngines, resetConcernDetectionEngine, } from './concern-detection.js';
// Proactive Memory Surfacing - Surface memories before user mentions them
export { clearProactiveMemoryEngine, getProactiveMemoryEngine, ProactiveMemoryEngine, resetProactiveMemoryEngine, } from './proactive-memory.js';
// Predictive Anticipation - Know what they need before they say it
export { clearPredictiveAnticipationEngine, getPredictiveAnticipationEngine, PredictiveAnticipationEngine, resetPredictiveAnticipationEngine, } from './predictive-anticipation.js';
// Session Intelligence Orchestrator - Real-time within-session intelligence
// (For cross-session relationship features, see superhuman/ module)
export { clearSessionIntelligence, getSessionIntelligence, resetSessionIntelligence, SessionIntelligenceOrchestrator, } from './session-intelligence.js';
// ============================================================================
// CONTENT DELIVERY PACING - Human-like reading of long content
// ============================================================================
export { addSignposting, analyzeContent, applyDeliveryPacing, detectContentType, getSummaryIntro, shouldApplyDeliveryPacing, } from './content-delivery-pacing.js';
// ============================================================================
// VOCAL HUMANIZATION - "Better Than Human" voice processing
// ============================================================================
export { addIntakeBreath, addMidSentenceReactions, addPitchVariation, applyEmotionBleeding, detectEmotionalContent, detectHeavyContent, detectUserEnergy, enforceContractions, generateVocalProfile, humanizeVocals, } from './vocal-humanization.js';
// ============================================================================
// SHARED DETECTION UTILITIES (additional exports not already available above)
// ============================================================================
export { 
// Composite analysis (new)
analyzeMessage, 
// Engagement detection (new)
detectDisengagement, detectEngagementLevel, detectHesitation, detectHighEngagement, 
// Detailed energy detection (new)
detectUserEnergyDetailed, } from './utils/index.js';
// ============================================================================
// ADVANCED HUMANIZATION - Deep Connection Features
// ============================================================================
// Subtext Detection - Read between the lines
export { clearSubtextDetectionEngine, getSubtextDetectionEngine, resetSubtextDetectionEngine, SubtextDetectionEngine, } from './subtext-detection.js';
// Emotional Aftercare - Guide back to equilibrium after heavy moments
export { clearEmotionalAftercareEngine, EmotionalAftercareEngine, getEmotionalAftercareEngine, resetEmotionalAftercareEngine, } from './emotional-aftercare.js';
// Conversational Repair - Recover from miscommunication
export { clearConversationalRepairEngine, ConversationalRepairEngine, getConversationalRepairEngine, resetConversationalRepairEngine, } from './conversational-repair.js';
// Hope Injection - Subtle forward-looking language without toxic positivity
export { clearHopeInjectionEngine, getHopeInjectionEngine, HopeInjectionEngine, resetHopeInjectionEngine, } from './hope-injection.js';
// Curiosity Engine - Genuine interest in user's life story
export { clearCuriosityEngine, CuriosityEngine, getCuriosityEngine, resetCuriosityEngine, } from './curiosity-engine.js';
// Energy Regulation - Lead vs match energy
export { clearEnergyRegulationEngine, EnergyRegulationEngine, getEnergyRegulationEngine, resetEnergyRegulationEngine, } from './energy-regulation.js';
// Micro-Affirmations - Tiny validations throughout conversation
export { clearMicroAffirmationEngine, getMicroAffirmationEngine, MicroAffirmationEngine, resetMicroAffirmationEngine, } from './micro-affirmations.js';
// Temporal Context - Life rhythm awareness (time of day, day of week)
export { clearTemporalContextEngine, getTemporalContextEngine, resetTemporalContextEngine, TemporalContextEngine, } from './temporal-context.js';
// Relationship Events - Track and celebrate relationship milestones
export { clearRelationshipEventsEngine, getRelationshipEventsEngine, RelationshipEventsEngine, resetRelationshipEventsEngine, } from './relationship-events.js';
// Paradoxical Intervention - Know when direct advice backfires
export { clearParadoxicalInterventionEngine, getParadoxicalInterventionEngine, ParadoxicalInterventionEngine, resetParadoxicalInterventionEngine, } from './paradoxical-intervention.js';
// ============================================================================
// EMOTIONAL JOURNEY ORCHESTRATOR
// ============================================================================
// Master orchestrator that coordinates all emotional systems for smiles, laughs, and tears
export { buildEmotionalContext, orchestrateEmotionalJourney, } from './emotional-journey-orchestrator.js';
// ============================================================================
// ADVANCED HUMANIZATION ORCHESTRATOR
// ============================================================================
// Unified orchestrator for all advanced humanization capabilities
export { AdvancedHumanizationOrchestrator, clearAdvancedHumanization, getAdvancedHumanization, resetAdvancedHumanization, } from './advanced-humanization.js';
// Advanced Humanization Voice Agent Integration
export { addSharedMemory as addAdvancedSharedMemory, addSignificantDate as addAdvancedSignificantDate, cleanupAdvancedHumanization, getClosingGuidance as getAdvancedClosingGuidance, getAdvancedHumanizationState, getResponseModifications as getAdvancedResponseModifications, initAdvancedHumanization, processAdvancedTurn, recordAdviceGiven as recordAdvancedAdviceGiven, recordAgentResponse as recordAdvancedAgentResponse, recordMilestone as recordAdvancedMilestone, } from './advanced-humanization-integration.js';
// ============================================================================
// UNIFIED INTEGRATION (RECOMMENDED ENTRY POINT)
// ============================================================================
// Single entry point for all conversation humanization
export { createConversationSession, endConversationSession, getActiveSessions, getConversationSession, quickHumanize, } from './unified-integration.js';
// ============================================================================
// CONVENIENCE: Reset all conversation state
// ============================================================================
/**
 * Reset all conversation tracking for a new session
 */
export function resetAllConversationState(personaId, sessionId, userId) {
    _resetEmotionalArc();
    _resetResponseDynamics();
    _resetInterruption();
    _resetTurnTaking();
    _resetStoryTiming();
    _resetSpeechNaturalizer();
    _resetActiveListening();
    _resetConversationalMemory();
    _resetQuestionPatterns();
    _resetHumanizer();
    _resetSilencePresence();
    _resetConversationRhythm();
    if (personaId) {
        _resetDeepHumanization(personaId);
    }
    // Superhuman capabilities (session-scoped)
    if (sessionId) {
        _resetConcernDetection(sessionId);
        _resetProactiveMemory(sessionId);
        _resetPredictiveAnticipation(sessionId);
        _resetSessionIntelligence(sessionId);
        // Advanced humanization (session-scoped)
        _resetSubtextDetection(sessionId);
        _resetEmotionalAftercare(sessionId);
        _resetConversationalRepair(sessionId);
        _resetHopeInjection(sessionId);
        _resetEnergyRegulation(sessionId);
        _resetMicroAffirmation(sessionId);
        _resetParadoxicalIntervention(sessionId);
    }
    // User-scoped engines (persist across sessions)
    if (userId) {
        _resetCuriosity(userId);
        _resetTemporalContext(userId);
        _resetRelationshipEvents(userId);
    }
    // Advanced humanization orchestrator
    if (sessionId && userId) {
        _resetAdvancedHumanization(sessionId, userId);
    }
    // Reset thinking phrase coordinator (global singleton)
    _resetThinkingPhraseCoordinator();
}
// ============================================================================
// UNIFIED ORCHESTRATOR
// ============================================================================
export { 
// Performance optimizations
CircuitBreaker, 
// Debug & Monitoring
clearABTests, clearDetectionCache, clearSessionRecords, 
// Orchestrator
ConversationOrchestrator, createABTest, 
// Humanizer integration (drop-in replacement)
createHumanizer, createOrchestratedHumanizer, createProfiler, DEFAULT_ORCHESTRATOR_CONFIG, endABTest, exportSession, getABTestStats, getABTestVariant, 
// Metrics
getAggregatedMetrics, getCircuitBreaker, getCircuitBreakerStatus, 
// Config adapter (unified feature toggles)
getConfigAdapter, getConversationOrchestrator, getDebugSnapshot, getHealthStatus, getMetricsCollector, getOrchestratedHumanizer, getOrComputeDetection, getPerformanceStats, getSessionRecords, getSystemHealth, logDebugSummary, logFeatureStats, logMetricsSummary, logSlowOrchestration, LRUCache, orchestratorConfig, orchestratorDebug, profileOrchestration, recordOrchestration, resetAllCircuitBreakers, resetAllMetrics, resetAllOrchestratedHumanizers, resetAllOrchestrators, resetConfigAdapter, resetConversationOrchestrator, resetMetrics, resetOrchestratedHumanizer, resetPerformanceOptimizations, withTimeout, } from './orchestrator/index.js';
//# sourceMappingURL=index.js.map