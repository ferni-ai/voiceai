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

// ============================================================================
// IMPORTS FOR INTERNAL USE
// ============================================================================

import { buildCommitmentContext, detectCommitment } from './commitment-keeper.js';

import { buildPredictiveContextString } from './predictive-coaching.js';

import { buildNarrativeContextString } from './life-narrative.js';

import { buildValuesContext } from './values-alignment.js';

import { buildFirstAidContext, detectCrisis, type CrisisSignal } from './emotional-first-aid.js';

import { buildNetworkContext } from './relationship-network.js';

import { buildCapacityContext } from './capacity-guardian.js';

import { buildDreamContext } from './dream-keeper.js';

import { buildMilestoneContext } from './relationship-milestones.js';

import { buildSeasonalContext } from './seasonal-awareness.js';

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Commitment Keeper
export {
  commitmentKeeper,
  detectCommitment,
  saveCommitment,
  loadUserCommitments,
  updateCommitmentStatus,
  getFollowUpsForUser,
  buildCommitmentContext,
  type Commitment,
  type CommitmentType,
  type CommitmentStatus,
  type CommitmentFollowUp,
} from './commitment-keeper.js';

// Superhuman Observations - "Only I Would Notice" pattern detection
export {
  SuperhumanObservationsEngine,
  getSuperhumanObservations,
  clearSuperhumanObservations,
  type ObservationType,
  type SuperhumanObservation,
  type ObservationResult,
} from './observations.js';

// Predictive Coaching
export {
  predictiveCoaching,
  recordObservation,
  loadUserPatterns,
  generatePredictions,
  getDayPatterns,
  buildPredictiveContextString,
  type PatternObservation,
  type Prediction,
  type DayPattern,
} from './predictive-coaching.js';

// Life Narrative
export {
  lifeNarrative,
  detectChapterMoment,
  loadUserChapters,
  createOrUpdateChapter,
  loadIdentity,
  recordIdentityShift,
  identifyNarrativeArc,
  buildNarrativeContextString,
  type LifeChapter,
  type ChapterType,
  type NarrativeArc,
  type IdentityEvolution,
} from './life-narrative.js';

// Values Alignment
export {
  valuesAlignment,
  detectValue,
  detectConflict,
  loadUserValues,
  recordValueMention,
  recordConflict,
  buildValuesContext,
  type UserValue,
  type ValueCategory,
  type ValueConflict,
} from './values-alignment.js';

// Emotional First Aid
export {
  emotionalFirstAid,
  detectCrisis,
  detectCrisisFromVoice,
  getFirstAidResponse,
  getVoiceInstructions,
  buildFirstAidContext,
  type CrisisLevel,
  type CrisisSignal,
  type FirstAidResponse,
  type GroundingTechnique,
} from './emotional-first-aid.js';

// Relationship Network
export {
  relationshipNetwork,
  extractPerson,
  analyzeSentiment,
  loadNetwork,
  recordMention,
  findConnectionOpportunities,
  buildNetworkContext,
  type RelationshipPerson,
  type RelationshipType,
  type RelationshipSentiment,
  type ConnectionOpportunity,
} from './relationship-network.js';

// Capacity Guardian
export {
  capacityGuardian,
  detectEnergyLevel,
  detectOvercommitment,
  recordEnergyReading,
  loadEnergyHistory,
  assessBurnoutRisk,
  buildCapacityContext,
  type EnergyLevel,
  type EnergyReading,
  type BurnoutRisk,
  type BurnoutAssessment,
} from './capacity-guardian.js';

// Dream Keeper
export {
  dreamKeeper,
  detectDream,
  loadUserDreams,
  recordDreamMention,
  findDormantDreams,
  buildDreamContext,
  type Dream,
  type DreamType,
  type DreamStatus,
  type DreamReminder,
} from './dream-keeper.js';

// Relationship Milestones
export {
  relationshipMilestones,
  checkAndRecordMilestones,
  recordSpecialMilestone,
  acknowledgeMilestone,
  buildRelationshipSummary,
  buildMilestoneContext,
  type RelationshipMilestone,
  type MilestoneType,
  type RelationshipSummary,
} from './relationship-milestones.js';

