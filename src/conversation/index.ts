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
 */

// Import reset functions for local use
import { resetActiveListeningEngine as _resetActiveListening } from './active-listening.js';
import { resetConversationRhythmTracker as _resetConversationRhythm } from './conversation-rhythm.js';
import { resetConversationalMemory as _resetConversationalMemory } from './conversational-memory.js';
import { resetDeepHumanizationEngine as _resetDeepHumanization } from './deep-humanization.js';
import { resetEmotionalArcTracker as _resetEmotionalArc } from './emotional-arc.js';
import { resetConversationHumanizer as _resetHumanizer } from './humanizer.js';
import { resetInterruptionHandler as _resetInterruption } from './interruption-handler.js';
import { resetQuestionPatternEngine as _resetQuestionPatterns } from './question-patterns.js';
import { resetResponseDynamicsEngine as _resetResponseDynamics } from './response-dynamics.js';
import { resetSilencePresenceEngine as _resetSilencePresence } from './silence-presence.js';
import { resetSpeechNaturalizer as _resetSpeechNaturalizer } from './speech-naturalizer.js';
import { resetStoryTimingEngine as _resetStoryTiming } from './story-timing.js';
import { resetTurnTakingMonitor as _resetTurnTaking } from './turn-taking.js';

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
// CONVENIENCE: Reset all conversation state
// ============================================================================

/**
 * Reset all conversation tracking for a new session
 */
export function resetAllConversationState(personaId?: string): void {
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
}
