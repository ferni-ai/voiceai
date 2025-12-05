/**
 * Intelligence Module
 *
 * Provides conversational intelligence capabilities:
 * - Emotion detection
 * - Intent classification
 * - Topic tracking
 * - Conversation state management
 */

// Emotion Detection
export {
  EmotionDetector,
  getEmotionDetector,
  detectEmotion,
  type PrimaryEmotion,
  type Valence,
  type EmotionResult,
} from './emotion-detector.js';

// Intent Classification
export {
  IntentClassifier,
  getIntentClassifier,
  classifyIntent,
  type Intent,
  type IntentResult,
} from './intent-classifier.js';

// Topic Tracking
export {
  TopicTracker,
  getTopicTracker,
  extractTopics,
  type TopicCategory,
  type Topic,
  type TopicExtractionResult,
} from './topic-tracker.js';

// Conversation State
export {
  ConversationStateMachine,
  getStateMachine,
  resetStateMachine,
  type ConversationPhase,
  type ConversationState,
  type PhaseGuidance,
} from './conversation-state.js';

// Human-Like Behaviors
export {
  HumanBehaviors,
  detectCulturalMoment,
  detectUserEngagement,
  getRunningJokeCallback,
  getSpontaneousThought,
  inferUserPreferences,
  getPreferenceGuidance,
  getVoiceProsodyResponse,
  shouldInjectBackchannel,
  verifyTopicThreading,
  getProactiveGoalReference,
} from './human-behaviors.js';

// Conversation Quality & Advanced Features
export {
  ConversationQuality,
  generateFarewellSummary,
  extractSmallDetails,
  getDetailCallback,
  extractFollowUps,
  getFollowUpSuggestion,
  getPersonaPhysicalState,
  getPhysicalStateInterjection,
  calculatePacingScore,
  createSessionRecoveryState,
  shouldAttemptRecovery,
  getGracefulErrorResponse,
  type FarewellSummary,
  type SmallDetail,
  type FollowUpItem,
  type PersonaPhysicalState,
  type ConversationPacingScore,
  type SessionRecoveryState,
  type GracefulError,
} from './conversation-quality.js';

// User Learning Engine - Makes Jack smarter over time
export {
  UserLearningEngine,
  getLearningEngine,
  resetLearningEngine,
  type LearningInsight,
  type ConversationLearningData,
  type DynamicUserContext,
} from './user-learning-engine.js';

// Response Quality Tracker - Learn what responses work
export {
  ResponseQualityTracker,
  getResponseQualityTracker,
  removeResponseQualityTracker,
  type ResponseType,
  type UserReaction,
  type ResponseSignal,
  type LearnedResponsePreferences,
  type UserResponseQuality,
} from './response-quality-tracker.js';

// Conversation Pattern Analyzer - Learn user habits
export {
  ConversationPatternAnalyzer,
  getConversationPatternAnalyzer,
  removeConversationPatternAnalyzer,
  type TimeOfDay,
  type DayOfWeek,
  type DurationBucket,
  type OpeningStyle,
  type ConversationSession,
  type LearnedConversationPatterns,
  type ConversationPrediction,
} from './conversation-pattern-analyzer.js';

// Proactive Insight Engine - Generate suggestions
export {
  ProactiveInsightEngine,
  getProactiveInsightEngine,
  removeProactiveInsightEngine,
  type InsightType,
  type InsightPriority,
  type ProactiveInsight,
  type InsightGenerationResult,
} from './proactive-insight-engine.js';

// Financial Journey Tracker - Track long-term progress
export {
  FinancialJourneyTracker,
  getFinancialJourneyTracker,
  removeFinancialJourneyTracker,
  type FinancialSnapshot,
  type JourneyMilestone,
  type ProgressTrend,
  type FinancialJourney,
} from './financial-journey-tracker.js';

// Cross-Session Threader - Continue topics across sessions
export {
  CrossSessionThreader,
  getCrossSessionThreader,
  removeCrossSessionThreader,
  type ThreadOpenReason,
  type ThreadPriority,
  type OpenThread,
  type PromisedFollowUp,
  type SessionEndContext,
} from './cross-session-threader.js';

// Voice Pace Adapter - Match user's rhythm
export {
  VoicePaceAdapter,
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  type PaceCategory,
  type EnergyLevel,
  type ConversationTempo,
  type PaceObservation,
  type LearnedPacePreferences,
  type CurrentPaceState,
} from './voice-pace-adapter.js';

// ============================================================================
// COLLECTIVE LEARNING SYSTEM
// ============================================================================

