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
export { buildDeflectionContext, detectUnsaidSignals, exportUnsaidProfile, getAvoidedTopics, getDeflectionStats, getUnsaidProfile, importUnsaidProfile, recordDeflectionPattern, recordDidShare, shouldAvoidTopic, type UnsaidSignal, type UserUnsaidProfile, } from './reading-between-lines.js';
export { buildProtectiveMemoryContext, checkBoundary, detectBoundarySoftening, detectNewBoundary, exportBoundaries, getActiveBoundaries, getBoundarySoftening, getPrematureAdviceRecords, getProbingDepth, importBoundaries, isTopicOffLimits, recordBoundaryRespect, recordPrematureAdvice, recordUserReopened, shouldAvoidAdviceAbout, updateProbingTolerance, type Boundary, type BoundaryCheckResult, type BoundaryProfile, type BoundarySoftening, type PrematureAdviceRecord, } from './boundary-memory.js';
export { exportGrowthProfile, generateEarlyGrowthReflection, generateGrowthReflection, getGrowthCount, getGrowthPatterns, getUnreflectedGrowth, importGrowthProfile, isGoodMomentForGrowth, recordReflectionResponse, recordResponse, type GrowthPattern, type GrowthProfile, type GrowthReflection, } from './growth-reflection.js';
export { detectCallbackMoment, detectRunningGag, exportInsideJokesProfile, findCallbackOpportunity, getCallbackTraits, getSharedMoments, importInsideJokesProfile, recordCallbackUsed, recordCharacterTrait, type CallbackOpportunity, type InsideJokesProfile, type SharedMoment, } from './inside-jokes.js';
export { detectIntention, detectSmallWin, exportSmallWinsProfile, generateCelebration, generateIntentionFollowUp, getIntentionToFollowUp, getOverdueIntentions, getPendingIntentions, getUncelebratedWins, importSmallWinsProfile, markIntentionAbandoned, markIntentionStruggled, recordCelebrationResponse, recordKnownDifficulty, type CelebrationOpportunity, type PendingIntention, type SmallWin, type SmallWinsProfile, } from './small-wins.js';
export { detectSignificantShare, exportThinkingOfYouProfile, generateRandomWarmth, generateThinkingOfYouMoments, getDueMoments, importThinkingOfYouProfile, markMomentSent, recordOutreachResponse, updatePreferences, type SignificantShare, type ThinkingOfYouMoment, type ThinkingOfYouProfile, } from './thinking-of-you.js';
export { checkForOurSong, detectSignificantMoment, getAllOurSongs, getOurSongsProfileForPersistence, getOurSongsStats, getProactiveRememberWhen, loadOurSongsProfile, recordOurSong, type EmotionDuringMoment, type MomentType, type OurSongsProfile, type SharedSongMemory, type SongCallback, } from './our-songs.js';
import { type UnsaidSignal } from './reading-between-lines.js';
import { type BoundaryCheckResult } from './boundary-memory.js';
import { type GrowthReflection } from './growth-reflection.js';
import { type CallbackOpportunity } from './inside-jokes.js';
import { type CelebrationOpportunity } from './small-wins.js';
import { type ThinkingOfYouMoment } from './thinking-of-you.js';
import { type FirstTimeVulnerabilityResult } from './first-time-vulnerability.js';
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
export declare function buildTrustContext(userId: string, userMessage: string, context: {
    currentTopic?: string;
    recentTopic?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    aiResponse?: string;
}): TrustContext;
/**
 * Check if an AI response is safe to send
 */
