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
import { resetEmotionalArcTracker as _resetEmotionalArc } from './emotional-arc.js';
import { resetResponseDynamicsEngine as _resetResponseDynamics } from './response-dynamics.js';
import { resetInterruptionHandler as _resetInterruption } from './interruption-handler.js';
import { resetTurnTakingMonitor as _resetTurnTaking } from './turn-taking.js';
import { resetTopicChangeDetector as _resetTopicChange } from './topic-change-detector.js';
import { resetStoryTimingEngine as _resetStoryTiming } from './story-timing.js';
import { resetSpeechNaturalizer as _resetSpeechNaturalizer } from './speech-naturalizer.js';
import { resetActiveListeningEngine as _resetActiveListening } from './active-listening.js';
import { resetConversationalMemory as _resetConversationalMemory } from './conversational-memory.js';
import { resetQuestionPatternEngine as _resetQuestionPatterns } from './question-patterns.js';
import { resetConversationHumanizer as _resetHumanizer } from './humanizer.js';

// Emotional Arc Tracking
export {
  EmotionalArcTracker,
  getEmotionalArcTracker,
  resetEmotionalArcTracker,
  type EmotionalArc,
  type EmotionalSnapshot,
  type EmotionalResponse,
} from './emotional-arc.js';

// Response Dynamics (length adaptation, topic transitions)
export {
  ResponseDynamicsEngine,
  getResponseDynamicsEngine,
  resetResponseDynamicsEngine,
  type ResponseLengthRecommendation,
  type TopicTransition,
  type PacingAnalysis,
  type UserEngagementMetrics,
} from './response-dynamics.js';

// Interruption Handling
export {
  InterruptionHandler,
  getInterruptionHandler,
  resetInterruptionHandler,
  type InterruptionEvent,
} from './interruption-handler.js';

// Turn-Taking (speaking balance monitoring)
export {
  TurnTakingMonitor,
  getTurnTakingMonitor,
  resetTurnTakingMonitor,
  type TurnRecord,
  type TurnTakingStats,
} from './turn-taking.js';

// Topic Change Detection
export {
  TopicChangeDetector,
  getTopicChangeDetector,
  resetTopicChangeDetector,
  type TopicChangeResult,
  type TopicRecord,
} from './topic-change-detector.js';

// Story Timing Intelligence
export {
  StoryTimingEngine,
  getStoryTimingEngine,
  resetStoryTimingEngine,
  type StoryTimingContext,
  type StoryRecommendation,
  type StoryMetrics,
} from './story-timing.js';

// Proactive Conversation Starters
export {
  generateProactiveOpener,
  buildOpenerContext,
  type ConversationOpener,
  type OpenerType,
  type OpenerContext,
} from './proactive-starters.js';

// Speech Naturalization (disfluencies, hedging, self-correction)
export {
  SpeechNaturalizer,
  getSpeechNaturalizer,
  resetSpeechNaturalizer,
  generateFragment,
  type DisfluencyConfig,
  type NaturalizationContext,
  type ThinkingPattern,
} from './speech-naturalizer.js';

// Active Listening (backchanneling, mirroring, silence handling)
export {
  ActiveListeningEngine,
  getActiveListeningEngine,
  resetActiveListeningEngine,
  type BackchannelContext,
  type Backchannel,
  type MirroredPhrase,
  type ClarifyingQuestion,
} from './active-listening.js';

// Conversational Memory (callbacks, threading, commitments, topic detection)
export {
  ConversationalMemoryEngine,
  getConversationalMemory,
  resetConversationalMemory,
  type ConversationThread,
  type UserStatement,
  type MemoryCallback,
  type ConversationCommitment,
  type TopicChange,
} from './conversational-memory.js';

// Question Patterns (diverse question types for natural conversation)
export {
  QuestionPatternEngine,
  getQuestionPatternEngine,
  resetQuestionPatternEngine,
  type QuestionType,
  type Question,
  type QuestionContext,
} from './question-patterns.js';

// Humanizer - High-level orchestration of all humanizing features
export {
  ConversationHumanizer,
  getConversationHumanizer,
  resetConversationHumanizer,
  type HumanizationContext,
  type HumanizedResponse,
  type PreResponseActions,
  type ContextGuidance,
} from './humanizer.js';

// Humanizing Configuration - Tuning parameters for all features
export {
  getHumanizingConfig,
  updateHumanizingConfig,
  resetHumanizingConfig,
  getEffectiveRate,
  shouldApplyFeature,
  applyPreset,
  getRecommendedPreset,
  HUMANIZING_PRESETS,
  type HumanizingConfig,
} from './humanizing-config.js';

// ============================================================================
// CONVENIENCE: Reset all conversation state
// ============================================================================

/**
 * Reset all conversation tracking for a new session
 */
export function resetAllConversationState(): void {
  _resetEmotionalArc();
  _resetResponseDynamics();
  _resetInterruption();
  _resetTurnTaking();
  _resetTopicChange();
  _resetStoryTiming();
  _resetSpeechNaturalizer();
  _resetActiveListening();
  _resetConversationalMemory();
  _resetQuestionPatterns();
  _resetHumanizer();
}
