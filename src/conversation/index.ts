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
 *   cleanupConversationSession,
 * } from './agents/integrations/conversation-session-integration.js';
 *
 * // At session start
 * initConversationSession({ sessionId, userId, personaId, ... });
 *
 * // At session end
 * cleanupConversationSession(sessionId);
 * ```
 *
 * @see unified-integration.ts for the session lifecycle
 */

// Import reset functions for local use
import { resetActiveListeningEngine as _resetActiveListening } from './active-listening.js';
import { resetConversationRhythmTracker as _resetConversationRhythm } from './conversation-rhythm.js';
import { resetConversationalMemory as _resetConversationalMemory } from './conversational-memory/index.js';
import { resetEmotionalArcTracker as _resetEmotionalArc } from './emotional-arc.js';
import { resetConversationHumanizer as _resetHumanizer } from './humanizer/index.js';
import { resetInterruptionHandler as _resetInterruption } from './interruption-handler.js';
import { resetQuestionPatternEngine as _resetQuestionPatterns } from './question-patterns/index.js';
import { resetResponseDynamicsEngine as _resetResponseDynamics } from './response-dynamics.js';
import { resetSilencePresenceEngine as _resetSilencePresence } from './silence-presence.js';
import { resetStoryTimingEngine as _resetStoryTiming } from './story-timing.js';
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
  generateProactiveOpenerAsync,
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
  GRACEFUL_UNCERTAINTY,
  MID_THOUGHT_CORRECTIONS,
  SELF_INTERRUPTIONS,
  shouldApplyImperfection,
  SpeechNaturalizer,
  THINKING_OUT_LOUD,
  type DisfluencyConfig,
  type NaturalizationContext,
  type ThinkingPattern,
} from './speech-naturalizer/index.js';

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
} from './conversational-memory/index.js';

// Question Patterns (diverse question types for natural conversation)
export {
  getQuestionPatternEngine,
  QuestionPatternEngine,
  resetQuestionPatternEngine,
  type Question,
  type QuestionContext,
  type QuestionType,
} from './question-patterns/index.js';

// Humanizer - High-level orchestration of all humanizing features
export {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  type ContextGuidance,
  type HumanizationContext,
  type PreResponseActions,
} from './humanizer/index.js';

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

// Detection utilities
export { classifyTopicWeight, detectAdviceGiving } from './utils/detection.js';

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
} from './predictive-anticipation/index.js';

// ============================================================================
// SHARED DETECTION UTILITIES (additional exports not already available above)
// ============================================================================

export {
  // Engagement detection (new)
  detectDisengagement,
  detectEngagementLevel,
  detectHighEngagement,
  // Detailed energy detection (new)
  detectUserEnergyDetailed,
  type EngagementLevel as DetectedEngagementLevel,
  type DetectionResult,
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
} from './temporal-context/index.js';

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
  type ConversationSession,
  type ConversationSessionConfig,
} from './unified-integration.js';

// ============================================================================
// CONVENIENCE: Reset all conversation state
// ============================================================================

/**
 * Reset all conversation tracking for a new session
 *
 * Only process-wide singletons are reset here. Session- and user-keyed engines
 * register with the global session registry, which the voice agent's cleanup
 * handler clears per session when the call ends.
 */
export function resetAllConversationState(): void {
  _resetEmotionalArc();
  _resetResponseDynamics();
  _resetInterruption();
  _resetTurnTaking();
  _resetStoryTiming();
  _resetActiveListening();
  _resetConversationalMemory();
  _resetQuestionPatterns();
  _resetHumanizer();
  _resetSilencePresence();
  _resetConversationRhythm();
  // Reset thinking phrase coordinator (global singleton)
  _resetThinkingPhraseCoordinator();
}
