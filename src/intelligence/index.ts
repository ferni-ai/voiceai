/**
 * Intelligence Module
 *
 * Ferni's brain - the layer that turns data into genuine awareness
 * and intelligent responses.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                 LEVEL 5: PROACTIVE INTELLIGENCE                 │
 * │  proactive/proactive-engine.ts                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *                                ▲
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                 LEVEL 4: CROSS-DOMAIN REASONING                 │
 * │  patterns/cross-domain-correlator.ts                            │
 * └─────────────────────────────────────────────────────────────────┘
 *                                ▲
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                 LEVEL 2: CONTEXTUAL AWARENESS                   │
 * │  core/context-assembler.ts                                      │
 * └─────────────────────────────────────────────────────────────────┘
 *                                ▲
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                 LEVEL 1: DATA FOUNDATION                        │
 * │  ../services/data-layer/                                        │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module intelligence
 */

// ============================================================================
// CORE INFRASTRUCTURE
// ============================================================================

export * from './core/index.js';

// ============================================================================
// UNIFIED ANALYSIS SYSTEM
// ============================================================================

export * from './unified/index.js';

// ============================================================================
// DETECTORS - Pure detection functions
// Selective exports to avoid conflicts with unified/
// ============================================================================

export {
  // Emotion Detection
  detectEmotion,
  EmotionDetector,
  getEmotionDetector,
  type EmotionResult,
  type PrimaryEmotion,
  type Valence,
  // Intent Classification
  classifyIntent,
  getIntentClassifier,
  IntentClassifier,
  type Intent,
  type IntentResult,
  // Topic Tracking
  extractTopics,
  getTopicTracker,
  TopicTracker,
  type Topic,
  type TopicCategory,
  type TopicExtractionResult,
  // Distress Level Detection
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
  // Hedging Language Detection
  getHedgingDetector,
  HedgingDetector,
  resetAllHedgingDetectors,
  resetHedgingDetector,
  type HedgingAnalysisResult,
  type HedgingCategory,
  type HedgingInstance,
  // Self-Soothing Detection
  getSelfSoothingDetector,
  resetAllSelfSoothingDetectors,
  resetSelfSoothingDetector,
  SelfSoothingDetector,
  type SelfSoothingCategory,
  type SelfSoothingInstance,
  type SelfSoothingResult,
  // Cognitive Load Detection
  CognitiveLoadDetector,
  getCognitiveLoadDetector,
  resetAllCognitiveLoadDetectors,
  resetCognitiveLoadDetector,
  type CognitiveLoadIndicators,
  type CognitiveLoadLevel,
  type CognitiveLoadObservation,
  type CognitiveLoadState,
} from './detectors/index.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

export * from './state/index.js';

// ============================================================================
// TRACKING & LEARNING
// Selective exports to avoid conflicts
// ============================================================================

export {
  // Response Quality Tracker
  getResponseQualityTracker,
  removeResponseQualityTracker,
  ResponseQualityTracker,
  type LearnedResponsePreferences,
  type ResponseSignal,
  type ResponseType,
  type UserResponseQuality,
  // Conversation Pattern Analyzer
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
  // Voice Pace Adapter
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  VoicePaceAdapter,
  type ConversationTempo,
  type CurrentPaceState,
  type LearnedPacePreferences,
  type PaceCategory,
  type PaceObservation,
  // Humor Calibration
  getHumorCalibration,
  HumorCalibrationEngine,
  removeHumorCalibration,
  resetAllHumorCalibration,
  type HumorAttempt,
  type HumorGuidance,
  type HumorPreferences,
  type HumorReaction,
  type HumorType,
  // Story Preference
  getStoryPreference,
  removeStoryPreference,
  StoryPreferenceEngine,
  type EmotionalDepth,
  type StoryAttempt,
  type StoryGuidance,
  type StoryLength,
  type StoryPreferences,
  type StoryType,
  // Communication Style
  CommunicationMirroringEngine,
  getCommunicationMirroring,
  removeCommunicationMirroring,
  type CommunicationStyle,
  type FormalityLevel,
  type StyleGuidance,
  type VocabularyLevel,
  // Emotional Memory
  EmotionalMemoryEngine,
  getEmotionalMemory,
  removeEmotionalMemory,
  type EmotionalCheckIn,
  type EmotionalContext,
  type EmotionalMoment,
  type EmotionalPattern,
  // Financial Journey Tracker
  FinancialJourneyTracker,
  getFinancialJourneyTracker,
  removeFinancialJourneyTracker,
  type FinancialJourney,
  type FinancialSnapshot,
  type JourneyMilestone,
  type ProgressTrend,
  // Cross-Session Threader
  CrossSessionThreader,
  getCrossSessionThreader,
  removeCrossSessionThreader,
  type OpenThread,
  type PromisedFollowUp,
  type SessionEndContext,
  type ThreadOpenReason,
  type ThreadPriority,
  // Preference Extractor
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
  type PreferenceCategory,
  // Capability Learning
  trackSurfacedDomains,
  getRecentlySurfacedDomains,
  finalizeSessionLearning,
  onUserEngagedWithCapability,
  onToolUsedInDomain,
  onToolExecuted,
  getMostEffectiveDomains,
  getBestEmotionalContext,
  getBestPersonaForDomain,
  getDomainEngagementRate,
  getAllPatterns,
  persistPatterns,
  loadPatterns,
  initializeCapabilityLearning,
  type CapabilityPattern,
} from './tracking/index.js';

