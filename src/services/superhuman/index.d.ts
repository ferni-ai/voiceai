/**
 * Superhuman Services - Better Than Human Capabilities
 *
 * These services implement capabilities that make Ferni genuinely
 * better than human support - not through artificial intelligence,
 * but through perfect memory, constant presence, and pattern recognition
 * that humans simply cannot match.
 *
 * @module services/superhuman
 */
export { commitmentKeeper, detectCommitment, saveCommitment, loadUserCommitments, updateCommitmentStatus, getFollowUpsForUser, buildCommitmentContext, type Commitment, type CommitmentType, type CommitmentStatus, type CommitmentFollowUp, } from './commitment-keeper.js';
export { SuperhumanObservationsEngine, getSuperhumanObservations, clearSuperhumanObservations, type ObservationType, type SuperhumanObservation, type ObservationResult, } from './observations.js';
export { predictiveCoaching, recordObservation, loadUserPatterns, generatePredictions, getDayPatterns, buildPredictiveContextString, type PatternObservation, type Prediction, type DayPattern, } from './predictive-coaching.js';
export { lifeNarrative, detectChapterMoment, loadUserChapters, createOrUpdateChapter, loadIdentity, recordIdentityShift, identifyNarrativeArc, buildNarrativeContextString, type LifeChapter, type ChapterType, type NarrativeArc, type IdentityEvolution, } from './life-narrative.js';
export { valuesAlignment, detectValue, detectConflict, loadUserValues, recordValueMention, recordConflict, buildValuesContext, type UserValue, type ValueCategory, type ValueConflict, } from './values-alignment.js';
export { emotionalFirstAid, detectCrisis, detectCrisisFromVoice, getFirstAidResponse, getVoiceInstructions, buildFirstAidContext, type CrisisLevel, type CrisisSignal, type FirstAidResponse, type GroundingTechnique, } from './emotional-first-aid.js';
export { relationshipNetwork, extractPerson, analyzeSentiment, loadNetwork, recordMention, findConnectionOpportunities, buildNetworkContext, type RelationshipPerson, type RelationshipType, type RelationshipSentiment, type ConnectionOpportunity, } from './relationship-network.js';
export { capacityGuardian, detectEnergyLevel, detectOvercommitment, recordEnergyReading, loadEnergyHistory, assessBurnoutRisk, buildCapacityContext, type EnergyLevel, type EnergyReading, type BurnoutRisk, type BurnoutAssessment, } from './capacity-guardian.js';
export { dreamKeeper, detectDream, loadUserDreams, recordDreamMention, findDormantDreams, buildDreamContext, type Dream, type DreamType, type DreamStatus, type DreamReminder, } from './dream-keeper.js';
export { relationshipMilestones, checkAndRecordMilestones, recordSpecialMilestone, acknowledgeMilestone, buildRelationshipSummary, buildMilestoneContext, type RelationshipMilestone, type MilestoneType, type RelationshipSummary, } from './relationship-milestones.js';
export { seasonalAwareness, getCurrentSeason, getDaysUntilSeasonChange, detectSeasonalPattern, loadSeasonalObservations, loadPersonalDates, recordSeasonalObservation, recordPersonalDate, findUpcomingDates, buildSeasonalContext, type Season, type SeasonalPattern, type SeasonalObservation, type PersonalDate, } from './seasonal-awareness.js';
export { findOptimalMilestoneWindows, suggestTimeBlocks, detectMilestoneConflicts, getCapacityForNewMilestone, getCoordinationContext, type TimeWindow, type MilestoneConflict, type CapacityAssessment, type MilestoneTimeBlock, type SimpleMilestone, } from './milestone-calendar-coordinator.js';
import { type ReceptivityScore } from './perfect-timing.js';
import { type VoiceBiomarkers as CurrentVoiceBiomarkers } from './voice-biomarkers.js';
import { type CalendarEvent as PrepCalendarEvent } from './calendar-prep-coaching.js';
export interface SuperhumanContext {
    commitments: string;
    predictions: string;
    narrative: string;
    values: string;
    crisis: string | null;
    network: string;
    capacity: string;
    dreams: string;
    milestones: string;
    seasonal: string;
    silence: string;
    contradiction: string;
    timing: string;
    patterns: string;
    futureSelf: string;
    voiceBiomarkers: string;
    moodCalendar: string;
    socialBattery: string;
    conflictResolution: string;
    protectiveSilence: string;
    calendarPrep: string;
    energyWave: string;
    emotionalVocabulary: string;
    recoveryTracking: string;
    insideJokes: string;
    semanticIntelligence: string;
}
/**
 * Build complete superhuman context for a user.
 * Use this in the main context builder to inject all capabilities.
 */