// Community Insights - Learn from all users
export {
  CommunityInsightsEngine,
  getCommunityInsights,
  resetCommunityInsights,
  type ResponseStrategySignal,
  type CommunityResponsePattern,
  type JourneyTransition,
  type CommunityJourneyPattern,
  type EffectiveQuestion,
  type StoryResonance,
  type PhraseEffectiveness,
} from './community-insights.js';

// Agent Evolution - Self-improvement from learnings
export {
  AgentEvolutionEngine,
  getAgentEvolution,
  resetAgentEvolution,
  type PersonaAdjustment,
  type PersonaExperiment,
  type EmergentPattern,
  type StoryRanking,
  type PersonaEvolutionState,
} from './agent-evolution.js';

// ============================================================================
// CONTEXT BUILDERS - Modular conversation intelligence injection
// ============================================================================

export {
  buildConversationContext,
  formatContextForPrompt,
  registerContextBuilder,
  getRegisteredBuilders,
  createInjection,
  createCriticalInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
  type ContextBuilder,
  type ContextUserData,
} from './context-builders/index.js';

// ============================================================================
// HUMAN-LEVEL INTERACTION FEATURES
// ============================================================================

// Humor Calibration - Learn what jokes land
export {
  HumorCalibrationEngine,
  getHumorCalibration,
  removeHumorCalibration,
  resetAllHumorCalibration,
  type HumorType,
  type HumorReaction,
  type HumorAttempt,
  type HumorPreferences,
  type HumorGuidance,
} from './humor-calibration.js';

// Story Preference - Track what resonates
export {
  StoryPreferenceEngine,
  getStoryPreference,
  removeStoryPreference,
  type StoryType,
  type StoryLength,
  type EmotionalDepth,
  type StoryAttempt,
  type UserEngagement as StoryUserEngagement,
  type StoryPreferences,
  type StoryGuidance,
} from './story-preference.js';

// Communication Style Mirroring - Match their language
export {
  CommunicationMirroringEngine,
  getCommunicationMirroring,
  removeCommunicationMirroring,
  type FormalityLevel,
  type EnergyLevel as MirroringEnergyLevel,
  type VocabularyLevel,
  type CommunicationStyle,
  type StyleGuidance,
} from './communication-mirroring.js';

// Emotional Memory - Cross-session emotional continuity
export {
  EmotionalMemoryEngine,
  getEmotionalMemory,
  removeEmotionalMemory,
  type EmotionalMoment,
  type EmotionalPattern,
  type EmotionalCheckIn,
  type EmotionalContext,
} from './emotional-memory.js';

// ============================================================================
// UNIFIED ANALYSIS PIPELINE - Single entry point for complete analysis
// ============================================================================

export {
  analyzeUserMessage,
  detectBehavioralSignals,
  combineEmotionAnalysis,
  buildResponseContext,
  type AnalysisInput,
  type AnalysisResult,
  type CombinedEmotionAnalysis,
  type BehavioralSignals,
  type ResponseContext,
} from './analysis-pipeline.js';

// ============================================================================
// COMBINED ANALYSIS
// ============================================================================

import { getLogger } from '../utils/safe-logger.js';
import { getEmotionDetector, type EmotionResult } from './emotion-detector.js';
import { getIntentClassifier, type IntentResult } from './intent-classifier.js';
import { getTopicTracker, type TopicExtractionResult } from './topic-tracker.js';
import {
  getStateMachine,
  resetStateMachine,
  type ConversationState,
} from './conversation-state.js';

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
export function analyzeMessage(
  message: string,
  options?: {
    userName?: string;
    isReturningUser?: boolean;
  }
): ConversationAnalysis {
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

  getLogger().info(
    `Analysis: emotion=${emotion.primary}, intent=${intent.primary}, phase=${state.phase}`
  );

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
function buildContextForPrompt(
  emotion: EmotionResult,
  intent: IntentResult,
  topics: TopicExtractionResult,
  state: ConversationState,
  guidance: import('./conversation-state.js').PhaseGuidance
): string {
  const sections: string[] = [];

  // Emotional awareness
  if (emotion.distressLevel > 0.5) {
    sections.push(
      `[PRIORITY] User appears distressed (${emotion.primary}, distress: ${emotion.distressLevel.toFixed(2)}). Focus on emotional support first.`
    );
  } else if (emotion.valence === 'positive') {
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
function determineSuggestedTone(emotion: EmotionResult, state: ConversationState): string {
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
function determinePriorityFocus(
  emotion: EmotionResult,
  intent: IntentResult,
  state: ConversationState
): string {
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
export function resetIntelligence(isReturningUser = false): void {
  getEmotionDetector().clearHistory();
  getTopicTracker().clear();
  resetStateMachine(isReturningUser);
  getLogger().info('Intelligence components reset');
}

export default {
  analyzeMessage,
  resetIntelligence,
};
