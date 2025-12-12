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
 * @module intelligence
 */

// ============================================================================
// NEW INFRASTRUCTURE (added in refactor)
// ============================================================================

// Distress Levels - Centralized thresholds for emotional support
export {
  DISTRESS,
  DISTRESS_GUIDANCE,
  formatDistressForPrompt,
  getDistressCategory,
  getDistressGuidance,
  getSuggestedTone,
  isCrisis,
  needsEmotionalSupport,
  shouldBeGentle,
  type DistressGuidance,
  type DistressLevel,
} from './distress-levels.js';

// Session State - Centralized session state management
export {
  // Cognitive state helpers
  addReasoningApproach,
  addUserMessageForStyleDetection,
  getActiveReasoningChain,
  getCognitiveState,
  // Core state management
  getCustomState,
  // Lovable presence helpers
  getLovableState,
  // Session flow helpers
  getSessionFlowState,
  getSessionState,
  incrementTurnCount,
  isInsightOnCooldown,
  markHabitUsed,
  markInsightShared,
  markMemoryReferenced,
  markQuirkUsed,
  recordKeyMoment,
  SessionStateManager,
  setActiveReasoningChain,
  setCustomState,
  updateCognitiveLoad,
  updateEmotionalTrajectory,
  updateLovableState,
  updateSessionFlowState,
  updateUserCognitiveStyle,
  updateVoiceEmotion,
  wasHabitUsed,
  wasInsightShared,
  wasMemoryReferenced,
  wasQuirkUsed,
  type CognitiveReasoningState,
  type ConversationFlowState,
  type EmotionalTrajectory,
  type LovablePresenceState,
  type PatternState,
  // Types
  type CognitiveLoadState as SessionCognitiveLoadState,
  type SessionFlowTrackingState,
  type SessionState,
  type VoiceEmotionState,
} from './session-state.js';

// Voice Emotion Orchestrator - Unified voice emotion analysis
export {
  analyzeVoiceEmotion,
  detectEmotionSuppression,
  formatVoiceEmotionForPrompt,
  VoiceEmotionOrchestrator,
  type SuppressionResult,
  type TextEmotionInput,
  type VoiceEmotionAnalysis,
  type VoiceEmotionGuidance,
  type VoiceEmotionInput,
} from './voice-emotion-orchestrator.js';

// ============================================================================
// CORE INTELLIGENCE
// ============================================================================

// Emotion Detection
export {
  detectEmotion,
  EmotionDetector,
  getEmotionDetector,
  type EmotionResult,
  type PrimaryEmotion,
  type Valence,
} from './emotion-detector.js';

// Intent Classification
export {
  classifyIntent,
  getIntentClassifier,
  IntentClassifier,
  type Intent,
  type IntentResult,
} from './intent-classifier.js';

// Topic Tracking
export {
  extractTopics,
  getTopicTracker,
  TopicTracker,
  type Topic,
  type TopicCategory,
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
  detectCulturalMoment,
  detectUserEngagement,
  getPreferenceGuidance,
  getProactiveGoalReference,
  getRunningJokeCallback,
  getSpontaneousThought,
  getVoiceProsodyResponse,
  HumanBehaviors,
  inferUserPreferences,
  shouldInjectBackchannel,
  verifyTopicThreading,
} from './human-behaviors.js';

// Conversation Quality & Advanced Features
export {
  calculatePacingScore,
  ConversationQuality,
  createSessionRecoveryState,
  extractFollowUps,
  extractSmallDetails,
  generateFarewellSummary,
  getDetailCallback,
  getFollowUpSuggestion,
  getGracefulErrorResponse,
  getPersonaPhysicalState,
  getPhysicalStateInterjection,
  shouldAttemptRecovery,
  type ConversationPacingScore,
  type FarewellSummary,
  type FollowUpItem,
  type GracefulError,
  type PersonaPhysicalState,
  type SessionRecoveryState,
  type SmallDetail,
} from './conversation-quality.js';

