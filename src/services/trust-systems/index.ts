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
  buildDeflectionContext,
  detectUnsaidSignals,
  exportUnsaidProfile,
  getAvoidedTopics,
  getDeflectionStats,
  getUnsaidProfile,
  importUnsaidProfile,
  recordDeflectionPattern,
  recordDidShare,
  shouldAvoidTopic,
  type UnsaidSignal,
  type UserUnsaidProfile,
} from './reading-between-lines.js';

export {
  buildProtectiveMemoryContext,
  checkBoundary,
  detectBoundarySoftening,
  detectNewBoundary,
  exportBoundaries,
  getActiveBoundaries,
  getBoundarySoftening,
  getPrematureAdviceRecords,
  getProbingDepth,
  importBoundaries,
  isTopicOffLimits,
  recordBoundaryRespect,
  // Protective Memory enhancements
  recordPrematureAdvice,
  recordUserReopened,
  shouldAvoidAdviceAbout,
  updateProbingTolerance,
  type Boundary,
  type BoundaryCheckResult,
  type BoundaryProfile,
  type BoundarySoftening,
  type PrematureAdviceRecord,
} from './boundary-memory.js';

export {
  exportGrowthProfile,
  generateEarlyGrowthReflection,
  generateGrowthReflection,
  getGrowthCount,
  getGrowthPatterns,
  getUnreflectedGrowth,
  importGrowthProfile,
  isGoodMomentForGrowth,
  recordReflectionResponse,
  recordResponse,
  type GrowthPattern,
  type GrowthProfile,
  type GrowthReflection,
} from './growth-reflection.js';

export {
  detectCallbackMoment,
  detectRunningGag,
  exportInsideJokesProfile,
  findCallbackOpportunity,
  getCallbackTraits,
  getSharedMoments,
  importInsideJokesProfile,
  recordCallbackUsed,
  recordCharacterTrait,
  type CallbackOpportunity,
  type InsideJokesProfile,
  type SharedMoment,
} from './inside-jokes.js';

export {
  detectIntention,
  detectSmallWin,
  exportSmallWinsProfile,
  generateCelebration,
  generateIntentionFollowUp,
  getIntentionToFollowUp,
  getOverdueIntentions,
  getPendingIntentions,
  getUncelebratedWins,
  importSmallWinsProfile,
  markIntentionAbandoned,
  markIntentionStruggled,
  recordCelebrationResponse,
  recordKnownDifficulty,
  type CelebrationOpportunity,
  type PendingIntention,
  type SmallWin,
  type SmallWinsProfile,
} from './small-wins.js';

export {
  detectSignificantShare,
  exportThinkingOfYouProfile,
  generateRandomWarmth,
  generateThinkingOfYouMoments,
  getDueMoments,
  importThinkingOfYouProfile,
  markMomentSent,
  recordOutreachResponse,
  updatePreferences,
  type SignificantShare,
  type ThinkingOfYouMoment,
  type ThinkingOfYouProfile,
} from './thinking-of-you.js';

// 💚 "Our Songs" - Shared Musical Memories
export {
  checkForOurSong,
  detectSignificantMoment,
  getAllOurSongs,
  getOurSongsProfileForPersistence,
  getOurSongsStats,
  getProactiveRememberWhen,
  loadOurSongsProfile,
  recordOurSong,
  type EmotionDuringMoment,
  type MomentType,
  type OurSongsProfile,
  type SharedSongMemory,
  type SongCallback,
} from './our-songs.js';

// ============================================================================
// UNIFIED TRUST CONTEXT
// ============================================================================

import {
  buildDeflectionContext,
  detectUnsaidSignals,
  getAvoidedTopics,
  recordDeflectionPattern,
  type UnsaidSignal,
} from './reading-between-lines.js';

import {
  buildProtectiveMemoryContext,
  checkBoundary,
  detectNewBoundary,
  type BoundaryCheckResult,
} from './boundary-memory.js';

import {
  generateGrowthReflection,
  recordResponse,
  type GrowthReflection,
} from './growth-reflection.js';

import {
  detectCallbackMoment,
  findCallbackOpportunity,
  type CallbackOpportunity,
} from './inside-jokes.js';

import {
  detectIntention,
  detectSmallWin,
  generateCelebration,
  type CelebrationOpportunity,
} from './small-wins.js';

import {
  detectSignificantShare,
  getDueMoments,
  type ThinkingOfYouMoment,
} from './thinking-of-you.js';

