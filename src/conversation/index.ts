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
import { resetDeepHumanizationEngine as _resetDeepHumanization } from './deep-humanization.js';
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
export {
  evaluateConversationQuality,
  type ConversationQualityInput,
  type ConversationQualityScore,
} from './eval/index.js';

// Emotional Arc Tracking
export {
  EmotionalArcTracker,
  getEmotionalArcTracker,
  resetEmotionalArcTracker,
  type CrossSessionArcSummary,
  type EmotionalArc,
  type EmotionalResponse,
  type EmotionalSnapshot,
  type NarrativePhase,
} from './emotional-arc.js';

// Response Dynamics (length adaptation, topic transitions)
export {
  getResponseDynamicsEngine,
  resetResponseDynamicsEngine,
  ResponseDynamicsEngine,
  type PacingAnalysis,
  type ResponseLengthRecommendation,
  type TopicTransition,
  type UserEngagementMetrics,
} from './response-dynamics.js';

// Interruption Handling
export {
  getInterruptionHandler,
  InterruptionHandler,
  resetInterruptionHandler,
  type InterruptionEvent,
} from './interruption-handler.js';

// Turn-Taking (speaking balance monitoring)
export {
  getTurnTakingMonitor,
  resetTurnTakingMonitor,
  TurnTakingMonitor,
  type TurnRecord,
  type TurnTakingStats,
} from './turn-taking.js';

// Topic Tracking - Use TopicTracker from intelligence/topic-tracker.js
// (TopicChangeDetector wrapper has been removed - use the canonical tracker directly)

// Story Timing Intelligence
export {
  getStoryTimingEngine,
  resetStoryTimingEngine,
  StoryTimingEngine,
  type StoryMetrics,
  type StoryRecommendation,
  type StoryTimingContext,
} from './story-timing.js';

// Proactive Conversation Starters
export {
  buildOpenerContext,
  generateProactiveOpener,
  type ConversationOpener,
  type OpenerContext,
  type OpenerType,
} from './proactive-starters.js';

// Speech Naturalization (disfluencies, hedging, self-correction)
export {
  applyRandomImperfection,
  // Enhanced imperfection patterns
  DOUBT_TO_CONVICTION,
  generateCourseCorrection,
  generateDoubtToConviction,
  generateFragment,
  generateGracefulUncertainty,
  generateSelfInterruption,
  generateThinkingOutLoud,
  getSpeechNaturalizer,
  GRACEFUL_UNCERTAINTY,
  MID_THOUGHT_CORRECTIONS,
  resetSpeechNaturalizer,
  SELF_INTERRUPTIONS,
  shouldApplyImperfection,
  SpeechNaturalizer,
  THINKING_OUT_LOUD,
  type DisfluencyConfig,
  type NaturalizationContext,
  type ThinkingPattern,
} from './speech-naturalizer.js';

// Active Listening (backchanneling, mirroring, silence handling)
export {
  ActiveListeningEngine,
  getActiveListeningEngine,
  resetActiveListeningEngine,
  type Backchannel,
  type BackchannelContext,
  type ClarifyingQuestion,
  type MirroredPhrase,
} from './active-listening.js';

// Conversational Memory (callbacks, threading, commitments, topic detection)
export {
  ConversationalMemoryEngine,
  getConversationalMemory,
  resetConversationalMemory,
  type ConversationCommitment,
  type ConversationThread,
  type MemoryCallback,
  type QuotedMemory,
  type TopicChange,
  type UserStatement,
} from './conversational-memory.js';

// Question Patterns (diverse question types for natural conversation)
export {
  getQuestionPatternEngine,
  QuestionPatternEngine,
  resetQuestionPatternEngine,
  type Question,
  type QuestionContext,
  type QuestionType,
} from './question-patterns.js';

// Humanizer - High-level orchestration of all humanizing features
export {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  type ContextGuidance,
  type HumanizationContext,
  type HumanizedResponse,
  type PreResponseActions,
} from './humanizer.js';

// Thinking Phrase Coordinator - Prevents duplicate "good question" phrases
export {
  getThinkingPhraseCoordinator,
  requestThinkingPhrase,
  resetThinkingPhraseCoordinator,
  wasPhraseUsedThisTurn,
  type ThinkingPhraseRequest,
  type ThinkingPhraseResult,
  type ThinkingPhraseSource,
} from './thinking-phrase-coordinator.js';

// Humanizing Configuration - Tuning parameters for all features
export {
  applyPreset,
  getEffectiveRate,
  getHumanizingConfig,
  getRecommendedPreset,
  HUMANIZING_PRESETS,
  resetHumanizingConfig,
  shouldApplyFeature,
  updateHumanizingConfig,
  type HumanizingConfig,
} from './humanizing-config.js';