// Re-export EnergyLevel with alias to avoid conflict
export { type EnergyLevel as TrackingEnergyLevel } from './tracking/index.js';

// ============================================================================
// DEEP UNDERSTANDING - Superhuman capabilities
// ============================================================================

export * from './deep-understanding/index.js';

// ============================================================================
// COACHING INTELLIGENCE
// ============================================================================

export * from './coaching/index.js';

// ============================================================================
// COLLECTIVE LEARNING
// ============================================================================

export * from './collective/index.js';

// Alias for scheduler status to match expected export name
export { getSchedulerStatus as getCollectiveLearningSchedulerStatus } from './collective/index.js';
export { forceRunAllJobs as forceRunCollectiveLearningJobs } from './collective/index.js';

// ============================================================================
// PROACTIVE INTELLIGENCE
// Selective exports to avoid conflicts with core/unified-intelligence-api
// ============================================================================

export {
  // Core functions (insight tracking is in core/)
  checkProactiveTriggers,
  // Session management
  initProactiveSession,
  cleanupProactiveSession,
  // Preferences
  getProactivePreferences,
  updateProactivePreferences,
  // Cleanup
  clearProactiveState,
  // Singleton
  proactiveEngine,
  // Types
  type SurfaceMoment,
  type InsightCategory,
  type ProactiveIntelligenceInsight,
  type ProactiveTriggerResult,
  type ProactivePreferences,
} from './proactive/index.js';

// ============================================================================
// CROSS-DOMAIN PATTERNS
// Selective exports - recordDomainSignal/getDomainSignals are in core/
// ============================================================================

export {
  // Correlation functions
  getCorrelations,
  getRelevantCorrelations,
  markCorrelationSurfaced,
  formatCorrelationsForPrompt,
  clearCorrelatorState,
  // Singleton accessor
  getCrossCorrelator,
  crossDomainCorrelator,
  // Types
  type CorrelationDomain,
  type CrossDomainCorrelation,
  type CorrelationFilterOptions,
} from './patterns/index.js';

// Re-export recordDomainSignal with alias for pattern-specific use
export { recordDomainSignal as recordCorrelationSignal } from './patterns/index.js';

// ============================================================================
// HUMAN BEHAVIORS
// ============================================================================

export * from './human-behaviors/index.js';

// ============================================================================
// CONVERSATION QUALITY
// ============================================================================

export * from './conversation-quality/index.js';

// ============================================================================
// SUPERHUMAN MEMORY
// ============================================================================

export * from './superhuman-memory/index.js';

// Alias for insight delivery to match expected export name
export { markInsightDelivered as markSuperhumanInsightDelivered } from './superhuman-memory/index.js';

// ============================================================================
// USER LEARNING ENGINE
// ============================================================================

export * from './user-learning-engine/index.js';

// ============================================================================
// PROACTIVE INSIGHT ENGINE (per-user insight generation)
// Distinct from proactive/ which handles timing
// ============================================================================

export {
  ProactiveInsightEngine,
  getProactiveInsightEngine,
  removeProactiveInsightEngine,
  type InsightType,
  type InsightPriority,
  type ProactiveInsight,
  type InsightGenerationResult,
} from './proactive-insight-engine.js';

// ============================================================================
// CONTEXT BUILDERS
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
// DATA CAPTURE (DEPRECATED - Use src/memory/dynamic/ instead)
// ============================================================================

/**
 * @deprecated Use fastCapture from src/memory/dynamic/index.js instead.
 */
export { processDataCapture, captureDataBetterThanHuman } from './data-capture/index.js';

/**
 * @deprecated Static definitions removed. Dynamic LLM extraction handles all patterns.
 */
export { allDataCaptureDefinitions } from './data-capture/definitions/index.js';

export type {
  DataCaptureDefinition,
  DataCaptureContext,
  DataCaptureResult,
} from './data-capture/types.js';

// ============================================================================
// MESSAGE ANALYSIS
// ============================================================================

export {
  analyzeMessage,
  resetIntelligence,
  type ConversationAnalysis,
} from './core/message-analyzer.js';