// New "Better Than Human" imports (Dec 2025)
import {
  detectFirstTimeVulnerability,
  recordVulnerabilityShare,
  type FirstTimeVulnerabilityResult,
} from './first-time-vulnerability.js';

import { buildLinguisticContext, recordLinguisticPatterns } from './linguistic-mirroring.js';

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

  // New "Better Than Human" (Dec 2025)
  /** First-time vulnerability detection */
  firstTimeVulnerability: FirstTimeVulnerabilityResult | null;

  /** Linguistic mirroring context */
  linguisticContext: string;

  /** Protective memory context */
  protectiveMemory: string;

  /** P4 FIX: Cross-session deflection pattern awareness */
  deflectionContext: string;
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

  // 1.5. P4 FIX: Record deflection patterns for cross-session tracking
  for (const signal of unsaidSignals) {
    if (signal.type === 'deflection' || signal.type === 'topic_avoidance') {
      recordDeflectionPattern(userId, signal);
    }
  }

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

  // ============================================================================
  // NEW "BETTER THAN HUMAN" CAPABILITIES (Dec 2025)
  // ============================================================================

  // 10. First-time vulnerability detection
  const firstTimeVulnerability = detectFirstTimeVulnerability(userId, userMessage);

  // Record if detected (auto-acknowledgment tracking)
  if (firstTimeVulnerability) {
    recordVulnerabilityShare(
      userId,
      firstTimeVulnerability,
      firstTimeVulnerability.suggestedAcknowledgment
    );
  }

  // 11. Record linguistic patterns for mirroring
  recordLinguisticPatterns(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
  });

  // 12. Build context strings
  const linguisticContext = buildLinguisticContext(userId);
  const protectiveMemory = buildProtectiveMemoryContext(userId);

  // P4 FIX: Build cross-session deflection awareness
  const deflectionContext = buildDeflectionContext(userId);

  return {
    unsaidSignals,
    boundaryCheck,
    growthReflection,
    callbackOpportunity,
    celebrationOpportunity,
    pendingOutreach,
    topicsToAvoid,
    // New capabilities
    firstTimeVulnerability,
    linguisticContext,
    protectiveMemory,
    deflectionContext,
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
  deleteTrustProfiles,
  exportTrustBundle,
  importTrustBundle,
  loadTrustProfiles,
  onSessionEnd,
  onSessionStart,
  periodicSync,
  saveTrustProfiles,
  type TrustProfileBundle,
} from './persistence.js';

// Voice Emotion Integration
export {
  detectEmotionMismatch,
  detectVoiceDeviation,
  enhanceWithVoiceEmotion,
  updateVoiceBaseline,
  type EmotionMismatch,
  type EnhancedUnsaidSignal,
  type VoiceEmotionSignal,
} from './voice-emotion-integration.js';

// Outreach Integration
export {
  canSendOutreach,
  disableOutreach,
  enableOutreach,
  executeOutreach,
  generateOutreachOpportunities,
  getDueItems,
  getUserPreferences,
  processUserOutreach,
  queueCelebration,
  queueGrowthReflection,
  queueThinkingOfYou,
  setUserPreferences,
  type OutreachItem,
  type OutreachPreferences,
  type OutreachResult,
} from './outreach-integration.js';

// Handoff Context
export {
  buildHandoffContext,
  createHandoffNote,
  formatHandoffForLLM,
  getHandoffWarnings,
  type HandoffTrustContext,
  type PersonaSpecificContext,
} from './handoff-context.js';

// Analytics
export {
  calculateUserMetrics,
  createABTest,
  exportAnalytics,
  getAggregateMetrics,
  getDailySummary,
  getHealthCheck,
  getTestAssignment,
  isFeatureEnabled,
  trackActedOn,
  trackDetection,
  trackEvent,
  trackSurfaced,
  trackUserResponse,
  type ABTestConfig,
  type TrustEvent,
  type TrustMetrics,
} from './analytics.js';

// ============================================================================
// PHASE 3: CROSS-DEVICE SYNC
// ============================================================================

export {
  cleanup as cleanupSync,
  detectSessionContinuity,
  getSyncState,
  onSyncEvent,
  setNetworkStatus,
  startRealTimeSync,
  stopRealTimeSync,
  syncWrite,
  updateSessionState,
  type SessionContinuity,
  type SyncEvent,
  type SyncState,
} from './cross-device-sync.js';

// ============================================================================
// PHASE 4: MACHINE LEARNING - OPTIMAL OUTREACH TIMING
// ============================================================================