// Deep Humanization - Advanced personality features
export {
  classifyTopicWeight,
  DeepHumanizationEngine,
  detectAdviceGiving,
  detectBreakthrough,
  detectEvidence,
  getDeepHumanizationEngine,
  resetDeepHumanizationEngine,
  type ConversationMood,
  type HumanizationContext as DeepHumanizationContext,
  type HumanizationInjection,
  type HumanizationType,
  type SessionMemory,
} from './deep-humanization.js';

// Silence as Presence - Intentional meaningful silences
export {
  getSilencePresenceEngine,
  resetSilencePresenceEngine,
  SilencePresenceEngine,
  type SilenceConfig,
  type SilenceDecision,
  type SilenceReason,
} from './silence-presence.js';

// Conversation Rhythm - Match user's communication patterns
export {
  ConversationRhythmTracker,
  getConversationRhythmTracker,
  resetConversationRhythmTracker,
  type EnergyTrend,
  type PausePattern,
  type RhythmGuidance,
  type RhythmSnapshot,
  type UserPacing,
} from './conversation-rhythm.js';

// ============================================================================
// NARRATIVE ARC TRACKING
// ============================================================================

export {
  getNarrativeArcTracker,
  NarrativeArcTracker,
  resetAllNarrativeArcTrackers,
  resetNarrativeArcTracker,
  type InterventionType,
  type NarrativeArcResult,
  type NarrativeContext,
  type NarrativePoint,
  type NarrativeStructure,
} from './narrative-arc.js';

// ============================================================================
// ENGAGEMENT SCORING
// ============================================================================

export {
  EngagementScorer,
  getEngagementScorer,
  resetAllEngagementScorers,
  resetEngagementScorer,
  type EngagementAction,
  type EngagementLevel,
  type EngagementObservation,
  type EngagementScoringResult,
  type EngagementSignals,
} from './engagement-scoring.js';

// ============================================================================
// SUPERHUMAN CAPABILITIES - "Better Than Human" Features
// ============================================================================

// Unified Concern Detection - Detect distress before explicit mention
export {
  ConcernDetectionEngine,
  getConcernDetectionEngine,
  resetAllConcernDetectionEngines,
  resetConcernDetectionEngine,
  type BreathingSignals,
  type ConcernApproach,
  type ConcernLevel,
  type ConcernSignal,
  type ConcernState,
  type ConcernType,
  type ProsodySignals,
  type TemporalContext,
} from './concern-detection.js';

// Proactive Memory Surfacing - Surface memories before user mentions them
export {
  clearProactiveMemoryEngine,
  getProactiveMemoryEngine,
  ProactiveMemoryEngine,
  resetProactiveMemoryEngine,
  type MemoryType,
  type PatternDetection,
  type ProactiveMemorySuggestion,
  type StoredMemory,
} from './proactive-memory.js';

// Predictive Anticipation - Know what they need before they say it
export {
  clearPredictiveAnticipationEngine,
  getPredictiveAnticipationEngine,
  PredictiveAnticipationEngine,
  resetPredictiveAnticipationEngine,
  type EmotionalHistoryEntry,
  type EmotionalPrediction,
  type EmotionalTrajectory,
  type NeedPrediction,
  type PredictedNeed,
  type PredictionResult,
  type ProsodyInput,
  type TopicSequencePrediction,
  type UserBaseline,
  type VoiceStatePrediction,
} from './predictive-anticipation.js';

// Session Intelligence Orchestrator - Real-time within-session intelligence
// (For cross-session relationship features, see superhuman/ module)
export {
  clearSessionIntelligence,
  getSessionIntelligence,
  resetSessionIntelligence,
  SessionIntelligenceOrchestrator,
  type ResponseGuidance,
  type ResponseModification,
  type SessionIntelligenceContext,
  type SessionIntelligenceInsight,
} from './session-intelligence.js';

// ============================================================================
// CONTENT DELIVERY PACING - Human-like reading of long content
// ============================================================================

export {
  addSignposting,
  analyzeContent,
  applyDeliveryPacing,
  detectContentType,
  getSummaryIntro,
  shouldApplyDeliveryPacing,
  type ContentAnalysis,
  type ContentSegment,
  type ContentType,
  type DeliveryOptions,
  type SegmentPacing,
} from './content-delivery-pacing.js';

// ============================================================================
// VOCAL HUMANIZATION - "Better Than Human" voice processing
// ============================================================================

export {
  addIntakeBreath,
  addMidSentenceReactions,
  addPitchVariation,
  applyEmotionBleeding,
  detectEmotionalContent,
  detectHeavyContent,
  detectUserEnergy,
  enforceContractions,
  generateVocalProfile,
  humanizeVocals,
  type EnergyLevel,
  type HumanizedVocals,
  type VocalContext,
  type VocalProfile,
} from './vocal-humanization.js';