// Seasonal Awareness
export {
  seasonalAwareness,
  getCurrentSeason,
  getDaysUntilSeasonChange,
  detectSeasonalPattern,
  loadSeasonalObservations,
  loadPersonalDates,
  recordSeasonalObservation,
  recordPersonalDate,
  findUpcomingDates,
  buildSeasonalContext,
  type Season,
  type SeasonalPattern,
  type SeasonalObservation,
  type PersonalDate,
} from './seasonal-awareness.js';

// Milestone-Calendar Coordinator (Cross-Domain)
export {
  findOptimalMilestoneWindows,
  suggestTimeBlocks,
  detectMilestoneConflicts,
  getCapacityForNewMilestone,
  getCoordinationContext,
  type TimeWindow,
  type MilestoneConflict,
  type CapacityAssessment,
  type MilestoneTimeBlock,
  type SimpleMilestone,
} from './milestone-calendar-coordinator.js';

// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================

import { buildSilenceContext } from './silence-interpreter.js';
import { buildContradictionAwarenessContext } from './contradiction-comfort.js';
import { buildTimingContext, getTimingProfile, type ReceptivityScore } from './perfect-timing.js';
import { buildPatternMirrorContext } from './pattern-mirror.js';
import { buildFutureSelfContext, getRecentLetter } from './future-self.js';

// V2 Better Than Human imports
import {
  buildVoiceBiomarkersContext,
  type VoiceBiomarkers as CurrentVoiceBiomarkers,
} from './voice-biomarkers.js';
import { buildMoodCalendarContext } from './mood-calendar.js';
import { buildSocialBatteryContext } from './social-battery.js';
import { buildConflictResolutionContext } from './conflict-resolution-memory.js';
import { buildProtectiveSilenceContext } from './protective-silence.js';
import {
  buildCalendarPrepContext,
  type CalendarEvent as PrepCalendarEvent,
} from './calendar-prep-coaching.js';
import { buildEnergyWaveContext } from './energy-wave-mapping.js';
import {
  buildVocabularyContext,
  buildVagueEmotionContext,
  detectVagueEmotions,
} from './emotional-vocabulary.js';
import { buildRecoveryContext } from './recovery-tracking.js';
import { buildInsideJokeContext } from './inside-joke-memory.js';

// V3 Semantic Intelligence imports
import {
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
  type SemanticIntelligenceContext,
} from './semantic-intelligence/index.js';

// V4 Jordan's Superhuman Planning imports
import { buildEventPatternContext } from './event-pattern-memory.js';
import { buildGuestIntelligenceContext } from './guest-intelligence.js';
import { buildMilestoneDetectorContext } from './proactive-milestone-detector.js';
import { buildEventStoryContext } from './event-story-capture.js';
import { buildAnticipatoryPlanningContext } from './anticipatory-planning.js';
import { buildCelebrationBalanceContext } from './celebration-balance.js';
import { buildPlanningCoordinationContext } from './planning-coordination.js';
import { buildSeasonalPlanningContext } from './seasonal-planning-intelligence.js';
import { buildPostEventLearningContext } from './post-event-learning.js';

export interface SuperhumanContext {
  // Original 10 capabilities
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
  // "Better Than Human" V1 (Dec 2025)
  silence: string;
  contradiction: string;
  timing: string;
  patterns: string;
  futureSelf: string;
  // "Better Than Human" V2 - 10 New Capabilities (Dec 2025)
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
  // "Better Than Human" V3 - Semantic Intelligence (Dec 2025)
  semanticIntelligence: string;
}

/**
 * Build complete superhuman context for a user.
 * Use this in the main context builder to inject all capabilities.
 */