export {
  exportProfile as exportTimingProfile,
  getRecommendedGap,
  getTimingProfile,
  importProfile as importTimingProfile,
  outreachTimingML,
  predictOptimalTiming,
  recordOutreachGap,
  recordTimingSignal,
  shouldReachOutNow,
  type TimingPrediction,
  type TimingSignal,
  type UserTimingProfile,
} from './outreach-timing-ml.js';

// ============================================================================
// PHASE 5: PERSONA-SPECIFIC LEARNING
// ============================================================================

export {
  buildPersonaContext,
  exportPersonaMemories,
  getAllPersonaMemories,
  getPersonaCommunicationStyle,
  getPersonaDomainKnowledge,
  getPersonaMemory,
  getPersonaObservations,
  getSharedInsights,
  importPersonaMemories,
  learnDomainKnowledge,
  personaLearning,
  recordPersonaInteraction,
  recordPersonaObservation,
  updatePersonaRapport,
  type DomainKnowledge,
  type PersonaId,
  type PersonaMemory,
  type PersonaObservation,
  type ShareableInsight,
} from './persona-specific-learning.js';

// ============================================================================
// PHASE 8: NOTIFICATION DELIVERY
// ============================================================================

export {
  deliverEmail,
  deliverPush,
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
  getMilestones,
  getThemesForContext,
  runScheduledConsolidation,
  searchArchive,
  type ArchivedMemory,
  type ConsolidatedProfile,
  type ConsolidationConfig,
  type ConsolidationResult,
} from './memory-consolidation.js';

// ============================================================================
// PHASE 12: RELATIONSHIP HEALTH
// ============================================================================

export {
  acknowledgeAlert,
  calculateBoundaryRespect,
  calculateCallbackSuccess,
  calculateConsistency,
  calculateEmotionalAttunement,
  calculateGrowthAcknowledgment,
  calculateHealthScore,
  calculateOutreachReception,
  calculateSessionDepth,
  exportHealthData,
  getAllHealthScores,
  getHealthScore,
  getHealthTrend,
  getStageDescription,
  getStageDistributionPercent,
  getStageName,
  getTrustAggregates,
  getWarmthStatistics,
  recordMilestone,
  recordWarmthChange,
  type HealthAlert,
  type HealthFactor,
  type HealthTrend,
  type RelationshipHealthScore,
  type RelationshipMilestone,
} from './relationship-health.js';

// ============================================================================
// PHASE 13: CONVERSATION STARTERS
// ============================================================================

export {
  generateGreeting,
  generateStarters,
  getBestStarter,
  markStarterUsed,
  type ConversationStarter,
  type PendingFollowUp,
  type StarterType,
  type UserContext as StarterUserContext,
  type UpcomingEvent,
} from './conversation-starters.js';

// ============================================================================
// PHASE 14: LIFE EVENTS
// ============================================================================

export {
  detectLifeEvents,
  generateFollowUpMessage,
  generateReminderMessage,
  getEventsNeedingFollowUp,
  getEventsNeedingReminders,
  getUpcomingEvents,
  markCheckInSent,
  markReminderSent,
  recordEventOutcome,
  saveEvent,
  type EventDetectionResult,
  type EventSentiment,
  type EventType,
  type LifeEvent,
  type UpcomingEventSummary,
} from './life-events.js';

// ============================================================================
// PHASE 15: RESPONSE TUNING
// ============================================================================

export {
  calculateResponseStyle,
  checkResponseAlignment,
  formatGuidanceForLLM,
  generateTuningGuidance,
  type RelationshipStage,
  type ResponseStyle,
  type TunedGuidance,
  type TuningContext,
} from './response-tuning.js';

// ============================================================================
// PHASE 16: CELEBRATION MOMENTUM
// ============================================================================

export {
  generateCelebrations,
  getActiveStreaks,
  getMomentumProfile,
  getMomentumSummary,
  markCelebrationShown,
  recordWin,
  type CelebrationSuggestion,
  type MomentumProfile,
  type TrackedWin,
  type WinStreak,
  type WinTheme,
  type WinType,
} from './celebration-momentum.js';

// ============================================================================
// PHASE 17: SENTIMENT TIMELINE
// ============================================================================

export {
  exportTimelineData,
  generateTimelineSummary,
  getCurrentMoodContext,
  getInsightfulPatterns,
  getRecentPeaksValleys,
  getTimeline,
  recordEmotionalSnapshot,
  type DailyMoodSummary,
  type EmotionalPattern,
  type EmotionalPeak,
  type EmotionalSnapshot,
  type EmotionCategory,
  type SentimentTimeline,
  type TimelineTrend,
} from './sentiment-timeline.js';