// ============================================================================
// SHARED DETECTION UTILITIES (additional exports not already available above)
// ============================================================================

export {
  // Composite analysis (new)
  analyzeMessage,
  // Engagement detection (new)
  detectDisengagement,
  detectEngagementLevel,
  detectHesitation,
  detectHighEngagement,
  // Detailed energy detection (new)
  detectUserEnergyDetailed,
  type EngagementLevel as DetectedEngagementLevel,
  type DetectionResult,
  type MessageAnalysis,
  // Types (new - renamed to avoid conflict with engagement-scoring.ts)
  type TopicWeight,
} from './utils/index.js';

// ============================================================================
// ADVANCED HUMANIZATION - Deep Connection Features
// ============================================================================

// Subtext Detection - Read between the lines
export {
  clearSubtextDetectionEngine,
  getSubtextDetectionEngine,
  resetSubtextDetectionEngine,
  SubtextDetectionEngine,
  type SubtextContext,
  type SubtextDetection,
  type SubtextType,
} from './subtext-detection.js';

// Emotional Aftercare - Guide back to equilibrium after heavy moments
export {
  clearEmotionalAftercareEngine,
  EmotionalAftercareEngine,
  getEmotionalAftercareEngine,
  resetEmotionalAftercareEngine,
  type AftercareGuidance,
  type AftercarePhase,
  type AftercarePriority,
  type AftercareState,
  type EmotionalEvent,
  type EmotionalIntensity,
} from './emotional-aftercare.js';

// Conversational Repair - Recover from miscommunication
export {
  clearConversationalRepairEngine,
  ConversationalRepairEngine,
  getConversationalRepairEngine,
  resetConversationalRepairEngine,
  type MiscueSignal,
  type MiscueType,
  type RepairDecision,
  type RepairStrategy,
} from './conversational-repair.js';

// Hope Injection - Subtle forward-looking language without toxic positivity
export {
  clearHopeInjectionEngine,
  getHopeInjectionEngine,
  HopeInjectionEngine,
  resetHopeInjectionEngine,
  type FutureAnchor,
  type HopeContext,
  type HopeGuidance,
  type HopeInjection,
  type HopeType,
} from './hope-injection.js';

// Curiosity Engine - Genuine interest in user's life story
export {
  clearCuriosityEngine,
  CuriosityEngine,
  getCuriosityEngine,
  resetCuriosityEngine,
  type CuriosityPrompt,
  type CuriosityState,
  type ConversationThread as CuriosityThread,
  type LifeDetail,
} from './curiosity-engine.js';

// Energy Regulation - Lead vs match energy
export {
  clearEnergyRegulationEngine,
  EnergyRegulationEngine,
  getEnergyRegulationEngine,
  resetEnergyRegulationEngine,
  type EnergyGuidance,
  type EnergyHistory,
  type EnergyLevel as EnergyRegulationLevel,
  type EnergyState,
  type EnergyValence,
  type RegulationDecision,
  type RegulationStrategy,
} from './energy-regulation.js';

// Micro-Affirmations - Tiny validations throughout conversation
export {
  clearMicroAffirmationEngine,
  getMicroAffirmationEngine,
  MicroAffirmationEngine,
  resetMicroAffirmationEngine,
  type AffirmationContext,
  type AffirmationDecision,
  type AffirmationDensityConfig,
  type AffirmationType,
  type MicroAffirmation,
} from './micro-affirmations.js';

// Temporal Context - Life rhythm awareness (time of day, day of week)
export {
  clearTemporalContextEngine,
  getTemporalContextEngine,
  resetTemporalContextEngine,
  TemporalContextEngine,
  type DayType,
  type TemporalGuidance,
  type TemporalMood,
  type TemporalState,
  type TimeOfDay,
  type UpcomingEvent,
} from './temporal-context.js';

// Relationship Events - Track and celebrate relationship milestones
export {
  clearRelationshipEventsEngine,
  getRelationshipEventsEngine,
  RelationshipEventsEngine,
  resetRelationshipEventsEngine,
  type MilestoneOpportunity,
  type MilestoneType,
  type RelationshipMilestone,
  type RelationshipState,
  type SharedMemory,
} from './relationship-events.js';

// Paradoxical Intervention - Know when direct advice backfires
export {
  clearParadoxicalInterventionEngine,
  getParadoxicalInterventionEngine,
  ParadoxicalInterventionEngine,
  resetParadoxicalInterventionEngine,
  type AdviceHistory,
  type InterventionDecision,
  type InterventionType as ParadoxicalInterventionType,
  type ResistanceDetection,
  type ResistanceType,
} from './paradoxical-intervention.js';

// ============================================================================
// EMOTIONAL JOURNEY ORCHESTRATOR
// ============================================================================