export async function buildSuperhumanContext(
  userId: string,
  options?: {
    crisisSignal?: { type: 'text' | 'voice'; signal: string };
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
    // V3 Semantic Intelligence options
    currentTopics?: string[];
    currentEmotion?: string;
  }
): Promise<SuperhumanContext> {
  const {
    crisisSignal,
    relationshipStats,
    currentReceptivity,
    currentVoiceBiomarkers,
    upcomingCalendarEvents,
    currentTranscript,
    currentMentionedPerson,
    currentTopics,
    currentEmotion,
  } = options || {};

  // Build all contexts in parallel
  const [
    commitments,
    predictions,
    narrative,
    values,
    network,
    capacity,
    dreams,
    milestones,
    seasonal,
    // V1 capabilities
    silence,
    contradiction,
    futureSelfLetter,
    // V2 "Better Than Human" capabilities
    voiceBiomarkers,
    moodCalendar,
    socialBattery,
    conflictResolution,
    protectiveSilence,
    calendarPrep,
    energyWave,
    emotionalVocabularyBase,
    recoveryTracking,
    insideJokes,
    semanticIntelligenceCtx,
  ] = await Promise.all([
    buildCommitmentContext(userId),
    buildPredictiveContextString(userId),
    buildNarrativeContextString(userId),
    buildValuesContext(userId),
    buildNetworkContext(userId),
    buildCapacityContext(userId),
    buildDreamContext(userId),
    relationshipStats ? buildMilestoneContext(userId, relationshipStats) : Promise.resolve(''),
    buildSeasonalContext(userId),
    // V1 capability builders
    buildSilenceContext(userId),
    buildContradictionAwarenessContext(userId),
    getRecentLetter(userId),
    // V2 "Better Than Human" capability builders
    buildVoiceBiomarkersContext(userId, currentVoiceBiomarkers),
    buildMoodCalendarContext(userId),
    buildSocialBatteryContext(userId),
    buildConflictResolutionContext(userId, currentMentionedPerson),
    buildProtectiveSilenceContext(userId),
    buildCalendarPrepContext(userId, upcomingCalendarEvents),
    buildEnergyWaveContext(userId),
    buildVocabularyContext(userId),
    buildRecoveryContext(userId),
    buildInsideJokeContext(userId, currentTranscript),
    // V3 Semantic Intelligence
    buildSemanticIntelligenceContext(userId, {
      content: currentTranscript,
      topics: currentTopics,
      emotion: currentEmotion,
      personMentioned: currentMentionedPerson,
    }),
  ]);

  // Synchronous builders (don't need await)
  const timing = buildTimingContext(userId, currentReceptivity);
  const patterns = buildPatternMirrorContext(userId);
  const futureSelf = buildFutureSelfContext(futureSelfLetter);

  // Detect vague emotions in current transcript
  let emotionalVocabulary = emotionalVocabularyBase;
  if (currentTranscript) {
    const vagueEmotions = detectVagueEmotions(currentTranscript);
    if (vagueEmotions.length > 0) {
      const vagueContext = buildVagueEmotionContext(vagueEmotions);
      emotionalVocabulary = vagueContext || emotionalVocabularyBase;
    }
  }

  // Check for crisis (from passed signal or detect from context)
  let crisis: string | null = null;
  if (crisisSignal) {
    const detected = detectCrisis(crisisSignal.signal);
    if (detected) {
      crisis = buildFirstAidContext(detected);
    }
  }

  return {
    commitments,
    predictions,
    narrative,
    values,
    crisis,
    network,
    capacity,
    dreams,
    milestones,
    seasonal,
    // V1 capabilities
    silence,
    contradiction,
    timing,
    patterns,
    futureSelf,
    // V2 "Better Than Human" capabilities
    voiceBiomarkers,
    moodCalendar,
    socialBattery,
    conflictResolution,
    protectiveSilence,
    calendarPrep,
    energyWave,
    emotionalVocabulary,
    recoveryTracking,
    insideJokes,
    // V3 Semantic Intelligence
    semanticIntelligence: formatSemanticIntelligenceContext(semanticIntelligenceCtx),
  };
}

/**
 * Format superhuman context for LLM injection.
 * Prioritizes crisis context if present.
 */