// ============================================================================
// PHASE 24: VOICE PROSODY LEARNING
// ============================================================================

export {
  analyzeDeviation,
  detectVoiceMention,
  generateVoiceContext,
  getBaseline,
  getEmotionDetectionBoost,
  getFamiliarityScore,
  getVoiceEvolution,
  recordVoiceSample,
  type DeviationAnalysis,
  type PersonalBaseline,
  type VoiceCharacteristics,
  type VoiceEvolution,
} from './voice-prosody-learning.js';

// ============================================================================
// PHASE 25: JOURNALING PROMPTS
// ============================================================================

export {
  formatPromptForVoice,
  generatePrompts,
  generateSituationalPrompt,
  getBestPrompt,
  getJournalingPatterns,
  getPromptsForCategory,
  recordResponse as recordJournalingResponse,
  type JournalingPattern,
  type JournalingPrompt,
  type PromptCategory,
  type PromptContext,
  type PromptResponse,
} from './journaling-prompts.js';

// ============================================================================
// PHASE 26: SEASONAL AWARENESS
// ============================================================================

export {
  addPersonalDate,
  buildSeasonalContext,
  detectSADPatterns,
  generateSeasonalContextForLLM,
  getCurrentSeason,
  getSeasonalProfile,
  recordSeasonalData,
  updateHolidayPreference,
  type HolidayPreference,
  type PersonalDate,
  type Season,
  type SeasonalContext,
  type SeasonalProfile,
} from './seasonal-awareness.js';

// ============================================================================
// PHASE 27: LEARNING STYLE ADAPTATION
// ============================================================================

export {
  detectStyleSignals,
  formatGuidanceForLLM as formatLearningGuidanceForLLM,
  generateDeliveryGuidance,
  getLearningProfile,
  getStyleSummary,
  recordAdaptationReception,
  recordLearningSignals,
  type DeliveryGuidance,
  type LearningProfile,
  type PacingStyle,
  type ProcessingStyle,
  type StyleSignal,
} from './learning-style.js';

// ============================================================================
// PHASE 28: RELATIONSHIP INSIGHTS REPORT
// ============================================================================

export {
  generateReport,
  getLatestReport,
  getReportHistory,
  isReportDue,
  recordEmotionData,
  recordGrowthData,
  recordSessionData,
  recordTopicData,
  recordWinData,
  type ConversationInsights,
  type GrowthInsights,
  type InsightsReport,
  type ReportPeriod,
  type ReportSummary,
  type WinsInsights,
} from './relationship-insights.js';

// ============================================================================
// PHASE 29: CONTEXTUAL MEDIA SUGGESTIONS
// ============================================================================

export {
  formatSuggestionForVoice,
  generateSuggestions as generateMediaSuggestions,
  getBestSuggestion,
  getMediaPreferences,
  getSuggestionsForMood,
  recordSuggestionFeedback,
  updateMusicPreferences,
  type MediaPreferences,
  type MediaSuggestion,
  type MediaType,
  type MoodIntent,
  type SuggestionContext,
} from './media-suggestions.js';

// ============================================================================
// UNIFIED RECORDER (Cross-system data flow)
// ============================================================================

export {
  recordConversationTurn,
  recordJournalEntryUnified,
  recordMediaInteractionUnified,
  recordSessionEnd,
  recordUnifiedWin,
  type ConversationTurnData,
  type MediaInteraction,
  type SessionEndData,
} from './unified-recorder.js';

// ============================================================================
// TRUST SIGNAL EMITTER (Frontend Bridge)
// ============================================================================

export {
  clearSignalEmitter,
  emitBoundaryRespectedSignal,
  emitCallbackSignal,
  emitGrowthSignal,
  emitReadingLinesSignal,
  emitSmallWinSignal,
  emitThinkingOfYouSignal,
  emitTrustSignal,
  processContextForSignals,
  setSignalEmitter,
  trustSignalEmitter,
  type SignalEmitCallback,
  type TrustSignalPayload,
  type TrustSignalType,
} from './trust-signal-emitter.js';

// ============================================================================
// VOICE-AWARE DETECTION (Phase 5 - Better Than Human)
// ============================================================================

export {
  detectUnsaidSignalsWithVoice,
  type VoiceAwareContext,
  type VoiceEmotionSignal as VoiceAwareEmotionSignal,
} from './voice-aware-detection.js';

// ============================================================================
// BETWEEN-SESSION THINKING (Continuous Presence)
// ============================================================================