export declare function buildSuperhumanContext(userId: string, options?: {
    crisisSignal?: {
        type: 'text' | 'voice';
        signal: string;
    };
    relationshipStats?: {
        totalConversations: number;
        firstConversation: number;
        lastConversation: number;
        vulnerableMoments?: number;
        breakthroughs?: number;
    };
    currentReceptivity?: ReceptivityScore;
    currentVoiceBiomarkers?: CurrentVoiceBiomarkers;
    upcomingCalendarEvents?: PrepCalendarEvent[];
    currentTranscript?: string;
    currentMentionedPerson?: string;
    currentTopics?: string[];
    currentEmotion?: string;
}): Promise<SuperhumanContext>;
/**
 * Format superhuman context for LLM injection.
 * Prioritizes crisis context if present.
 */
export declare function formatSuperhumanContextForPrompt(context: SuperhumanContext): string;
export { silenceInterpreter, analyzeSilence, recordSilenceOutcome, loadSilenceProfile, updateBaselineTolerance, buildSilenceGuidance, buildSilenceContext, shouldAnalyzeSilence, getResponsePhrase, type SilenceType, type SilenceResponse, type SilenceAnalysis, type SilenceProfile, type SilenceHistoryEntry, } from './silence-interpreter.js';
export { contradictionComfort, detectContradiction, recordContradiction, loadContradictionProfile, buildContradictionContext, buildContradictionAwarenessContext, getValidationPhrase, areCommonlyCoexisting, type ContradictionDetection, type ContradictionProfile, type ContradictionHistory, type ContradictionPattern, } from './contradiction-comfort.js';
export { perfectTiming, detectReceptivity, recordTimingLearning, queueTopicForRightMoment, getTopicsForNow, markTopicSurfaced, isGoodTimeFor, buildTimingContext, loadTimingProfile, getTimingProfile, type ReceptivityScore, type TimingIntelligence, type QueuedTopic, type TimeWindow as TimingWindow, type ConversationType, type CalendarPressure, type GreetingTone, } from './perfect-timing.js';
export { patternMirror, recordTopicEnergy, recordWordVoiceMismatch, recordCyclicalPattern, getPatternToSurface, markInsightSurfaced as markPatternInsightSurfaced, buildPatternMirrorContext, savePatternProfile, loadPatternProfile, getPatternProfile, type TopicEnergy, type CyclicalPattern, type FadingTopic, type WordVoiceMismatch, type PatternInsight, type PatternMirrorProfile, } from './pattern-mirror.js';
export { futureSelf, generateFutureSelfLetter, getRecentLetter, buildFutureSelfContext, type FutureSelfLetter, type FutureSelfContext, type LetterTimeframe, type PositivePattern, type ConcerningPattern, } from './future-self.js';
export { voiceBiomarkers, analyzeVoiceBiomarkers, storeBiomarkerReading, loadBiomarkerReadings, getBiomarkerTrends, calculateStressTrajectory, buildVoiceBiomarkersContext, type VoiceBiomarkers, type VoiceAnalysisInput, } from './voice-biomarkers.js';
export { moodCalendar, recordMoodEntry, loadMoodEntries, detectMoodPatterns, predictMood, getMoodCalendarSummary, buildMoodCalendarContext, type MoodType, type MoodEntry, type MoodPattern, type MoodPrediction, type MoodCalendarSummary, } from './mood-calendar.js';
export { socialBattery, recordSocialEvent, loadSocialEvents, getSocialBatteryState, getSocialBatteryProfile, calculateBatteryLevel, buildSocialBatteryContext, type SocialEventType, type SocialEvent, type SocialBatteryState, type SocialBatteryProfile, } from './social-battery.js';
export { conflictResolution, recordConflict as recordConflictHistory, updateConflictResolution, loadConflictHistory, analyzeConflictPattern, getAllConflictPatterns, getConflictRecommendations, buildConflictResolutionContext, type ConflictType, type ResolutionApproach, type ConflictOutcome, type ConflictRecord, type ConflictPattern, } from './conflict-resolution-memory.js';
export { protectiveSilence, recordBoundary, updateBoundary, removeBoundary, loadBoundaries, checkBoundaries, inferBoundaryFromReaction, checkResponseSafety, buildProtectiveSilenceContext, type BoundarySeverity, type BoundaryCategory, type ProtectiveBoundary, type BoundaryCheckResult, } from './protective-silence.js';
export { calendarPrepCoaching, classifyEvent, loadEventHistory, recordEventOutcome, getPrepRecommendations, buildCalendarPrepContext, type EventDifficulty, type EventType as CalendarEventType, type CalendarEvent, type EventHistory, type PrepCoachingSession, type PrepRecommendation, } from './calendar-prep-coaching.js';
export { energyWaveMapping, recordInteraction as recordEnergyInteraction, loadInteractions as loadEnergyInteractions, analyzeEnergyPatterns, getTimingRecommendation, buildEnergyWaveContext, type ConversationType as EnergyConversationType, type EnergyLevel as EnergyWaveLevel, type ConversationInteraction, type EnergyWaveProfile, type TimingRecommendation, } from './energy-wave-mapping.js';
export { emotionalVocabulary, detectVagueEmotions, suggestPreciseEmotions, recordEmotionUsage, loadEmotionHistory, analyzeVocabularyProfile, buildVagueEmotionContext, buildVocabularyContext, type EmotionCategory, type EmotionWord, type VagueEmotionMapping, type EmotionUsageRecord, type EmotionalVocabularyProfile, } from './emotional-vocabulary.js';
export { recoveryTracking, startRecoveryTracking, markRecovered, loadRecoveryHistory, getActiveRecoveryEvents, buildRecoveryProfile, getCheckInRecommendation, buildRecoveryContext, type RecoveryEventType, type RecoveryEvent, type RecoveryProfile, type RecoveryCheckIn, } from './recovery-tracking.js';
export { insideJokeMemory, recordSharedMoment, loadSharedMoments, recordMomentReference, findCallbackOpportunities, detectPotentialMoment, identifyRunningGags, buildInsideJokeContext, suggestCallback, type SharedMomentType, type SharedMoment, type CallbackOpportunity, } from './inside-joke-memory.js';
export { semanticIntelligence, recordSemanticData, buildSemanticIntelligenceContext, formatSemanticIntelligenceContext, getSemanticIntelligenceSummary, clearSemanticIntelligenceCache, correlationMining, emotionalTrajectories, relationalSemantics, counterfactualMemory, growthFingerprint, crossSessionThreading, type SemanticIntelligenceContext, type SemanticCorrelation, type EmotionalArc, type RelationalNode, type DecisionPoint, type GrowthFingerprint as SemanticGrowthFingerprint, type SemanticThread, } from './semantic-intelligence/index.js';
export { eventPatternMemory, recordEventOutcome as recordEventPatternOutcome, recordGuestConflict, recordRegrettedOmission, recordVendorExperience, getEventPatternInsights, buildEventPatternContext, type BudgetPattern, type GuestDynamics, type EmotionalPattern, type VendorPreference, type EventOutcome, type EventPatternProfile, } from './event-pattern-memory.js';
export { guestIntelligence, getGuestProfile, upsertGuestProfile, recordGuestDietary, recordGuestAccessibility, recordGuestRelationship, upsertGuestGroup, getSeatingRecommendations, getGuestListDietary, predictAttendance, getGuestListSummary, buildGuestIntelligenceContext, type GuestProfile, type GuestRelationship, type GuestGroup, type SeatingRecommendation, type GuestIntelligenceProfile, } from './guest-intelligence.js';
export { proactiveMilestoneDetector, trackDate, trackQuietWin, resetQuietWin, recordLifeStageSignal, detectUpcomingMilestones, getMilestonesToCelebrate, acknowledgeMilestone as acknowledgeDetectedMilestone, getLifeStageInsights, buildMilestoneDetectorContext, type MilestoneType as DetectorMilestoneType, type MilestoneSignificance, type TrackedDate, type DetectedMilestone, type LifeStageSignal, type MilestoneDetectorProfile, } from './proactive-milestone-detector.js';
export { eventStoryCapture, startStoryCapture, updateEventStory, addMeaningfulMoment, addGratitudeNote, getStoryCapturePrompts, getEventStory, findEventStory, getAllEventStories, recallEventMeaning, buildEventStoryContext, getStoriesWithUpcomingAnniversaries, type EventStory, type StoryCapturePrompts, type EventStoryProfile, } from './event-story-capture.js';
export { anticipatoryPlanning, detectTransitionSignals, recordTransitionSignal, updateDemographics, getAnticipatedTransitions, markTransitionSurfaced, buildAnticipatoryPlanningContext, type LifeTransition, type TransitionSignal, type TransitionPrediction, type AnticipatedMilestone, type AnticipatoryPlanningProfile, } from './anticipatory-planning.js';
export { celebrationBalance, recordCelebration as recordCelebrationEvent, getCelebrationBalance, getCelebrationSuggestions, shouldPromptForCelebration, buildCelebrationBalanceContext, type CelebrationType, type CelebrationSize, type RecordedCelebration, type CelebrationBalance, type CelebrationBalanceProfile, } from './celebration-balance.js';
export { planningCoordination, checkPlanningReadiness, quickReadinessCheck, checkGoalAlignment, buildPlanningCoordinationContext, type FinancialReadiness, type CalendarCapacity, type EnergyAlignment, type LifeStageContext, type PlanningReadinessAssessment, type PlanningCoordinationProfile, } from './planning-coordination.js';
export { seasonalPlanningIntelligence, getRelevantCulturalDates, getSeasonalPatterns as getSeasonalPlanningPatterns, updateCulturalBackgrounds, updatePersonalPatterns, recordEventOutcome as recordSeasonalEventOutcome, suggestOptimalTiming, checkDateConflicts, buildSeasonalPlanningContext, type CulturalDate, type SeasonalPattern as SeasonalPlanningPattern, type PersonalSeasonalPattern, type TimingRecommendation as SeasonalTimingRecommendation, type SeasonalPlanningProfile, } from './seasonal-planning-intelligence.js';
export { postEventLearning, scheduleEventFollowUps, getDueFollowUps, recordLearning, getApplicableLearnings, getLearningSummary, buildPostEventLearningContext, type EventLearning, type FollowUpPrompt, type AppliedWisdom, type PostEventLearningProfile, } from './post-event-learning.js';
//# sourceMappingURL=index.d.ts.map