// User Learning Engine - Makes Jack smarter over time
export {
  getLearningEngine,
  resetLearningEngine,
  UserLearningEngine,
  type ConversationLearningData,
  type DynamicUserContext,
  type LearningInsight,
} from './user-learning-engine.js';

// Response Quality Tracker - Learn what responses work
export {
  getResponseQualityTracker,
  removeResponseQualityTracker,
  ResponseQualityTracker,
  type LearnedResponsePreferences,
  type ResponseSignal,
  type ResponseType,
  type UserReaction,
  type UserResponseQuality,
} from './response-quality-tracker.js';

// Conversation Pattern Analyzer - Learn user habits
export {
  ConversationPatternAnalyzer,
  getConversationPatternAnalyzer,
  removeConversationPatternAnalyzer,
  type ConversationPrediction,
  type ConversationSession,
  type DayOfWeek,
  type DurationBucket,
  type LearnedConversationPatterns,
  type OpeningStyle,
  type TimeOfDay,
} from './conversation-pattern-analyzer.js';

// Proactive Insight Engine - Generate suggestions
export {
  getProactiveInsightEngine,
  ProactiveInsightEngine,
  removeProactiveInsightEngine,
  type InsightGenerationResult,
  type InsightPriority,
  type InsightType,
  type ProactiveInsight,
} from './proactive-insight-engine.js';

// Financial Journey Tracker - Track long-term progress
export {
  FinancialJourneyTracker,
  getFinancialJourneyTracker,
  removeFinancialJourneyTracker,
  type FinancialJourney,
  type FinancialSnapshot,
  type JourneyMilestone,
  type ProgressTrend,
} from './financial-journey-tracker.js';

// Cross-Session Threader - Continue topics across sessions
export {
  CrossSessionThreader,
  getCrossSessionThreader,
  removeCrossSessionThreader,
  type OpenThread,
  type PromisedFollowUp,
  type SessionEndContext,
  type ThreadOpenReason,
  type ThreadPriority,
} from './cross-session-threader.js';

// Voice Pace Adapter - Match user's rhythm
export {
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  VoicePaceAdapter,
  type ConversationTempo,
  type CurrentPaceState,
  type EnergyLevel,
  type LearnedPacePreferences,
  type PaceCategory,
  type PaceObservation,
} from './voice-pace-adapter.js';

// ============================================================================
// COLLECTIVE LEARNING SYSTEM
// ============================================================================

// Community Insights - Learn from all users
export {
  CommunityInsightsEngine,
  getCommunityInsights,
  resetCommunityInsights,
  type CommunityJourneyPattern,
  type CommunityResponsePattern,
  type EffectiveQuestion,
  type JourneyTransition,
  type PhraseEffectiveness,
  type ResponseStrategySignal,
  type StoryResonance,
} from './community-insights.js';

// Agent Evolution - Self-improvement from learnings
export {
  AgentEvolutionEngine,
  getAgentEvolution,
  resetAgentEvolution,
  type EmergentPattern,
  type PersonaAdjustment,
  type PersonaEvolutionState,
  type PersonaExperiment,
  type StoryRanking,
} from './agent-evolution.js';

// ============================================================================
// CONTEXT BUILDERS - Modular conversation intelligence injection
// ============================================================================

export {
  buildConversationContext,
  createCriticalInjection,
  createHintInjection,
  createInjection,
  createStandardInjection,
  formatContextForPrompt,
  getRegisteredBuilders,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  type ContextUserData,
} from './context-builders/index.js';

// ============================================================================
// HUMAN-LEVEL INTERACTION FEATURES
// ============================================================================

// Humor Calibration - Learn what jokes land
export {
  getHumorCalibration,
  HumorCalibrationEngine,
  removeHumorCalibration,
  resetAllHumorCalibration,
  type HumorAttempt,
  type HumorGuidance,
  type HumorPreferences,
  type HumorReaction,
  type HumorType,
} from './humor-calibration.js';

