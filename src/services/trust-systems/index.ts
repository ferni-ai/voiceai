/**
 * Trust Systems Index
 *
 * "Better than human" trust-building capabilities for Ferni.
 *
 * These systems work together to create genuine connection:
 *
 * 1. Reading Between Lines - Understanding what's NOT being said
 * 2. Boundary Memory - Remembering what NOT to bring up
 * 3. Growth Reflection - Noticing and reflecting their evolution
 * 4. Inside Jokes - Shared history that creates intimacy
 * 5. Small Wins - Celebrating effort, not just outcomes
 * 6. Thinking of You - Proactive outreach with no agenda
 *
 * @module TrustSystems
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

export {
  detectUnsaidSignals,
  getUnsaidProfile,
  getAvoidedTopics,
  shouldAvoidTopic,
  recordDidShare,
  type UnsaidSignal,
  type UserUnsaidProfile,
} from './reading-between-lines.js';

export {
  detectNewBoundary,
  checkBoundary,
  isTopicOffLimits,
  getActiveBoundaries,
  recordUserReopened,
  recordBoundaryRespect,
  updateProbingTolerance,
  getProbingDepth,
  exportBoundaries,
  importBoundaries,
  type Boundary,
  type BoundaryProfile,
  type BoundaryCheckResult,
} from './boundary-memory.js';

export {
  recordResponse,
  generateGrowthReflection,
  recordReflectionResponse,
  getUnreflectedGrowth,
  getGrowthPatterns,
  exportGrowthProfile,
  importGrowthProfile,
  type GrowthPattern,
  type GrowthProfile,
  type GrowthReflection,
} from './growth-reflection.js';

export {
  detectCallbackMoment,
  findCallbackOpportunity,
  recordCallbackUsed,
  detectRunningGag,
  recordCharacterTrait,
  getCallbackTraits,
  getSharedMoments,
  exportInsideJokesProfile,
  importInsideJokesProfile,
  type SharedMoment,
  type InsideJokesProfile,
  type CallbackOpportunity,
} from './inside-jokes.js';

export {
  detectSmallWin,
  detectIntention,
  generateCelebration,
  recordCelebrationResponse,
  getPendingIntentions,
  getUncelebratedWins,
  recordKnownDifficulty,
  exportSmallWinsProfile,
  importSmallWinsProfile,
  type SmallWin,
  type PendingIntention,
  type SmallWinsProfile,
  type CelebrationOpportunity,
} from './small-wins.js';

export {
  detectSignificantShare,
  generateThinkingOfYouMoments,
  generateRandomWarmth,
  getDueMoments,
  markMomentSent,
  recordOutreachResponse,
  updatePreferences,
  exportThinkingOfYouProfile,
  importThinkingOfYouProfile,
  type ThinkingOfYouMoment,
  type SignificantShare,
  type ThinkingOfYouProfile,
} from './thinking-of-you.js';

// ============================================================================
// UNIFIED TRUST CONTEXT
// ============================================================================

import {
  detectUnsaidSignals,
  getAvoidedTopics,
  type UnsaidSignal,
} from './reading-between-lines.js';

import {
  checkBoundary,
  isTopicOffLimits,
  detectNewBoundary,
  type BoundaryCheckResult,
} from './boundary-memory.js';

import {
  generateGrowthReflection,
  recordResponse,
  type GrowthReflection,
} from './growth-reflection.js';

import {
  findCallbackOpportunity,
  detectCallbackMoment,
  type CallbackOpportunity,
} from './inside-jokes.js';

import {
  detectSmallWin,
  generateCelebration,
  detectIntention,
  type CelebrationOpportunity,
} from './small-wins.js';

import {
  detectSignificantShare,
  getDueMoments,
  type ThinkingOfYouMoment,
} from './thinking-of-you.js';

/**
 * Unified trust context for a conversation turn
 */
export interface TrustContext {
  /** Signals of what's not being said */
  unsaidSignals: UnsaidSignal[];

  /** Boundary check result for AI response */
  boundaryCheck: BoundaryCheckResult | null;

  /** Growth reflection opportunity */
  growthReflection: GrowthReflection | null;

  /** Inside joke callback opportunity */
  callbackOpportunity: CallbackOpportunity | null;

  /** Small win celebration opportunity */
  celebrationOpportunity: CelebrationOpportunity | null;

  /** Pending proactive outreach */
  pendingOutreach: ThinkingOfYouMoment[];

  /** Topics to avoid */
  topicsToAvoid: string[];
}

/**
 * Build complete trust context for a conversation turn
 */
