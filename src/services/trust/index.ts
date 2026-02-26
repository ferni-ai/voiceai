/**
 * Trust Bounded Context
 *
 * "Better than human" trust-building capabilities.
 * This is the canonical entry point for all trust-related services.
 *
 * @module trust
 */

// ============================================================================
// CORE TRUST (split from reading-between-lines god file)
// ============================================================================

export {
  buildDeflectionContext,
  detectUnsaidSignals,
  exportUnsaidProfile,
  flushReadingBetweenLinesPersistence,
  getAvoidedTopics,
  getDeflectionStats,
  getUnsaidProfile,
  importUnsaidProfile,
  recordDeflectionPattern,
  recordDidShare,
  shouldAvoidTopic,
  shutdownReadingBetweenLines,
  type ConversationPattern,
  type PersistedConversationPattern,
  type PersistedUserUnsaidProfile,
  type UnsaidSignal,
  type UserUnsaidProfile,
} from './reading-between-lines.js';

// ============================================================================
// TRUST FRAMEWORK (buildTrustContext, checkResponseSafety)
// ============================================================================

export {
  buildTrustContext,
  checkResponseSafety,
  type TrustContext,
} from './trust-framework.js';

// ============================================================================
// BOUNDARY MEMORY
// ============================================================================

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
  recordPrematureAdvice,
  recordUserReopened,
  shouldAvoidAdviceAbout,
  updateProbingTolerance,
  type Boundary,
  type BoundaryCheckResult,
  type BoundaryProfile,
  type BoundarySoftening,
  type PrematureAdviceRecord,
} from '../trust-systems/boundary-memory.js';

// ============================================================================
// GROWTH REFLECTION
// ============================================================================

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
} from '../trust-systems/growth-reflection.js';

// ============================================================================
// INSIDE JOKES
// ============================================================================

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
} from '../trust-systems/inside-jokes.js';

// ============================================================================
// SMALL WINS
// ============================================================================

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
} from '../trust-systems/small-wins.js';

// ============================================================================
// THINKING OF YOU
// ============================================================================

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
} from '../trust-systems/thinking-of-you.js';

// ============================================================================
// OUR SONGS
// ============================================================================

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
} from '../trust-systems/our-songs.js';

// ============================================================================
// PERSISTENCE
// ============================================================================

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
} from '../trust-systems/persistence.js';

// ============================================================================
// VOICE EMOTION INTEGRATION
// ============================================================================

export {
  detectEmotionMismatch,
  detectVoiceDeviation,
  enhanceWithVoiceEmotion,
  updateVoiceBaseline,
  type EmotionMismatch,
  type EnhancedUnsaidSignal,
  type VoiceEmotionSignal,
} from '../trust-systems/voice-emotion-integration.js';

// ============================================================================
// OUTREACH INTEGRATION
// ============================================================================

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
} from '../trust-systems/outreach-integration.js';

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

export {
  buildHandoffContext,
  createHandoffNote,
  formatHandoffForLLM,
  getHandoffWarnings,
  type HandoffTrustContext,
  type PersonaSpecificContext,
} from '../trust-systems/handoff-context.js';

// ============================================================================
// ANALYTICS
// ============================================================================

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
} from '../trust-systems/analytics.js';

// ============================================================================
// CROSS-DEVICE SYNC
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
} from '../trust-systems/cross-device-sync.js';

// ============================================================================
// OUTREACH TIMING ML
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
} from '../trust-systems/outreach-timing-ml.js';

// ============================================================================
// PERSONA-SPECIFIC LEARNING
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
} from '../trust-systems/persona-specific-learning.js';

// ============================================================================
// NOTIFICATION DELIVERY
// ============================================================================

export {
  deliverEmail,
  deliverPush,
  deliverSms,
  deliverToUser,
  type DeliveryChannel,
  type DeliveryResult,
  type UserChannelConfig,
} from '../trust-systems/notification-delivery.js';

// ============================================================================
// MEMORY CONSOLIDATION
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
} from '../trust-systems/memory-consolidation.js';

// ============================================================================
// RELATIONSHIP HEALTH
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
} from '../trust-systems/relationship-health.js';

// ============================================================================
// CONVERSATION STARTERS
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
} from '../trust-systems/conversation-starters.js';

// ============================================================================
// LIFE EVENTS
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
} from '../trust-systems/life-events.js';

// ============================================================================
// RESPONSE TUNING
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
} from '../trust-systems/response-tuning.js';

// ============================================================================
// CELEBRATION MOMENTUM
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
} from '../trust-systems/celebration-momentum.js';

// ============================================================================
// SENTIMENT TIMELINE
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
} from '../trust-systems/sentiment-timeline.js';

// ============================================================================
// VOICE PROSODY LEARNING
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
} from '../trust-systems/voice-prosody-learning.js';

// ============================================================================
// JOURNALING PROMPTS
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
} from '../trust-systems/journaling-prompts.js';

// ============================================================================
// SEASONAL AWARENESS
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
} from '../trust-systems/seasonal-awareness.js';

// ============================================================================
// LEARNING STYLE ADAPTATION
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
} from '../trust-systems/learning-style.js';

// ============================================================================
// RELATIONSHIP INSIGHTS REPORT
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
} from '../trust-systems/relationship-insights.js';

// ============================================================================
// CONTEXTUAL MEDIA SUGGESTIONS
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
} from '../trust-systems/media-suggestions.js';

// ============================================================================
// UNIFIED RECORDER
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
} from '../trust-systems/unified-recorder.js';

// ============================================================================
// TRUST SIGNAL EMITTER
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
} from '../trust-systems/trust-signal-emitter.js';

// ============================================================================
// VOICE-AWARE DETECTION
// ============================================================================

export {
  detectUnsaidSignalsWithVoice,
  type VoiceAwareContext,
  type VoiceEmotionSignal as VoiceAwareEmotionSignal,
} from '../trust-systems/voice-aware-detection.js';

// ============================================================================
// BETWEEN-SESSION THINKING
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
} from '../trust-systems/between-session-thinking.js';

// ============================================================================
// TONAL MEMORY
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
} from '../trust-systems/tonal-memory.js';

// ============================================================================
// PERSONA GROWTH
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
} from '../trust-systems/persona-growth.js';

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES
// ============================================================================

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
} from '../trust-systems/first-time-vulnerability.js';

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
} from '../trust-systems/linguistic-mirroring.js';

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
} from '../trust-systems/ambient-context.js';

// ============================================================================
// CURIOSITY MEMORY
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
} from '../trust-systems/curiosity-memory.js';

// ============================================================================
// CONVERSATION TEXTURE
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
} from '../trust-systems/conversation-texture.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  buildTrustContext,
  checkResponseSafety,
};

// Re-import for default export
import { buildTrustContext, checkResponseSafety } from './trust-framework.js';