// Story Preference - Track what resonates
export {
  getStoryPreference,
  removeStoryPreference,
  StoryPreferenceEngine,
  type EmotionalDepth,
  type StoryAttempt,
  type StoryGuidance,
  type StoryLength,
  type StoryPreferences,
  type StoryType,
  type UserEngagement as StoryUserEngagement,
} from './story-preference.js';

// Communication Style Mirroring - Match their language
export {
  CommunicationMirroringEngine,
  getCommunicationMirroring,
  removeCommunicationMirroring,
  type CommunicationStyle,
  type FormalityLevel,
  type EnergyLevel as MirroringEnergyLevel,
  type StyleGuidance,
  type VocabularyLevel,
} from './communication-mirroring.js';

// Emotional Memory - Cross-session emotional continuity
export {
  EmotionalMemoryEngine,
  getEmotionalMemory,
  removeEmotionalMemory,
  type EmotionalCheckIn,
  type EmotionalContext,
  type EmotionalMoment,
  type EmotionalPattern,
} from './emotional-memory.js';

// ============================================================================
// UNIFIED ANALYSIS PIPELINE - Single entry point for complete analysis
// ============================================================================

export {
  analyzeUserMessage,
  buildResponseContext,
  combineEmotionAnalysis,
  detectBehavioralSignals,
  type AnalysisInput,
  type AnalysisResult,
  type BehavioralSignals,
  type CombinedEmotionAnalysis,
  type ResponseContext,
} from './analysis-pipeline.js';

// ============================================================================
// COMBINED ANALYSIS
// ============================================================================

import { getLogger } from '../utils/safe-logger.js';
import {
  getStateMachine,
  resetStateMachine,
  type ConversationState,
} from './conversation-state.js';
import { getEmotionDetector, type EmotionResult } from './emotion-detector.js';
import { getIntentClassifier, type IntentResult } from './intent-classifier.js';
import { getTopicTracker, type TopicExtractionResult } from './topic-tracker.js';

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

// ============================================================================
// COGNITIVE LOAD DETECTION
// ============================================================================

export {
  CognitiveLoadDetector,
  getCognitiveLoadDetector,
  resetAllCognitiveLoadDetectors,
  resetCognitiveLoadDetector,
  type CognitiveLoadIndicators,
  type CognitiveLoadLevel,
  type CognitiveLoadObservation,
  type CognitiveLoadState,
} from './cognitive-load.js';

// ============================================================================
// HEDGING LANGUAGE DETECTION
// ============================================================================

export {
  getHedgingDetector,
  HedgingDetector,
  resetAllHedgingDetectors,
  resetHedgingDetector,
  type HedgingAnalysisResult,
  type HedgingCategory,
  type HedgingInstance,
} from './hedging-detection.js';

// ============================================================================
// SELF-SOOTHING DETECTION
// ============================================================================

export {
  getSelfSoothingDetector,
  resetAllSelfSoothingDetectors,
  resetSelfSoothingDetector,
  SelfSoothingDetector,
  type SelfSoothingCategory,
  type SelfSoothingInstance,
  type SelfSoothingResult,
} from './self-soothing-detection.js';

// ============================================================================
// DEEP UNDERSTANDING SYSTEMS - Superhuman Emotional Intelligence
// ============================================================================

// Silence Intelligence - Understanding what different pauses mean
export {
  analyzeSilence,
  formatSilenceForPrompt,
  getSilencePattern,
  importSilencePattern,
  recordSilence,
  resetSilenceIntelligence,
  type SilenceAnalysis,
  type SilencePattern,
  type SilenceResponse,
  type SilenceType,
} from './silence-intelligence.js';

// Life Rhythm Prediction - Anticipating support needs
export {
  addAnniversary,
  formatPredictionForPrompt,
  getLifeRhythmProfile,
  importLifeRhythmProfile,
  predictUserState,
  recordConversationObservation,
  resetLifeRhythmPrediction,
  type AnniversaryDate,
  type LifeRhythmProfile,
  type MonthlyPattern,
  type RhythmPrediction,
  type SeasonalPattern,
  type WeeklyPattern,
} from './life-rhythm-prediction.js';