export {
  clearUserThinking,
  detectThinkingWorthy,
  getAllUnsurfacedThinking,
  getThinkingMomentToSurface,
  getThinkingRecordsForPersistence,
  incrementSessionCount,
  loadThinkingRecords,
  markThinkingSurfaced,
  recordThinkingMoment,
  type ThinkingMoment,
  type ThinkingRecord,
  type ThinkingType,
} from './between-session-thinking.js';

// ============================================================================
// TONAL MEMORY (Remember HOW things were said)
// ============================================================================

export {
  clearSessionState as clearTonalSessionState,
  clearTonalProfile,
  detectRecurringPatterns as detectTonalPatterns,
  getAllTopicPatterns,
  getBestInsight as getBestTonalInsight,
  getTonalDescription,
  getTonalProfileForPersistence,
  hasTonalMemory,
  loadTonalProfile,
  markInsightSurfaced as markTonalInsightSurfaced,
  recordTonalObservation,
  type TonalInsight,
  type TonalMemoryProfile,
  type TonalSignature,
  type TopicTonalPattern,
} from './tonal-memory.js';

// ============================================================================
// PERSONA GROWTH (Mutual Growth - Level 5)
// ============================================================================

export {
  clearAllUserGrowth,
  clearPersonaGrowth,
  detectGrowthOpportunity,
  getAllGrowthProfiles,
  getGrowthMomentToShare,
  getPersonaGrowthForPersistence,
  loadPersonaGrowthProfile,
  markGrowthShared,
  recordPersonaGrowth,
  type GrowthMoment,
  type GrowthType,
  type PersonaGrowthProfile,
  type PersonaGrowthRecord,
} from './persona-growth.js';

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES (New - Dec 2025)
// ============================================================================

// First-Time Vulnerability Detection
export {
  buildFirstTimeVulnerabilityContext,
  buildVulnerabilityAwarenessContext,
  detectFirstTimeVulnerability,
  firstTimeVulnerability,
  getHighestVulnerabilityLevel,
  getVulnerabilityProfile,
  hasSharedAboutTopic,
  loadVulnerabilityProfile,
  recordVulnerabilityShare,
  saveVulnerabilityProfile,
  type FirstTimeVulnerabilityResult,
  type TopicVulnerability,
  type VulnerabilityLevel,
  type VulnerabilityProfile,
  type VulnerabilityThreshold,
} from './first-time-vulnerability.js';

// Linguistic Mirroring - Learn and use their vocabulary
export {
  adaptResponseStyle,
  buildLinguisticContext,
  getLinguisticProfile,
  getTheirWordFor,
  isWordAvoided,
  linguisticMirroring,
  loadLinguisticProfile,
  recordLinguisticPatterns,
  saveLinguisticProfile,
  type AvoidedWord,
  type FormalityLevel,
  type LinguisticProfile,
  type SignaturePhrase,
  type SpeechPatterns,
} from './linguistic-mirroring.js';

// Ambient Context Detection - Understand environment from audio
export {
  ambientContext,
  analyzeAmbientAudio,
  buildAmbientContext,
  getAmbientResponse,
  recordAmbientSignal,
  type AmbientContext,
  type AmbientResponse,
  type AmbientSignal,
  type AmbientSignalType,
  type Environment,
} from './ambient-context.js';

// ============================================================================
// CURIOSITY MEMORY - Follow Through on Passing Mentions
// ============================================================================

export {
  clearSessionState as clearCuriositySessionState,
  clearUserMentions,
  detectPassingMentions,
  getAllUnfollowedMentions,
  getCuriosityProfileForPersistence,
  getFollowUpOpportunity,
  getMentionsByType,
  loadCuriosityProfile,
  markFollowedUp,
  recordPassingMention,
  type CuriosityProfile,
  type FollowUpOpportunity,
  type MentionType,
  type PassingMention,
} from './curiosity-memory.js';

// ============================================================================
// CONVERSATION TEXTURE - The "feel" of past conversations
// ============================================================================

export {
  clearUserTexture,
  compareToUsual,
  detectDepth,
  detectTone,
  finalizeSessionTexture,
  getRecentTextureSummary,
  getTextureProfileForPersistence,
  getUsualTextureSummary,
  loadTextureProfile,
  recordDepthSignal,
  recordMemorableMoment,
  recordToneSignal,
  recordTopics,
  startSessionTexture,
  type ConversationRhythm,
  type ConversationTextureProfile,
  type ConversationTextureSnapshot,
  type ConversationTone,
  type DepthLevel,
  type EnergyPattern,
  type TextureComparison,
} from './conversation-texture.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  buildTrustContext,
  checkResponseSafety,
};