export function buildTrustContext(
  userId: string,
  userMessage: string,
  context: {
    currentTopic?: string;
    recentTopic?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    aiResponse?: string;
  }
): TrustContext {
  // 1. Detect what's not being said
  const unsaidSignals = detectUnsaidSignals(userId, userMessage, {
    recentTopics: context.currentTopic ? [context.currentTopic] : undefined,
    detectedEmotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
    previousMessages: context.previousMessages,
    topicBeforeThis: context.recentTopic,
  });

  // 2. Check boundaries for AI response
  let boundaryCheck: BoundaryCheckResult | null = null;
  if (context.aiResponse) {
    boundaryCheck = checkBoundary(userId, context.aiResponse, {
      userInitiatedTopic: true, // Assume user initiated if they're talking
      currentTopic: context.currentTopic,
    });
  }

  // 3. Detect any new boundaries being established
  detectNewBoundary(userId, userMessage, {
    currentTopic: context.currentTopic,
    recentTopic: context.recentTopic,
    emotionDetected: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  // 4. Record response for growth tracking
  if (context.currentTopic && context.detectedEmotion) {
    recordResponse(
      userId,
      context.currentTopic,
      userMessage,
      context.detectedEmotion,
      context.currentTopic
    );
  }

  // 5. Check for growth reflection opportunity
  const growthReflection = generateGrowthReflection(userId, {
    currentTopic: context.currentTopic,
    currentEmotion: context.detectedEmotion,
  });

  // 6. Detect callback moments and check for opportunities
  detectCallbackMoment(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
  });

  const callbackOpportunity = findCallbackOpportunity(userId, {
    userMessage,
    topic: context.currentTopic,
  });

  // 7. Detect small wins and intentions
  detectSmallWin(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  detectIntention(userId, userMessage);

  const celebrationOpportunity = generateCelebration(userId);

  // 8. Detect significant shares for future outreach
  detectSignificantShare(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  const pendingOutreach = getDueMoments(userId);

  // 9. Get topics to avoid
  const topicsToAvoid = getAvoidedTopics(userId);

  return {
    unsaidSignals,
    boundaryCheck,
    growthReflection,
    callbackOpportunity,
    celebrationOpportunity,
    pendingOutreach,
    topicsToAvoid,
  };
}

/**
 * Check if an AI response is safe to send
 */
export function checkResponseSafety(
  userId: string,
  proposedResponse: string,
  context?: { currentTopic?: string }
): {
  safe: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check boundaries
  const boundaryCheck = checkBoundary(userId, proposedResponse, {
    currentTopic: context?.currentTopic,
  });

  if (boundaryCheck.crossesBoundary) {
    warnings.push(`Response mentions bounded topic: ${boundaryCheck.boundary?.topic}`);
    if (boundaryCheck.carefulApproach) {
      suggestions.push(boundaryCheck.carefulApproach);
    }
  }

  // Check avoided topics
  const avoidedTopics = getAvoidedTopics(userId);
  const responseLower = proposedResponse.toLowerCase();

  for (const topic of avoidedTopics) {
    if (responseLower.includes(topic.toLowerCase())) {
      warnings.push(`Response mentions avoided topic: ${topic}`);
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    suggestions,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

// ============================================================================
// ADDITIONAL MODULES
// ============================================================================

// Persistence
export {
  saveTrustProfiles,
  loadTrustProfiles,
  onSessionStart,
  onSessionEnd,
  periodicSync,
  exportTrustBundle,
  importTrustBundle,
  deleteTrustProfiles,
  type TrustProfileBundle,
} from './persistence.js';

// Voice Emotion Integration
export {
  detectEmotionMismatch,
  enhanceWithVoiceEmotion,
  updateVoiceBaseline,
  detectVoiceDeviation,
  type VoiceEmotionSignal,
  type EnhancedUnsaidSignal,
  type EmotionMismatch,
} from './voice-emotion-integration.js';

// Outreach Integration
export {
  queueThinkingOfYou,
  queueCelebration,
  queueGrowthReflection,
  getDueItems,
  canSendOutreach,
  executeOutreach,
  generateOutreachOpportunities,
  processUserOutreach,
  setUserPreferences,
  getUserPreferences,
  disableOutreach,
  enableOutreach,
  type OutreachItem,
  type OutreachResult,
  type OutreachPreferences,
} from './outreach-integration.js';

// Handoff Context
export {
  buildHandoffContext,
  getHandoffWarnings,
  formatHandoffForLLM,
  createHandoffNote,
  type HandoffTrustContext,
  type PersonaSpecificContext,
} from './handoff-context.js';

// Analytics
export {
  trackEvent,
  trackDetection,
  trackSurfaced,
  trackActedOn,
  trackUserResponse,
  calculateUserMetrics,
  getAggregateMetrics,
  createABTest,
  getTestAssignment,
  isFeatureEnabled,
  getDailySummary,
  getHealthCheck,
  exportAnalytics,
  type TrustEvent,
  type TrustMetrics,
  type ABTestConfig,
} from './analytics.js';

// ============================================================================
// PHASE 3: CROSS-DEVICE SYNC
// ============================================================================

export {
  getSyncState,
  onSyncEvent,
  startRealTimeSync,
  stopRealTimeSync,
  syncWrite,
  setNetworkStatus,
  detectSessionContinuity,
  updateSessionState,
  cleanup as cleanupSync,
  type SyncState,
  type SyncEvent,
  type SessionContinuity,
} from './cross-device-sync.js';

// ============================================================================
// PHASE 4: MACHINE LEARNING - OPTIMAL OUTREACH TIMING
// ============================================================================

export {
  recordTimingSignal,
  predictOptimalTiming,
  shouldReachOutNow,
  recordOutreachGap,
  getRecommendedGap,
  getTimingProfile,
  exportProfile as exportTimingProfile,
  importProfile as importTimingProfile,
  outreachTimingML,
  type TimingSignal,
  type TimingPrediction,
  type UserTimingProfile,
} from './outreach-timing-ml.js';

// ============================================================================
// PHASE 5: PERSONA-SPECIFIC LEARNING
// ============================================================================

export {
  recordPersonaInteraction,
  learnDomainKnowledge,
  getPersonaDomainKnowledge,
  recordPersonaObservation,
  getPersonaObservations,
  getSharedInsights,
  updatePersonaRapport,
  getPersonaCommunicationStyle,
  buildPersonaContext,
  getPersonaMemory,
  getAllPersonaMemories,
  exportPersonaMemories,
  importPersonaMemories,
  personaLearning,
  type PersonaId,
  type PersonaMemory,
  type DomainKnowledge,
  type PersonaObservation,
  type ShareableInsight,
} from './persona-specific-learning.js';

// ============================================================================
// PHASE 8: NOTIFICATION DELIVERY
// ============================================================================

export {
  deliverPush,
  deliverEmail,
  deliverSms,
  deliverToUser,
  type DeliveryChannel,
  type DeliveryResult,
  type UserChannelConfig,
} from './notification-delivery.js';

// ============================================================================
// PHASE 11: MEMORY CONSOLIDATION
// ============================================================================

export {
  consolidateTrustProfiles,
  getConsolidatedProfile,
  getThemesForContext,
  getMilestones,
  searchArchive,
  runScheduledConsolidation,
  type ConsolidationConfig,
  type ConsolidationResult,
  type ArchivedMemory,
  type ConsolidatedProfile,
} from './memory-consolidation.js';

// ============================================================================
// PHASE 12: RELATIONSHIP HEALTH
// ============================================================================

export {
  calculateHealthScore,
  getHealthScore,
  getHealthTrend,
  acknowledgeAlert,
  recordMilestone,
  getStageName,
  getStageDescription,
  exportHealthData,
  calculateBoundaryRespect,
  calculateEmotionalAttunement,
  calculateGrowthAcknowledgment,
  calculateCallbackSuccess,
  calculateOutreachReception,
  calculateSessionDepth,
  calculateConsistency,
  type RelationshipHealthScore,
  type HealthFactor,
  type HealthAlert,
  type HealthTrend,
  type RelationshipMilestone,
} from './relationship-health.js';

// ============================================================================
// PHASE 13: CONVERSATION STARTERS
// ============================================================================

export {
  generateStarters,
  getBestStarter,
  markStarterUsed,
  generateGreeting,
  type ConversationStarter,
  type StarterType,
  type UserContext as StarterUserContext,
  type PendingFollowUp,
  type UpcomingEvent,
} from './conversation-starters.js';

// ============================================================================
// PHASE 14: LIFE EVENTS
// ============================================================================

export {
  detectLifeEvents,
  saveEvent,
  getUpcomingEvents,
  getEventsNeedingReminders,
  getEventsNeedingFollowUp,
  recordEventOutcome,
  markReminderSent,
  markCheckInSent,
  generateReminderMessage,
  generateFollowUpMessage,
  type LifeEvent,
  type EventType,
  type EventSentiment,
  type EventDetectionResult,
  type UpcomingEventSummary,
} from './life-events.js';

// ============================================================================
// PHASE 15: RESPONSE TUNING
// ============================================================================

export {
  calculateResponseStyle,
  generateTuningGuidance,
  formatGuidanceForLLM,
  checkResponseAlignment,
  type ResponseStyle,
  type TuningContext,
  type TunedGuidance,
  type RelationshipStage,
} from './response-tuning.js';

// ============================================================================
// PHASE 16: CELEBRATION MOMENTUM
// ============================================================================

export {
  recordWin,
  getMomentumProfile,
  getActiveStreaks,
  generateCelebrations,
  getMomentumSummary,
  markCelebrationShown,
  type WinType,
  type TrackedWin,
  type WinStreak,
  type WinTheme,
  type MomentumProfile,
  type CelebrationSuggestion,
} from './celebration-momentum.js';

// ============================================================================
// PHASE 17: SENTIMENT TIMELINE
// ============================================================================

export {
  recordEmotionalSnapshot,
  getTimeline,
  getCurrentMoodContext,
  getRecentPeaksValleys,
  getInsightfulPatterns,
  exportTimelineData,
  generateTimelineSummary,
  type EmotionCategory,
  type EmotionalSnapshot,
  type DailyMoodSummary,
  type TimelineTrend,
  type EmotionalPeak,
  type SentimentTimeline,
  type EmotionalPattern,
} from './sentiment-timeline.js';

// ============================================================================
// PHASE 24: VOICE PROSODY LEARNING
// ============================================================================

export {
  recordVoiceSample,
  analyzeDeviation,
  getVoiceEvolution,
  getFamiliarityScore,
  getEmotionDetectionBoost,
  getBaseline,
  detectVoiceMention,
  generateVoiceContext,
  type VoiceCharacteristics,
  type PersonalBaseline,
  type DeviationAnalysis,
  type VoiceEvolution,
} from './voice-prosody-learning.js';

// ============================================================================
// PHASE 25: JOURNALING PROMPTS
// ============================================================================

export {
  generatePrompts,
  getBestPrompt,
  getPromptsForCategory,
  recordResponse as recordJournalingResponse,
  getJournalingPatterns,
  generateSituationalPrompt,
  formatPromptForVoice,
  type JournalingPrompt,
  type PromptCategory,
  type PromptContext,
  type PromptResponse,
  type JournalingPattern,
} from './journaling-prompts.js';

// ============================================================================
// PHASE 26: SEASONAL AWARENESS
// ============================================================================

export {
  getCurrentSeason,
  recordSeasonalData,
  addPersonalDate,
  updateHolidayPreference,
  buildSeasonalContext,
  detectSADPatterns,
  getSeasonalProfile,
  generateSeasonalContextForLLM,
  type Season,
  type SeasonalProfile,
  type PersonalDate,
  type SeasonalContext,
  type HolidayPreference,
} from './seasonal-awareness.js';

// ============================================================================
// PHASE 27: LEARNING STYLE ADAPTATION
// ============================================================================

export {
  detectStyleSignals,
  recordLearningSignals,
  generateDeliveryGuidance,
  formatGuidanceForLLM as formatLearningGuidanceForLLM,
  recordAdaptationReception,
  getLearningProfile,
  getStyleSummary,
  type LearningProfile,
  type ProcessingStyle,
  type PacingStyle,
  type DeliveryGuidance,
  type StyleSignal,
} from './learning-style.js';

// ============================================================================
// PHASE 28: RELATIONSHIP INSIGHTS REPORT
// ============================================================================

export {
  recordSessionData,
  recordEmotionData,
  recordTopicData,
  recordWinData,
  recordGrowthData,
  generateReport,
  getReportHistory,
  getLatestReport,
  isReportDue,
  type InsightsReport,
  type ReportPeriod,
  type ReportSummary,
  type ConversationInsights,
  type GrowthInsights,
  type WinsInsights,
} from './relationship-insights.js';

// ============================================================================
// PHASE 29: CONTEXTUAL MEDIA SUGGESTIONS
// ============================================================================

export {
  generateSuggestions as generateMediaSuggestions,
  getBestSuggestion,
  getSuggestionsForMood,
  recordSuggestionFeedback,
  updateMusicPreferences,
  formatSuggestionForVoice,
  getMediaPreferences,
  type MediaSuggestion,
  type MediaType,
  type MoodIntent,
  type MediaPreferences,
  type SuggestionContext,
} from './media-suggestions.js';

// ============================================================================
// UNIFIED RECORDER (Cross-system data flow)
// ============================================================================

export {
  recordConversationTurn,
  recordUnifiedWin,
  recordSessionEnd,
  recordJournalEntryUnified,
  recordMediaInteractionUnified,
  type ConversationTurnData,
  type SessionEndData,
  type MediaInteraction,
} from './unified-recorder.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  buildTrustContext,
  checkResponseSafety,
};