export declare function checkResponseSafety(userId: string, proposedResponse: string, context?: {
    currentTopic?: string;
}): {
    safe: boolean;
    warnings: string[];
    suggestions: string[];
};
export { deleteTrustProfiles, exportTrustBundle, importTrustBundle, loadTrustProfiles, onSessionEnd, onSessionStart, periodicSync, saveTrustProfiles, type TrustProfileBundle, } from './persistence.js';
export { detectEmotionMismatch, detectVoiceDeviation, enhanceWithVoiceEmotion, updateVoiceBaseline, type EmotionMismatch, type EnhancedUnsaidSignal, type VoiceEmotionSignal, } from './voice-emotion-integration.js';
export { canSendOutreach, disableOutreach, enableOutreach, executeOutreach, generateOutreachOpportunities, getDueItems, getUserPreferences, processUserOutreach, queueCelebration, queueGrowthReflection, queueThinkingOfYou, setUserPreferences, type OutreachItem, type OutreachPreferences, type OutreachResult, } from './outreach-integration.js';
export { buildHandoffContext, createHandoffNote, formatHandoffForLLM, getHandoffWarnings, type HandoffTrustContext, type PersonaSpecificContext, } from './handoff-context.js';
export { calculateUserMetrics, createABTest, exportAnalytics, getAggregateMetrics, getDailySummary, getHealthCheck, getTestAssignment, isFeatureEnabled, trackActedOn, trackDetection, trackEvent, trackSurfaced, trackUserResponse, type ABTestConfig, type TrustEvent, type TrustMetrics, } from './analytics.js';
export { cleanup as cleanupSync, detectSessionContinuity, getSyncState, onSyncEvent, setNetworkStatus, startRealTimeSync, stopRealTimeSync, syncWrite, updateSessionState, type SessionContinuity, type SyncEvent, type SyncState, } from './cross-device-sync.js';
export { exportProfile as exportTimingProfile, getRecommendedGap, getTimingProfile, importProfile as importTimingProfile, outreachTimingML, predictOptimalTiming, recordOutreachGap, recordTimingSignal, shouldReachOutNow, type TimingPrediction, type TimingSignal, type UserTimingProfile, } from './outreach-timing-ml.js';
export { buildPersonaContext, exportPersonaMemories, getAllPersonaMemories, getPersonaCommunicationStyle, getPersonaDomainKnowledge, getPersonaMemory, getPersonaObservations, getSharedInsights, importPersonaMemories, learnDomainKnowledge, personaLearning, recordPersonaInteraction, recordPersonaObservation, updatePersonaRapport, type DomainKnowledge, type PersonaId, type PersonaMemory, type PersonaObservation, type ShareableInsight, } from './persona-specific-learning.js';
export { deliverEmail, deliverPush, deliverSms, deliverToUser, type DeliveryChannel, type DeliveryResult, type UserChannelConfig, } from './notification-delivery.js';
export { consolidateTrustProfiles, getConsolidatedProfile, getMilestones, getThemesForContext, runScheduledConsolidation, searchArchive, type ArchivedMemory, type ConsolidatedProfile, type ConsolidationConfig, type ConsolidationResult, } from './memory-consolidation.js';
export { acknowledgeAlert, calculateBoundaryRespect, calculateCallbackSuccess, calculateConsistency, calculateEmotionalAttunement, calculateGrowthAcknowledgment, calculateHealthScore, calculateOutreachReception, calculateSessionDepth, exportHealthData, getAllHealthScores, getHealthScore, getHealthTrend, getStageDescription, getStageDistributionPercent, getStageName, getTrustAggregates, getWarmthStatistics, recordMilestone, recordWarmthChange, type HealthAlert, type HealthFactor, type HealthTrend, type RelationshipHealthScore, type RelationshipMilestone, } from './relationship-health.js';
export { generateGreeting, generateStarters, getBestStarter, markStarterUsed, type ConversationStarter, type PendingFollowUp, type StarterType, type UserContext as StarterUserContext, type UpcomingEvent, } from './conversation-starters.js';
export { detectLifeEvents, generateFollowUpMessage, generateReminderMessage, getEventsNeedingFollowUp, getEventsNeedingReminders, getUpcomingEvents, markCheckInSent, markReminderSent, recordEventOutcome, saveEvent, type EventDetectionResult, type EventSentiment, type EventType, type LifeEvent, type UpcomingEventSummary, } from './life-events.js';
export { calculateResponseStyle, checkResponseAlignment, formatGuidanceForLLM, generateTuningGuidance, type RelationshipStage, type ResponseStyle, type TunedGuidance, type TuningContext, } from './response-tuning.js';
export { generateCelebrations, getActiveStreaks, getMomentumProfile, getMomentumSummary, markCelebrationShown, recordWin, type CelebrationSuggestion, type MomentumProfile, type TrackedWin, type WinStreak, type WinTheme, type WinType, } from './celebration-momentum.js';
export { exportTimelineData, generateTimelineSummary, getCurrentMoodContext, getInsightfulPatterns, getRecentPeaksValleys, getTimeline, recordEmotionalSnapshot, type DailyMoodSummary, type EmotionalPattern, type EmotionalPeak, type EmotionalSnapshot, type EmotionCategory, type SentimentTimeline, type TimelineTrend, } from './sentiment-timeline.js';
export { analyzeDeviation, detectVoiceMention, generateVoiceContext, getBaseline, getEmotionDetectionBoost, getFamiliarityScore, getVoiceEvolution, recordVoiceSample, type DeviationAnalysis, type PersonalBaseline, type VoiceCharacteristics, type VoiceEvolution, } from './voice-prosody-learning.js';
export { formatPromptForVoice, generatePrompts, generateSituationalPrompt, getBestPrompt, getJournalingPatterns, getPromptsForCategory, recordResponse as recordJournalingResponse, type JournalingPattern, type JournalingPrompt, type PromptCategory, type PromptContext, type PromptResponse, } from './journaling-prompts.js';
export { addPersonalDate, buildSeasonalContext, detectSADPatterns, generateSeasonalContextForLLM, getCurrentSeason, getSeasonalProfile, recordSeasonalData, updateHolidayPreference, type HolidayPreference, type PersonalDate, type Season, type SeasonalContext, type SeasonalProfile, } from './seasonal-awareness.js';
export { detectStyleSignals, formatGuidanceForLLM as formatLearningGuidanceForLLM, generateDeliveryGuidance, getLearningProfile, getStyleSummary, recordAdaptationReception, recordLearningSignals, type DeliveryGuidance, type LearningProfile, type PacingStyle, type ProcessingStyle, type StyleSignal, } from './learning-style.js';
export { generateReport, getLatestReport, getReportHistory, isReportDue, recordEmotionData, recordGrowthData, recordSessionData, recordTopicData, recordWinData, type ConversationInsights, type GrowthInsights, type InsightsReport, type ReportPeriod, type ReportSummary, type WinsInsights, } from './relationship-insights.js';
export { formatSuggestionForVoice, generateSuggestions as generateMediaSuggestions, getBestSuggestion, getMediaPreferences, getSuggestionsForMood, recordSuggestionFeedback, updateMusicPreferences, type MediaPreferences, type MediaSuggestion, type MediaType, type MoodIntent, type SuggestionContext, } from './media-suggestions.js';
export { recordConversationTurn, recordJournalEntryUnified, recordMediaInteractionUnified, recordSessionEnd, recordUnifiedWin, type ConversationTurnData, type MediaInteraction, type SessionEndData, } from './unified-recorder.js';
export { clearSignalEmitter, emitBoundaryRespectedSignal, emitCallbackSignal, emitGrowthSignal, emitReadingLinesSignal, emitSmallWinSignal, emitThinkingOfYouSignal, emitTrustSignal, processContextForSignals, setSignalEmitter, trustSignalEmitter, type SignalEmitCallback, type TrustSignalPayload, type TrustSignalType, } from './trust-signal-emitter.js';
export { detectUnsaidSignalsWithVoice, type VoiceAwareContext, type VoiceEmotionSignal as VoiceAwareEmotionSignal, } from './voice-aware-detection.js';
export { clearUserThinking, detectThinkingWorthy, getAllUnsurfacedThinking, getThinkingMomentToSurface, getThinkingRecordsForPersistence, incrementSessionCount, loadThinkingRecords, markThinkingSurfaced, recordThinkingMoment, type ThinkingMoment, type ThinkingRecord, type ThinkingType, } from './between-session-thinking.js';
export { clearSessionState as clearTonalSessionState, clearTonalProfile, detectRecurringPatterns as detectTonalPatterns, getAllTopicPatterns, getBestInsight as getBestTonalInsight, getTonalDescription, getTonalProfileForPersistence, hasTonalMemory, loadTonalProfile, markInsightSurfaced as markTonalInsightSurfaced, recordTonalObservation, type TonalInsight, type TonalMemoryProfile, type TonalSignature, type TopicTonalPattern, } from './tonal-memory.js';
export { clearAllUserGrowth, clearPersonaGrowth, detectGrowthOpportunity, getAllGrowthProfiles, getGrowthMomentToShare, getPersonaGrowthForPersistence, loadPersonaGrowthProfile, markGrowthShared, recordPersonaGrowth, type GrowthMoment, type GrowthType, type PersonaGrowthProfile, type PersonaGrowthRecord, } from './persona-growth.js';
export { buildFirstTimeVulnerabilityContext, buildVulnerabilityAwarenessContext, detectFirstTimeVulnerability, firstTimeVulnerability, getHighestVulnerabilityLevel, getVulnerabilityProfile, hasSharedAboutTopic, loadVulnerabilityProfile, recordVulnerabilityShare, saveVulnerabilityProfile, type FirstTimeVulnerabilityResult, type TopicVulnerability, type VulnerabilityLevel, type VulnerabilityProfile, type VulnerabilityThreshold, } from './first-time-vulnerability.js';
export { adaptResponseStyle, buildLinguisticContext, getLinguisticProfile, getTheirWordFor, isWordAvoided, linguisticMirroring, loadLinguisticProfile, recordLinguisticPatterns, saveLinguisticProfile, type AvoidedWord, type FormalityLevel, type LinguisticProfile, type SignaturePhrase, type SpeechPatterns, } from './linguistic-mirroring.js';
export { ambientContext, analyzeAmbientAudio, buildAmbientContext, getAmbientResponse, recordAmbientSignal, type AmbientContext, type AmbientResponse, type AmbientSignal, type AmbientSignalType, type Environment, } from './ambient-context.js';
export { clearSessionState as clearCuriositySessionState, clearUserMentions, detectPassingMentions, getAllUnfollowedMentions, getCuriosityProfileForPersistence, getFollowUpOpportunity, getMentionsByType, loadCuriosityProfile, markFollowedUp, recordPassingMention, type CuriosityProfile, type FollowUpOpportunity, type MentionType, type PassingMention, } from './curiosity-memory.js';
export { clearUserTexture, compareToUsual, detectDepth, detectTone, finalizeSessionTexture, getRecentTextureSummary, getTextureProfileForPersistence, getUsualTextureSummary, loadTextureProfile, recordDepthSignal, recordMemorableMoment, recordToneSignal, recordTopics, startSessionTexture, type ConversationRhythm, type ConversationTextureProfile, type ConversationTextureSnapshot, type ConversationTone, type DepthLevel, type EnergyPattern, type TextureComparison, } from './conversation-texture.js';
declare const _default: {
    buildTrustContext: typeof buildTrustContext;
    checkResponseSafety: typeof checkResponseSafety;
};
export default _default;
//# sourceMappingURL=index.d.ts.map