// Master orchestrator that coordinates all emotional systems for smiles, laughs, and tears
export {
  buildEmotionalContext,
  orchestrateEmotionalJourney,
  type EmotionalContext,
  type EmotionalMomentType,
  type JourneyDecision,
  type JourneyPhase,
} from './emotional-journey-orchestrator.js';

// ============================================================================
// ADVANCED HUMANIZATION ORCHESTRATOR
// ============================================================================

// Unified orchestrator for all advanced humanization capabilities
export {
  AdvancedHumanizationOrchestrator,
  clearAdvancedHumanization,
  getAdvancedHumanization,
  resetAdvancedHumanization,
  type AdvancedHumanizationContext,
  type AdvancedHumanizationResult,
  type SessionStartResult,
} from './advanced-humanization.js';

// Advanced Humanization Voice Agent Integration
export {
  addSharedMemory as addAdvancedSharedMemory,
  addSignificantDate as addAdvancedSignificantDate,
  cleanupAdvancedHumanization,
  getClosingGuidance as getAdvancedClosingGuidance,
  getAdvancedHumanizationState,
  getResponseModifications as getAdvancedResponseModifications,
  initAdvancedHumanization,
  processAdvancedTurn,
  recordAdviceGiven as recordAdvancedAdviceGiven,
  recordAgentResponse as recordAdvancedAgentResponse,
  recordMilestone as recordAdvancedMilestone,
  type AdvancedHumanizationSessionConfig,
  type ResponseModification as AdvancedResponseModification,
  type TurnGuidance,
} from './advanced-humanization-integration.js';

// ============================================================================
// UNIFIED INTEGRATION (RECOMMENDED ENTRY POINT)
// ============================================================================

// Single entry point for all conversation humanization
export {
  createConversationSession,
  endConversationSession,
  getActiveSessions,
  getConversationSession,
  quickHumanize,
  type ConversationSession,
  type ConversationSessionConfig,
  type TurnInput,
  type TurnResult,
} from './unified-integration.js';

// ============================================================================
// CONVENIENCE: Reset all conversation state
// ============================================================================

/**
 * Reset all conversation tracking for a new session
 */
export function resetAllConversationState(
  personaId?: string,
  sessionId?: string,
  userId?: string
): void {
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
  clearABTests,
  clearDetectionCache,
  clearSessionRecords,
  // Orchestrator
  ConversationOrchestrator,
  createABTest,
  // Humanizer integration (drop-in replacement)
  createHumanizer,
  createOrchestratedHumanizer,
  createProfiler,
  DEFAULT_ORCHESTRATOR_CONFIG,
  endABTest,
  exportSession,
  getABTestStats,
  getABTestVariant,
  // Metrics
  getAggregatedMetrics,
  getCircuitBreaker,
  getCircuitBreakerStatus,
  // Config adapter (unified feature toggles)
  getConfigAdapter,
  getConversationOrchestrator,
  getDebugSnapshot,
  getHealthStatus,
  getMetricsCollector,
  getOrchestratedHumanizer,
  getOrComputeDetection,
  getPerformanceStats,
  getSessionRecords,
  getSystemHealth,
  logDebugSummary,
  logFeatureStats,
  logMetricsSummary,
  logSlowOrchestration,
  LRUCache,
  orchestratorConfig,
  orchestratorDebug,
  profileOrchestration,
  recordOrchestration,
  resetAllCircuitBreakers,
  resetAllMetrics,
  resetAllOrchestratedHumanizers,
  resetAllOrchestrators,
  resetConfigAdapter,
  resetConversationOrchestrator,
  resetMetrics,
  resetOrchestratedHumanizer,
  resetPerformanceOptimizations,
  withTimeout,
  // Types
  type ABTestConfig,
  type AnalysisContext,
  type AnalysisPhaseResult,
  type AppliedFeature,
  type CircuitBreakerConfig,
  type CircuitState,
  type DebugSnapshot,
  type DetectedSignals,
  type ExtendedHumanizationContext,
  type ExtendedHumanizedResponse,
  type FeatureMetrics,
  type HealthIndicators,
  type HumanizationPhaseResult,
  type IntelligenceGuidance,
  type IntelligencePhaseResult,
  type MetricsCollector,
  type MetricsSnapshot,
  type OrchestratedHumanizer,
  type OrchestrationRecord,
  type OrchestratorConfig,
  type OrchestratorConfigAdapter,
  type OrchestratorInput,
  type OrchestratorMetrics,
  type OrchestratorOutput,
  type OutputMetadata,
  type PhaseMetrics,
  type PriorityAction,
  type ResponseAdditions,
  type SkippedFeature,
  type UnifiedFeatureState,
  type UnifiedPreset,
} from './orchestrator/index.js';