// Relational Network Intelligence - Understanding people in their life
export {
  analyzeSupportNetwork,
  detectUnspokenTension,
  extractPersonMentions,
  formatRelationalInsightsForPrompt,
  generateRelationalInsights,
  getRelationalNetwork,
  importRelationalNetwork,
  recordPersonMention,
  resetRelationalNetwork,
  type PersonInLife,
  type RelationalInsight,
  type RelationalNetwork,
  type RelationshipQuality,
  type RelationshipType,
  type SupportNetwork,
  type Triangulation,
  type UnspokenTension,
} from './relational-network.js';

// Resistance Pattern Detection - What they're avoiding
export {
  analyzeResistance,
  formatResistanceForPrompt,
  getResistanceProfile,
  getResistanceSummary,
  identifyGrowthEdges,
  resetResistanceDetection,
  type AvoidedTopic,
  type DefensePattern,
  type GrowthEdge,
  type ResistanceAnalysis,
  type ResistanceProfile,
  type SelfProtectiveProfile,
} from './resistance-detection.js';

// Energy State Inference - Physical/mental capacity
export {
  assessEnergyState,
  formatEnergyForPrompt,
  getEnergyPattern,
  markTopicEnergy,
  resetEnergyStateInference,
  type EnergyAssessment,
  type EnergyLevel as EnergyStateLevel,
  type EnergyPattern,
  type MentalCapacity,
  type MentalEnergyState,
  type PhysicalEnergyState,
  type SleepQuality,
} from './energy-state.js';

// Subconscious Goal Detection - What they want but haven't articulated
export {
  analyzeSubconscious,
  formatSubconsciousForPrompt,
  getSubconsciousProfile,
  getSubconsciousSummary,
  recordSurfaceReaction,
  resetSubconsciousGoals,
  type Contradiction,
  type EmergingDesire,
  type GoalCategory,
  type RecurringPattern,
  type SubconsciousAnalysis,
  type SubconsciousProfile,
} from './subconscious-goals.js';

// Conversational Flow Optimizer - When to go deep vs light
export {
  analyzeFlow,
  formatFlowForPrompt,
  getFlowProfile,
  resetConversationalFlow,
  type ConversationDepth,
  type DepthIndicators,
  type FlowAnalysis,
  type FlowDirection,
  type FlowProfile,
  type FlowState,
  type FlowTransition,
  type UserSignal,
} from './conversational-flow.js';

// Repair Intelligence - Fixing misunderstandings
export {
  detectMisunderstanding,
  formatRepairForPrompt,
  generateRepair,
  getRepairProfile,
  quickRepairCheck,
  recordAIResponse,
  recordRepairOutcome,
  resetRepairIntelligence,
  type MisunderstandingDetection,
  type MisunderstandingSeverity,
  type MisunderstandingType,
  type RepairApproach,
  type RepairAttempt,
  type RepairProfile,
  type RepairStrategy,
} from './repair-intelligence.js';

// Hope Trajectory Tracking - Long-term resilience
export {
  analyzeHope,
  formatHopeForPrompt,
  getHopeProfile,
  resetHopeTrajectory,
  type HopeAnalysis,
  type HopeObservation,
  type HopeProfile,
  type HopeTrajectory,
  type TrajectoryDirection,
  type UrgencyLevel,
} from './hope-trajectory.js';

// Life Chapter Awareness - Major life phases
export {
  analyzeChapter,
  formatChapterForPrompt,
  getChapterProfile,
  resetLifeChapterAwareness,
  type ChapterAnalysis,
  type ChapterEvidence,
  type ChapterProfile,
  type ChapterType,
  type LifeChapter,
  type TransitionPhase,
} from './life-chapter.js';

export default {
  analyzeMessage,
  resetIntelligence,
};