export function formatSuperhumanContextForPrompt(context: SuperhumanContext): string {
  const sections: string[] = [];

  // Crisis takes priority
  if (context.crisis) {
    sections.push(context.crisis);
    sections.push('\n---\n');
  }

  // Core superhuman capabilities (original 10)
  const coreCapabilities = [
    context.commitments,
    context.predictions,
    context.narrative,
    context.values,
    context.capacity,
    context.dreams,
    context.network,
    context.seasonal,
    context.milestones,
  ].filter((c) => c && c.length > 0);

  // V1 "Better Than Human" capabilities
  const betterThanHumanV1 = [
    context.silence,
    context.contradiction,
    context.timing,
    context.patterns,
    context.futureSelf,
  ].filter((c) => c && c.length > 0);

  // V2 "Better Than Human" capabilities - 10 New!
  const betterThanHumanV2 = [
    context.voiceBiomarkers,
    context.moodCalendar,
    context.socialBattery,
    context.conflictResolution,
    context.protectiveSilence,
    context.calendarPrep,
    context.energyWave,
    context.emotionalVocabulary,
    context.recoveryTracking,
    context.insideJokes,
  ].filter((c) => c && c.length > 0);

  if (coreCapabilities.length > 0 || betterThanHumanV1.length > 0 || betterThanHumanV2.length > 0) {
    sections.push('[SUPERHUMAN CAPABILITIES ACTIVE]');
    sections.push('You have access to capabilities no human friend has.');
    sections.push('Use them wisely. Be magical, not mechanical.\n');
    sections.push(...coreCapabilities);

    if (betterThanHumanV1.length > 0) {
      sections.push('\n[BETTER THAN HUMAN V1 - Enhanced Awareness]\n');
      sections.push(...betterThanHumanV1);
    }

    if (betterThanHumanV2.length > 0) {
      sections.push('\n[BETTER THAN HUMAN V2 - Superhuman Capabilities]\n');
      sections.push(...betterThanHumanV2);
    }

    // V3 Semantic Intelligence
    if (context.semanticIntelligence && context.semanticIntelligence.length > 0) {
      sections.push('\n[BETTER THAN HUMAN V3 - Semantic Intelligence]\n');
      sections.push(context.semanticIntelligence);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES (New - Dec 2025)
// ============================================================================

// Silence Interpreter - Understand different types of silence
export {
  silenceInterpreter,
  analyzeSilence,
  recordSilenceOutcome,
  loadSilenceProfile,
  updateBaselineTolerance,
  buildSilenceGuidance,
  buildSilenceContext,
  shouldAnalyzeSilence,
  getResponsePhrase,
  type SilenceType,
  type SilenceResponse,
  type SilenceAnalysis,
  type SilenceProfile,
  type SilenceHistoryEntry,
} from './silence-interpreter.js';

// Contradiction Comfort - Hold space for opposing emotions
export {
  contradictionComfort,
  detectContradiction,
  recordContradiction,
  loadContradictionProfile,
  buildContradictionContext,
  buildContradictionAwarenessContext,
  getValidationPhrase,
  areCommonlyCoexisting,
  type ContradictionDetection,
  type ContradictionProfile,
  type ContradictionHistory,
  type ContradictionPattern,
} from './contradiction-comfort.js';

// Perfect Timing Intelligence - Know when to surface topics
export {
  perfectTiming,
  detectReceptivity,
  recordTimingLearning,
  queueTopicForRightMoment,
  getTopicsForNow,
  markTopicSurfaced,
  isGoodTimeFor,
  buildTimingContext,
  loadTimingProfile,
  getTimingProfile,
  type ReceptivityScore,
  type TimingIntelligence,
  type QueuedTopic,
  type TimeWindow as TimingWindow,
  type ConversationType,
  type CalendarPressure,
  type GreetingTone,
} from './perfect-timing.js';

// Pattern Mirror - Surface patterns users can't see
export {
  patternMirror,
  recordTopicEnergy,
  recordWordVoiceMismatch,
  recordCyclicalPattern,
  getPatternToSurface,
  markInsightSurfaced as markPatternInsightSurfaced,
  buildPatternMirrorContext,
  savePatternProfile,
  loadPatternProfile,
  getPatternProfile,
  type TopicEnergy,
  type CyclicalPattern,
  type FadingTopic,
  type WordVoiceMismatch,
  type PatternInsight,
  type PatternMirrorProfile,
} from './pattern-mirror.js';

// Future Self Letters - Project trajectory
export {
  futureSelf,
  generateFutureSelfLetter,
  getRecentLetter,
  buildFutureSelfContext,
  type FutureSelfLetter,
  type FutureSelfContext,
  type LetterTimeframe,
  type PositivePattern,
  type ConcerningPattern,
} from './future-self.js';

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES V2 (New - Dec 2025)
// ============================================================================

// Voice Biomarkers - Wellness detection from voice patterns
export {
  voiceBiomarkers,
  analyzeVoiceBiomarkers,
  storeBiomarkerReading,
  loadBiomarkerReadings,
  getBiomarkerTrends,
  calculateStressTrajectory,
  buildVoiceBiomarkersContext,
  type VoiceBiomarkers,
  type VoiceAnalysisInput,
} from './voice-biomarkers.js';

// Mood Calendar - Predict emotional patterns
export {
  moodCalendar,
  recordMoodEntry,
  loadMoodEntries,
  detectMoodPatterns,
  predictMood,
  getMoodCalendarSummary,
  buildMoodCalendarContext,
  type MoodType,
  type MoodEntry,
  type MoodPattern,
  type MoodPrediction,
  type MoodCalendarSummary,
} from './mood-calendar.js';

// Social Battery - Know when they're "peopled out"
export {
  socialBattery,
  recordSocialEvent,
  loadSocialEvents,
  getSocialBatteryState,
  getSocialBatteryProfile,
  calculateBatteryLevel,
  buildSocialBatteryContext,
  type SocialEventType,
  type SocialEvent,
  type SocialBatteryState,
  type SocialBatteryProfile,
} from './social-battery.js';

// Conflict Resolution Memory - What works in conflicts
export {
  conflictResolution,
  recordConflict as recordConflictHistory,
  updateConflictResolution,
  loadConflictHistory,
  analyzeConflictPattern,
  getAllConflictPatterns,
  getConflictRecommendations,
  buildConflictResolutionContext,
  type ConflictType,
  type ResolutionApproach,
  type ConflictOutcome,
  type ConflictRecord,
  type ConflictPattern,
} from './conflict-resolution-memory.js';

// Protective Silence - Topics to avoid
export {
  protectiveSilence,
  recordBoundary,
  updateBoundary,
  removeBoundary,
  loadBoundaries,
  checkBoundaries,
  inferBoundaryFromReaction,
  checkResponseSafety,
  buildProtectiveSilenceContext,
  type BoundarySeverity,
  type BoundaryCategory,
  type ProtectiveBoundary,
  type BoundaryCheckResult,
} from './protective-silence.js';

// Calendar Prep Coaching - Proactive event prep
export {
  calendarPrepCoaching,
  classifyEvent,
  loadEventHistory,
  recordEventOutcome,
  getPrepRecommendations,
  buildCalendarPrepContext,
  type EventDifficulty,
  type EventType as CalendarEventType,
  type CalendarEvent,
  type EventHistory,
  type PrepCoachingSession,
  type PrepRecommendation,
} from './calendar-prep-coaching.js';

// Energy Wave Mapping - Optimal conversation times
export {
  energyWaveMapping,
  recordInteraction as recordEnergyInteraction,
  loadInteractions as loadEnergyInteractions,
  analyzeEnergyPatterns,
  getTimingRecommendation,
  buildEnergyWaveContext,
  type ConversationType as EnergyConversationType,
  type EnergyLevel as EnergyWaveLevel,
  type ConversationInteraction,
  type EnergyWaveProfile,
  type TimingRecommendation,
} from './energy-wave-mapping.js';

// Emotional Vocabulary Expansion - Name feelings precisely
export {
  emotionalVocabulary,
  detectVagueEmotions,
  suggestPreciseEmotions,
  recordEmotionUsage,
  loadEmotionHistory,
  analyzeVocabularyProfile,
  buildVagueEmotionContext,
  buildVocabularyContext,
  type EmotionCategory,
  type EmotionWord,
  type VagueEmotionMapping,
  type EmotionUsageRecord,
  type EmotionalVocabularyProfile,
} from './emotional-vocabulary.js';

// Recovery Time Tracking - Post-event recovery needs
export {
  recoveryTracking,
  startRecoveryTracking,
  markRecovered,
  loadRecoveryHistory,
  getActiveRecoveryEvents,
  buildRecoveryProfile,
  getCheckInRecommendation,
  buildRecoveryContext,
  type RecoveryEventType,
  type RecoveryEvent,
  type RecoveryProfile,
  type RecoveryCheckIn,
} from './recovery-tracking.js';

// Inside Joke Memory - Shared history callbacks
export {
  insideJokeMemory,
  recordSharedMoment,
  loadSharedMoments,
  recordMomentReference,
  findCallbackOpportunities,
  detectPotentialMoment,
  identifyRunningGags,
  buildInsideJokeContext,
  suggestCallback,
  type SharedMomentType,
  type SharedMoment,
  type CallbackOpportunity,
} from './inside-joke-memory.js';

// ============================================================================
// "BETTER THAN HUMAN" V3 - SEMANTIC INTELLIGENCE (Dec 2025)
// ============================================================================

// Semantic Intelligence - 6 New Capabilities
export {
  // Main entry points
  semanticIntelligence,
  recordSemanticData,
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
  getSemanticIntelligenceSummary,
  clearSemanticIntelligenceCache,
  // Individual services
  correlationMining,
  emotionalTrajectories,
  relationalSemantics,
  counterfactualMemory,
  growthFingerprint,
  crossSessionThreading,
  // Types
  type SemanticIntelligenceContext,
  type SemanticCorrelation,
  type EmotionalArc,
  type RelationalNode,
  type DecisionPoint,
  type GrowthFingerprint as SemanticGrowthFingerprint,
  type SemanticThread,
} from './semantic-intelligence/index.js';

// ============================================================================
// V4 JORDAN'S SUPERHUMAN PLANNING (January 2026)
// ============================================================================

// Event Pattern Memory - Perfect recall across all events
export {
  eventPatternMemory,
  recordEventOutcome as recordEventPatternOutcome,
  recordGuestConflict,
  recordRegrettedOmission,
  recordVendorExperience,
  getEventPatternInsights,
  buildEventPatternContext,
  type BudgetPattern,
  type GuestDynamics,
  type EmotionalPattern,
  type VendorPreference,
  type EventOutcome,
  type EventPatternProfile,
} from './event-pattern-memory.js';

// Guest Intelligence - Permanent guest profiles
export {
  guestIntelligence,
  getGuestProfile,
  upsertGuestProfile,
  recordGuestDietary,
  recordGuestAccessibility,
  recordGuestRelationship,
  upsertGuestGroup,
  getSeatingRecommendations,
  getGuestListDietary,
  predictAttendance,
  getGuestListSummary,
  buildGuestIntelligenceContext,
  type GuestProfile,
  type GuestRelationship,
  type GuestGroup,
  type SeatingRecommendation,
  type GuestIntelligenceProfile,
} from './guest-intelligence.js';

// Proactive Milestone Detector - Detect celebrations humans forget
export {
  proactiveMilestoneDetector,
  trackDate,
  trackQuietWin,
  resetQuietWin,
  recordLifeStageSignal,
  detectUpcomingMilestones,
  getMilestonesToCelebrate,
  acknowledgeMilestone as acknowledgeDetectedMilestone,
  getLifeStageInsights,
  buildMilestoneDetectorContext,
  type MilestoneType as DetectorMilestoneType,
  type MilestoneSignificance,
  type TrackedDate,
  type DetectedMilestone,
  type LifeStageSignal,
  type MilestoneDetectorProfile,
} from './proactive-milestone-detector.js';

// Event Story Capture - Remember what events MEANT
export {
  eventStoryCapture,
  startStoryCapture,
  updateEventStory,
  addMeaningfulMoment,
  addGratitudeNote,
  getStoryCapturePrompts,
  getEventStory,
  findEventStory,
  getAllEventStories,
  recallEventMeaning,
  buildEventStoryContext,
  getStoriesWithUpcomingAnniversaries,
  type EventStory,
  type StoryCapturePrompts,
  type EventStoryProfile,
} from './event-story-capture.js';

// Anticipatory Planning - See life transitions coming
export {
  anticipatoryPlanning,
  detectTransitionSignals,
  recordTransitionSignal,
  updateDemographics,
  getAnticipatedTransitions,
  markTransitionSurfaced,
  buildAnticipatoryPlanningContext,
  type LifeTransition,
  type TransitionSignal,
  type TransitionPrediction,
  type AnticipatedMilestone,
  type AnticipatoryPlanningProfile,
} from './anticipatory-planning.js';

// Celebration Balance - Track joy objectively
export {
  celebrationBalance,
  recordCelebration as recordCelebrationEvent,
  getCelebrationBalance,
  getCelebrationSuggestions,
  shouldPromptForCelebration,
  buildCelebrationBalanceContext,
  type CelebrationType,
  type CelebrationSize,
  type RecordedCelebration,
  type CelebrationBalance,
  type CelebrationBalanceProfile,
} from './celebration-balance.js';

// Planning Coordination - Cross-domain readiness checks
export {
  planningCoordination,
  checkPlanningReadiness,
  quickReadinessCheck,
  checkGoalAlignment,
  buildPlanningCoordinationContext,
  type FinancialReadiness,
  type CalendarCapacity,
  type EnergyAlignment,
  type LifeStageContext,
  type PlanningReadinessAssessment,
  type PlanningCoordinationProfile,
} from './planning-coordination.js';

// Seasonal Planning Intelligence - Cultural dates and optimal timing
export {
  seasonalPlanningIntelligence,
  getRelevantCulturalDates,
  getSeasonalPatterns as getSeasonalPlanningPatterns,
  updateCulturalBackgrounds,
  updatePersonalPatterns,
  recordEventOutcome as recordSeasonalEventOutcome,
  suggestOptimalTiming,
  checkDateConflicts,
  buildSeasonalPlanningContext,
  type CulturalDate,
  type SeasonalPattern as SeasonalPlanningPattern,
  type PersonalSeasonalPattern,
  type TimingRecommendation as SeasonalTimingRecommendation,
  type SeasonalPlanningProfile,
} from './seasonal-planning-intelligence.js';

// Post-Event Learning - Follow up and learn
export {
  postEventLearning,
  scheduleEventFollowUps,
  getDueFollowUps,
  recordLearning,
  getApplicableLearnings,
  getLearningSummary,
  buildPostEventLearningContext,
  type EventLearning,
  type FollowUpPrompt,
  type AppliedWisdom,
  type PostEventLearningProfile,
} from './post-event-learning.js';

// ============================================================================
// PHASE 15: RELATIONSHIP HEALTH DASHBOARD
// ============================================================================

// Relationship Health - Track relationship health and drift
export {
  calculateRelationshipHealth,
  calculateAllRelationshipHealth,
  getDriftAlerts,
  getRelationshipsByHealthPriority,
  getRelationshipHealthStats,
  setRelationshipHealthConfig,
  getRelationshipHealthConfig,
  type RelationshipHealth,
  type RelationshipType as RelationshipHealthType, // Renamed to avoid duplicate
  type HealthTrend,
  type SentimentTrend,
  type DriftRisk,
  type SuggestedAction as RelationshipSuggestedAction, // Renamed to avoid potential conflicts
  type HealthFactors,
  type RelationshipInteraction,
  type DriftAlert,
  type RelationshipHealthConfig,
} from './relationship-health.js';

// ============================================================================
// PHASE 13: COMMITMENT KEEPER E2E
// ============================================================================

// Commitment Keeper E2E - End-to-end commitment tracking
export {
  detectCommitmentE2E,
  checkProgressE2E,
  getCommitmentsDueForFollowUp,
  getCommitmentStats,
  setCommitmentE2EConfig,
  getCommitmentE2EConfig,
  type CommitmentE2EInput,
  type CommitmentE2EResult,
  type ProgressUpdateInput,
  type ProgressUpdateResult,
  type CelebrationContext,
  type CommitmentE2EConfig,
} from './commitment-keeper-e2e.js';

// ============================================================================
// UNIFIED USER KNOWLEDGE (Better Than Human: Complete Knowledge)
// ============================================================================

// Unified User Knowledge - Aggregates ALL memory sources into one picture
export {
  buildUnifiedUserKnowledge,
  getUnifiedKnowledgeInjection,
  type UnifiedUserKnowledge,
} from './unified-user-knowledge.js';
