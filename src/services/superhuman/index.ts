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

import { buildCommitmentContext } from './commitment-keeper.js';

import { buildPredictiveContextString } from './predictive-coaching.js';

import { buildNarrativeContextString } from './life-narrative.js';

import { buildValuesContext } from './values-alignment.js';

import { buildFirstAidContext, detectCrisis } from './emotional-first-aid.js';

import { buildNetworkContext } from './relationship-network.js';

import { buildCapacityContext } from './capacity-guardian.js';

import { buildDreamContext } from './dream-keeper.js';

import { buildMilestoneContext } from './relationship-milestones.js';

import { buildSeasonalContext } from './seasonal-awareness.js';

// V5 "Better Than Human" - Advanced Intelligence Services (January 2026)
import { buildBiometricHabitContext } from './biometric-habit-intelligence.js';
import { buildCausalInferenceContext } from './causal-inference-engine.js';
import { buildCommunicationIntelligenceContext } from './communication-intelligence-engine.js';
import { buildContemplativeContext } from './contemplative-intelligence.js';
import { buildDevelopmentalContext } from './developmental-stage-awareness.js';
import { buildFinancialPatternContext } from './financial-pattern-intelligence.js';
import { buildHabitEconomicsContext } from './habit-economics.js';
import { buildHabitOptimizationContext } from './habit-optimization-engine.js';
import { buildLifeTrajectoryContext } from './life-trajectory-simulator.js';
import { buildExperimentationContext } from './n1-experimentation-platform.js';
import { buildOrchestrationContext } from './orchestration-intelligence.js';

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Commitment Keeper
export {
  buildCommitmentContext,
  commitmentKeeper,
  detectCommitment,
  getFollowUpsForUser,
  loadUserCommitments,
  saveCommitment,
  updateCommitmentStatus,
  type Commitment,
  type CommitmentFollowUp,
  type CommitmentStatus,
  type CommitmentType,
} from './commitment-keeper.js';

// Superhuman Observations - "Only I Would Notice" pattern detection
export {
  clearSuperhumanObservations,
  getSuperhumanObservations,
  SuperhumanObservationsEngine,
  type ObservationResult,
  type ObservationType,
  type SuperhumanObservation,
} from './observations.js';

// Predictive Coaching
export {
  buildPredictiveContextString,
  generatePredictions,
  getDayPatterns,
  loadUserPatterns,
  predictiveCoaching,
  recordObservation,
  type DayPattern,
  type PatternObservation,
  type Prediction,
} from './predictive-coaching.js';

// Life Narrative
export {
  buildNarrativeContextString,
  createOrUpdateChapter,
  detectChapterMoment,
  identifyNarrativeArc,
  lifeNarrative,
  loadIdentity,
  loadUserChapters,
  recordIdentityShift,
  type ChapterType,
  type IdentityEvolution,
  type LifeChapter,
  type NarrativeArc,
} from './life-narrative.js';

// Values Alignment
export {
  buildValuesContext,
  detectConflict,
  detectValue,
  loadUserValues,
  recordConflict,
  recordValueMention,
  valuesAlignment,
  type UserValue,
  type ValueCategory,
  type ValueConflict,
} from './values-alignment.js';

// Emotional First Aid
export {
  buildFirstAidContext,
  detectCrisis,
  detectCrisisFromVoice,
  emotionalFirstAid,
  getFirstAidResponse,
  getVoiceInstructions,
  type CrisisLevel,
  type CrisisSignal,
  type FirstAidResponse,
  type GroundingTechnique,
} from './emotional-first-aid.js';

// Relationship Network
export {
  analyzeSentiment,
  buildNetworkContext,
  extractPerson,
  findConnectionOpportunities,
  loadNetwork,
  recordMention,
  relationshipNetwork,
  type ConnectionOpportunity,
  type RelationshipPerson,
  type RelationshipSentiment,
  type RelationshipType,
} from './relationship-network.js';

// Capacity Guardian
export {
  assessBurnoutRisk,
  buildCapacityContext,
  capacityGuardian,
  detectEnergyLevel,
  detectOvercommitment,
  loadEnergyHistory,
  recordEnergyReading,
  type BurnoutAssessment,
  type BurnoutRisk,
  type EnergyLevel,
  type EnergyReading,
} from './capacity-guardian.js';

// Dream Keeper
export {
  buildDreamContext,
  detectDream,
  dreamKeeper,
  findDormantDreams,
  loadUserDreams,
  recordDreamMention,
  type Dream,
  type DreamReminder,
  type DreamStatus,
  type DreamType,
} from './dream-keeper.js';

// Relationship Milestones
export {
  acknowledgeMilestone,
  buildMilestoneContext,
  buildRelationshipSummary,
  checkAndRecordMilestones,
  recordSpecialMilestone,
  relationshipMilestones,
  type MilestoneType,
  type RelationshipMilestone,
  type RelationshipSummary,
} from './relationship-milestones.js';

// Seasonal Awareness
export {
  buildSeasonalContext,
  detectSeasonalPattern,
  findUpcomingDates,
  getCurrentSeason,
  getDaysUntilSeasonChange,
  loadPersonalDates,
  loadSeasonalObservations,
  recordPersonalDate,
  recordSeasonalObservation,
  seasonalAwareness,
  type PersonalDate,
  type Season,
  type SeasonalObservation,
  type SeasonalPattern,
} from './seasonal-awareness.js';

// Milestone-Calendar Coordinator (Cross-Domain)
export {
  detectMilestoneConflicts,
  findOptimalMilestoneWindows,
  getCapacityForNewMilestone,
  getCoordinationContext,
  suggestTimeBlocks,
  type CapacityAssessment,
  type MilestoneConflict,
  type MilestoneTimeBlock,
  type SimpleMilestone,
  type TimeWindow,
} from './milestone-calendar-coordinator.js';

// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================

import { buildContradictionAwarenessContext } from './contradiction-comfort.js';
import { buildFutureSelfContext, getRecentLetter } from './future-self.js';
import { buildPatternMirrorContext } from './pattern-mirror.js';
import { buildTimingContext, type ReceptivityScore } from './perfect-timing.js';
import { buildSilenceContext } from './silence-interpreter.js';

// V2 Better Than Human imports
import {
  buildCalendarPrepContext,
  type CalendarEvent as PrepCalendarEvent,
} from './calendar-prep-coaching.js';
import { buildConflictResolutionContext } from './conflict-resolution-memory.js';
import {
  buildVagueEmotionContext,
  buildVocabularyContext,
  detectVagueEmotions,
} from './emotional-vocabulary.js';
import { buildEnergyWaveContext } from './energy-wave-mapping.js';
import { buildInsideJokeContext } from './inside-joke-memory.js';
import { buildMoodCalendarContext } from './mood-calendar.js';
import { buildProtectiveSilenceContext } from './protective-silence.js';
import { buildRecoveryContext } from './recovery-tracking.js';
import { buildSocialBatteryContext } from './social-battery.js';
import {
  buildVoiceBiomarkersContext,
  type VoiceBiomarkers as CurrentVoiceBiomarkers,
} from './voice-biomarkers.js';

// V3 Semantic Intelligence imports
import {
  buildSemanticIntelligenceContext,
  formatSemanticIntelligenceContext,
} from './semantic-intelligence/index.js';

// V4 Jordan's Superhuman Planning imports
import { buildAnticipatoryPlanningContext } from './anticipatory-planning.js';
import { buildCelebrationBalanceContext } from './celebration-balance.js';
import { buildEventPatternContext } from './event-pattern-memory.js';
import { buildEventStoryContext } from './event-story-capture.js';
import { buildGuestIntelligenceContext } from './guest-intelligence.js';
import { buildPlanningCoordinationContext } from './planning-coordination.js';
import { buildPostEventLearningContext } from './post-event-learning.js';
import { buildMilestoneDetectorContext } from './proactive-milestone-detector.js';
import { buildSeasonalPlanningContext } from './seasonal-planning-intelligence.js';

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
  // "Better Than Human" V4 - Jordan's Superhuman Planning (January 2026)
  eventPatterns: string;
  guestIntelligence: string;
  milestoneDetector: string;
  eventStories: string;
  anticipatoryPlanning: string;
  celebrationBalance: string;
  planningCoordination: string;
  seasonalPlanning: string;
  postEventLearning: string;
  // "Better Than Human" V5 - Advanced Intelligence Services (January 2026)
  biometricHabit: string;
  causalInference: string;
  communicationIntelligence: string;
  contemplative: string;
  developmental: string;
  financialPattern: string;
  habitEconomics: string;
  habitOptimization: string;
  lifeTrajectory: string;
  experimentation: string;
  orchestration: string;
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
    // V4 Jordan's Superhuman Planning
    eventPatterns,
    guestIntelligence,
    milestoneDetector,
    eventStories,
    anticipatoryPlanning,
    celebrationBalance,
    planningCoordination,
    seasonalPlanning,
    postEventLearning,
    // V5 Advanced Intelligence Services
    biometricHabit,
    causalInference,
    communicationIntelligence,
    contemplative,
    developmental,
    financialPattern,
    habitEconomics,
    habitOptimization,
    lifeTrajectory,
    experimentation,
    orchestration,
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
    // V4 Jordan's Superhuman Planning (January 2026)
    buildEventPatternContext(userId),
    buildGuestIntelligenceContext(userId),
    buildMilestoneDetectorContext(userId),
    buildEventStoryContext(userId),
    buildAnticipatoryPlanningContext(userId),
    buildCelebrationBalanceContext(userId),
    buildPlanningCoordinationContext(userId),
    buildSeasonalPlanningContext(userId),
    buildPostEventLearningContext(userId),
    // V5 Advanced Intelligence Services (January 2026)
    buildBiometricHabitContext(userId),
    buildCausalInferenceContext(userId),
    buildCommunicationIntelligenceContext(userId),
    buildContemplativeContext(userId),
    buildDevelopmentalContext(userId),
    buildFinancialPatternContext(userId),
    buildHabitEconomicsContext(userId),
    buildHabitOptimizationContext(userId),
    buildLifeTrajectoryContext(userId),
    buildExperimentationContext(userId),
    buildOrchestrationContext(userId),
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
    // V4 Jordan's Superhuman Planning
    eventPatterns,
    guestIntelligence,
    milestoneDetector,
    eventStories,
    anticipatoryPlanning,
    celebrationBalance,
    planningCoordination,
    seasonalPlanning,
    postEventLearning,
    // V5 Advanced Intelligence Services
    biometricHabit,
    causalInference,
    communicationIntelligence,
    contemplative,
    developmental,
    financialPattern,
    habitEconomics,
    habitOptimization,
    lifeTrajectory,
    experimentation,
    orchestration,
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

    // V4 Jordan's Superhuman Planning
    const betterThanHumanV4 = [
      context.eventPatterns,
      context.guestIntelligence,
      context.milestoneDetector,
      context.eventStories,
      context.anticipatoryPlanning,
      context.celebrationBalance,
      context.planningCoordination,
      context.seasonalPlanning,
      context.postEventLearning,
    ].filter((c) => c && c.length > 0);

    if (betterThanHumanV4.length > 0) {
      sections.push('\n[BETTER THAN HUMAN V4 - Jordan Superhuman Planning]\n');
      sections.push(...betterThanHumanV4);
    }

    // V5 Advanced Intelligence Services
    const betterThanHumanV5 = [
      context.biometricHabit,
      context.causalInference,
      context.communicationIntelligence,
      context.contemplative,
      context.developmental,
      context.financialPattern,
      context.habitEconomics,
      context.habitOptimization,
      context.lifeTrajectory,
      context.experimentation,
      context.orchestration,
    ].filter((c) => c && c.length > 0);

    if (betterThanHumanV5.length > 0) {
      sections.push('\n[BETTER THAN HUMAN V5 - Advanced Intelligence]\n');
      sections.push(...betterThanHumanV5);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES (New - Dec 2025)
// ============================================================================

// Silence Interpreter - Understand different types of silence
export {
  analyzeSilence,
  buildSilenceContext,
  buildSilenceGuidance,
  getResponsePhrase,
  loadSilenceProfile,
  recordSilenceOutcome,
  shouldAnalyzeSilence,
  silenceInterpreter,
  updateBaselineTolerance,
  type SilenceAnalysis,
  type SilenceHistoryEntry,
  type SilenceProfile,
  type SilenceResponse,
  type SilenceType,
} from './silence-interpreter.js';

// Contradiction Comfort - Hold space for opposing emotions
export {
  areCommonlyCoexisting,
  buildContradictionAwarenessContext,
  buildContradictionContext,
  contradictionComfort,
  detectContradiction,
  getValidationPhrase,
  loadContradictionProfile,
  recordContradiction,
  type ContradictionDetection,
  type ContradictionHistory,
  type ContradictionPattern,
  type ContradictionProfile,
} from './contradiction-comfort.js';

// Perfect Timing Intelligence - Know when to surface topics
export {
  buildTimingContext,
  detectReceptivity,
  getTimingProfile,
  getTopicsForNow,
  isGoodTimeFor,
  loadTimingProfile,
  markTopicSurfaced,
  perfectTiming,
  queueTopicForRightMoment,
  recordTimingLearning,
  type CalendarPressure,
  type ConversationType,
  type GreetingTone,
  type QueuedTopic,
  type ReceptivityScore,
  type TimingIntelligence,
  type TimeWindow as TimingWindow,
} from './perfect-timing.js';

// Pattern Mirror - Surface patterns users can't see
export {
  buildPatternMirrorContext,
  getPatternProfile,
  getPatternToSurface,
  loadPatternProfile,
  markInsightSurfaced as markPatternInsightSurfaced,
  patternMirror,
  recordCyclicalPattern,
  recordTopicEnergy,
  recordWordVoiceMismatch,
  savePatternProfile,
  type CyclicalPattern,
  type FadingTopic,
  type PatternInsight,
  type PatternMirrorProfile,
  type TopicEnergy,
  type WordVoiceMismatch,
} from './pattern-mirror.js';

// Future Self Letters - Project trajectory
export {
  buildFutureSelfContext,
  futureSelf,
  generateFutureSelfLetter,
  getRecentLetter,
  type ConcerningPattern,
  type FutureSelfContext,
  type FutureSelfLetter,
  type LetterTimeframe,
  type PositivePattern,
} from './future-self.js';

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES V2 (New - Dec 2025)
// ============================================================================

// Voice Biomarkers - Wellness detection from voice patterns
export {
  analyzeVoiceBiomarkers,
  buildVoiceBiomarkersContext,
  calculateStressTrajectory,
  getBiomarkerTrends,
  loadBiomarkerReadings,
  storeBiomarkerReading,
  voiceBiomarkers,
  type VoiceAnalysisInput,
  type VoiceBiomarkers,
} from './voice-biomarkers.js';

// Mood Calendar - Predict emotional patterns
export {
  buildMoodCalendarContext,
  detectMoodPatterns,
  getMoodCalendarSummary,
  loadMoodEntries,
  moodCalendar,
  predictMood,
  recordMoodEntry,
  type MoodCalendarSummary,
  type MoodEntry,
  type MoodPattern,
  type MoodPrediction,
  type MoodType,
} from './mood-calendar.js';

// Social Battery - Know when they're "peopled out"
export {
  buildSocialBatteryContext,
  calculateBatteryLevel,
  getSocialBatteryProfile,
  getSocialBatteryState,
  loadSocialEvents,
  recordSocialEvent,
  socialBattery,
  type SocialBatteryProfile,
  type SocialBatteryState,
  type SocialEvent,
  type SocialEventType,
} from './social-battery.js';

// Conflict Resolution Memory - What works in conflicts
export {
  analyzeConflictPattern,
  buildConflictResolutionContext,
  conflictResolution,
  getAllConflictPatterns,
  getConflictRecommendations,
  loadConflictHistory,
  recordConflict as recordConflictHistory,
  updateConflictResolution,
  type ConflictOutcome,
  type ConflictPattern,
  type ConflictRecord,
  type ConflictType,
  type ResolutionApproach,
} from './conflict-resolution-memory.js';

// Protective Silence - Topics to avoid
export {
  buildProtectiveSilenceContext,
  checkBoundaries,
  checkResponseSafety,
  inferBoundaryFromReaction,
  loadBoundaries,
  protectiveSilence,
  recordBoundary,
  removeBoundary,
  updateBoundary,
  type BoundaryCategory,
  type BoundaryCheckResult,
  type BoundarySeverity,
  type ProtectiveBoundary,
} from './protective-silence.js';

// Calendar Prep Coaching - Proactive event prep
export {
  buildCalendarPrepContext,
  calendarPrepCoaching,
  classifyEvent,
  getPrepRecommendations,
  loadEventHistory,
  recordEventOutcome,
  type CalendarEvent,
  type EventType as CalendarEventType,
  type EventDifficulty,
  type EventHistory,
  type PrepCoachingSession,
  type PrepRecommendation,
} from './calendar-prep-coaching.js';

// Energy Wave Mapping - Optimal conversation times
export {
  analyzeEnergyPatterns,
  buildEnergyWaveContext,
  energyWaveMapping,
  getTimingRecommendation,
  loadInteractions as loadEnergyInteractions,
  recordInteraction as recordEnergyInteraction,
  type ConversationInteraction,
  type ConversationType as EnergyConversationType,
  type EnergyLevel as EnergyWaveLevel,
  type EnergyWaveProfile,
  type TimingRecommendation,
} from './energy-wave-mapping.js';

// Emotional Vocabulary Expansion - Name feelings precisely
export {
  analyzeVocabularyProfile,
  buildVagueEmotionContext,
  buildVocabularyContext,
  detectVagueEmotions,
  emotionalVocabulary,
  loadEmotionHistory,
  recordEmotionUsage,
  suggestPreciseEmotions,
  type EmotionalVocabularyProfile,
  type EmotionCategory,
  type EmotionUsageRecord,
  type EmotionWord,
  type VagueEmotionMapping,
} from './emotional-vocabulary.js';

// Recovery Time Tracking - Post-event recovery needs
export {
  buildRecoveryContext,
  buildRecoveryProfile,
  getActiveRecoveryEvents,
  getCheckInRecommendation,
  loadRecoveryHistory,
  markRecovered,
  recoveryTracking,
  startRecoveryTracking,
  type RecoveryCheckIn,
  type RecoveryEvent,
  type RecoveryEventType,
  type RecoveryProfile,
} from './recovery-tracking.js';

// Inside Joke Memory - Shared history callbacks
export {
  buildInsideJokeContext,
  detectPotentialMoment,
  findCallbackOpportunities,
  identifyRunningGags,
  insideJokeMemory,
  loadSharedMoments,
  recordMomentReference,
  recordSharedMoment,
  suggestCallback,
  type CallbackOpportunity,
  type SharedMoment,
  type SharedMomentType,
} from './inside-joke-memory.js';

// ============================================================================
// "BETTER THAN HUMAN" V3 - SEMANTIC INTELLIGENCE (Dec 2025)
// ============================================================================

// Semantic Intelligence - 6 New Capabilities
export {
  buildSemanticIntelligenceContext,
  clearSemanticIntelligenceCache,
  // Individual services
  correlationMining,
  counterfactualMemory,
  crossSessionThreading,
  emotionalTrajectories,
  formatSemanticIntelligenceContext,
  getSemanticIntelligenceSummary,
  growthFingerprint,
  recordSemanticData,
  relationalSemantics,
  // Main entry points
  semanticIntelligence,
  type DecisionPoint,
  type EmotionalArc,
  type RelationalNode,
  type SemanticCorrelation,
  type GrowthFingerprint as SemanticGrowthFingerprint,
  // Types
  type SemanticIntelligenceContext,
  type SemanticThread,
} from './semantic-intelligence/index.js';

// ============================================================================
// V4 JORDAN'S SUPERHUMAN PLANNING (January 2026)
// ============================================================================

// Event Pattern Memory - Perfect recall across all events
export {
  buildEventPatternContext,
  eventPatternMemory,
  getEventPatternInsights,
  recordEventOutcome as recordEventPatternOutcome,
  recordGuestConflict,
  recordRegrettedOmission,
  recordVendorExperience,
  type BudgetPattern,
  type EmotionalPattern,
  type EventOutcome,
  type EventPatternProfile,
  type GuestDynamics,
  type VendorPreference,
} from './event-pattern-memory.js';

// Guest Intelligence - Permanent guest profiles
export {
  buildGuestIntelligenceContext,
  getGuestListDietary,
  getGuestListSummary,
  getGuestProfile,
  getSeatingRecommendations,
  guestIntelligence,
  predictAttendance,
  recordGuestAccessibility,
  recordGuestDietary,
  recordGuestRelationship,
  upsertGuestGroup,
  upsertGuestProfile,
  type GuestGroup,
  type GuestIntelligenceProfile,
  type GuestProfile,
  type GuestRelationship,
  type SeatingRecommendation,
} from './guest-intelligence.js';

// Proactive Milestone Detector - Detect celebrations humans forget
export {
  acknowledgeMilestone as acknowledgeDetectedMilestone,
  buildMilestoneDetectorContext,
  detectUpcomingMilestones,
  getLifeStageInsights,
  getMilestonesToCelebrate,
  proactiveMilestoneDetector,
  recordLifeStageSignal,
  resetQuietWin,
  trackDate,
  trackQuietWin,
  type DetectedMilestone,
  type MilestoneType as DetectorMilestoneType,
  type LifeStageSignal,
  type MilestoneDetectorProfile,
  type MilestoneSignificance,
  type TrackedDate,
} from './proactive-milestone-detector.js';

// Event Story Capture - Remember what events MEANT
export {
  addGratitudeNote,
  addMeaningfulMoment,
  buildEventStoryContext,
  eventStoryCapture,
  findEventStory,
  getAllEventStories,
  getEventStory,
  getStoriesWithUpcomingAnniversaries,
  getStoryCapturePrompts,
  recallEventMeaning,
  startStoryCapture,
  updateEventStory,
  type EventStory,
  type EventStoryProfile,
  type StoryCapturePrompts,
} from './event-story-capture.js';

// Anticipatory Planning - See life transitions coming
export {
  anticipatoryPlanning,
  buildAnticipatoryPlanningContext,
  detectTransitionSignals,
  getAnticipatedTransitions,
  markTransitionSurfaced,
  recordTransitionSignal,
  updateDemographics,
  type AnticipatedMilestone,
  type AnticipatoryPlanningProfile,
  type LifeTransition,
  type TransitionPrediction,
  type TransitionSignal,
} from './anticipatory-planning.js';

// Celebration Balance - Track joy objectively
export {
  buildCelebrationBalanceContext,
  celebrationBalance,
  getCelebrationBalance,
  getCelebrationSuggestions,
  recordCelebration as recordCelebrationEvent,
  shouldPromptForCelebration,
  type CelebrationBalance,
  type CelebrationBalanceProfile,
  type CelebrationSize,
  type CelebrationType,
  type RecordedCelebration,
} from './celebration-balance.js';

// Planning Coordination - Cross-domain readiness checks
export {
  buildPlanningCoordinationContext,
  checkGoalAlignment,
  checkPlanningReadiness,
  planningCoordination,
  quickReadinessCheck,
  type CalendarCapacity,
  type EnergyAlignment,
  type FinancialReadiness,
  type LifeStageContext,
  type PlanningCoordinationProfile,
  type PlanningReadinessAssessment,
} from './planning-coordination.js';

// Seasonal Planning Intelligence - Cultural dates and optimal timing
export {
  buildSeasonalPlanningContext,
  checkDateConflicts,
  getRelevantCulturalDates,
  getSeasonalPatterns as getSeasonalPlanningPatterns,
  recordEventOutcome as recordSeasonalEventOutcome,
  seasonalPlanningIntelligence,
  suggestOptimalTiming,
  updateCulturalBackgrounds,
  updatePersonalPatterns,
  type CulturalDate,
  type PersonalSeasonalPattern,
  type SeasonalPattern as SeasonalPlanningPattern,
  type SeasonalPlanningProfile,
  type TimingRecommendation as SeasonalTimingRecommendation,
} from './seasonal-planning-intelligence.js';

// Post-Event Learning - Follow up and learn
export {
  buildPostEventLearningContext,
  getApplicableLearnings,
  getDueFollowUps,
  getLearningSummary,
  postEventLearning,
  recordLearning,
  scheduleEventFollowUps,
  type AppliedWisdom,
  type EventLearning,
  type FollowUpPrompt,
  type PostEventLearningProfile,
} from './post-event-learning.js';

// ============================================================================
// PHASE 15: RELATIONSHIP HEALTH DASHBOARD
// ============================================================================

// Relationship Health - Track relationship health and drift
export {
  calculateAllRelationshipHealth,
  calculateRelationshipHealth,
  getDriftAlerts,
  getRelationshipHealthConfig,
  getRelationshipHealthStats,
  getRelationshipsByHealthPriority,
  setRelationshipHealthConfig,
  type DriftAlert,
  type DriftRisk, // Renamed to avoid potential conflicts
  type HealthFactors, // Renamed to avoid duplicate
  type HealthTrend,
  type RelationshipHealth,
  type RelationshipHealthConfig,
  type RelationshipType as RelationshipHealthType,
  type RelationshipInteraction,
  type SuggestedAction as RelationshipSuggestedAction,
  type SentimentTrend,
} from './relationship-health.js';

// ============================================================================
// PHASE 13: COMMITMENT KEEPER E2E
// ============================================================================

// Commitment Keeper E2E - End-to-end commitment tracking
export {
  checkProgressE2E,
  detectCommitmentE2E,
  getCommitmentE2EConfig,
  getCommitmentsDueForFollowUp,
  getCommitmentStats,
  setCommitmentE2EConfig,
  type CelebrationContext,
  type CommitmentE2EConfig,
  type CommitmentE2EInput,
  type CommitmentE2EResult,
  type ProgressUpdateInput,
  type ProgressUpdateResult,
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

// ============================================================================
// V5 SUPERHUMAN PERSONA INTELLIGENCE (January 2026)
// ============================================================================

// Habit Optimization Engine - Computational Behavior Science for Maya
export {
  analyzeHabitCascade,
  buildHabitOptimizationContext,
  calculateFoggScore,
  calculateOptimalWindows,
  classifyMotivationType,
  detectChronotype,
  generateImplementationIntention,
  habitOptimizationEngine,
  identifyKeystoneHabits,
  loadHabitProfile,
  loadImplementationIntentions,
  recordIntentionExecution,
  saveHabitProfile,
  saveImplementationIntention,
  type CascadeStrength,
  type ChronotypeProfile,
  type FoggBehaviorScore,
  type HabitCascade,
  type HabitDifficulty,
  type HabitOptimizationContext,
  type ImplementationIntention,
  type MotivationType,
  type OptimalHabitWindow,
  type UserHabit,
  type UserHabitProfile,
} from './habit-optimization-engine.js';

// Habit Economics - Behavioral Economics for Habits
export {
  assessLossAversion,
  buildHabitEconomicsContext,
  calculateHabitROI,
  calculateOptimalStake,
  designDiscountingIntervention,
  habitEconomics,
  loadHabitEconomicsProfile,
  measurePresentBias,
  recommendCommitmentDevice,
  recordCommitmentOutcome,
  saveCommitmentDevice,
  saveHabitEconomicsProfile,
  suggestTemptationBundles,
  type CommitmentDevice,
  type CommitmentDeviceType,
  type DiscountingProfile,
  type HabitEconomicsProfile,
  type HabitROI,
  type LossAversionProfile,
  type TemptationBundle,
} from './habit-economics.js';

// Causal Inference Engine - Beyond Correlation for Peter
export {
  analyzeCausalRelationship,
  buildCausalGraph,
  buildCausalInferenceContext,
  causalInferenceEngine,
  generateCounterfactual,
  generateInterventionRecommendations,
  loadCausalProfile,
  loadTimeSeries,
  recordTimeSeriesData,
  saveCausalProfile,
  testGrangerCausality,
  type CausalConfidence,
  type CausalDirection,
  type CausalGraph,
  type CausalInferenceProfile,
  type CausalRelationship,
  type CounterfactualAnalysis,
  type EvidenceType,
  type InterventionRecommendation,
  type TimeSeriesDataPoint,
} from './causal-inference-engine.js';

// Communication Intelligence Engine - Computational Linguistics for Alex
export {
  analyzeAssertiveness,
  analyzeMessage,
  analyzeWarmthCompetence,
  assessFaceThreat,
  buildCommunicationIntelligenceContext,
  communicationIntelligenceEngine,
  detectGottmanPatterns,
  loadCommunicationProfile,
  predictResponse,
  recordCommunicationOutcome,
  saveCommunicationProfile,
  translateToNVC,
  type AssertivenessLevel,
  type CommunicationIntelligenceProfile,
  type CommunicationStyle,
  type FaceType,
  type GottmanHorseman,
  type MessageAnalysis,
  type NVCComponent,
  type RelationshipCommunicationProfile,
} from './communication-intelligence-engine.js';

// Contemplative Intelligence - Wisdom Development for Nayan
export {
  assessMindfulness,
  assessPsychologicalFlexibility,
  assessSelfCompassion,
  assessWisdom,
  buildContemplativeContext,
  contemplativeIntelligence,
  getDefusionTechnique,
  getSelfCompassionPhrases,
  loadContemplativeProfile,
  recommendMindfulnessPractices,
  recordPractice,
  saveContemplativeProfile,
  type ACTProcess,
  type ContemplativeAssessment,
  type ContemplativeProfile,
  type GrowthTrajectory,
  type MindfulnessAssessment,
  type MindfulnessFacet,
  type PsychologicalFlexibilityProfile,
  type SelfCompassionAssessment,
  type SelfCompassionDimension,
  type WisdomAssessment,
  type WisdomDimension,
} from './contemplative-intelligence.js';

// Life Trajectory Simulator - Decision Science for Jordan
export {
  analyzeRegretMinimization,
  buildLifeTrajectoryContext,
  calculateOptimalStopPoint,
  detectLifeChapterTransition,
  identifyFreshStarts,
  lifeTrajectorySimulator,
  loadTrajectoryProfile,
  optimizeForPeakEnd,
  runMonteCarloSimulation,
  saveSimulation,
  saveTrajectoryProfile,
  type FreshStartEffect,
  type LifeDecisionCategory,
  type LifeScenario,
  type LifeTrajectoryProfile,
  type PeakEndOptimization,
  type RegretMinimizationAnalysis,
  type ScenarioOutcome,
  type SimulationResult,
  type TemporalLandmark,
  type TemporalLandmarkType,
} from './life-trajectory-simulator.js';

// Orchestration Intelligence - Team Coordination for Ferni
export {
  analyzeConversationArc,
  assessMIFidelity,
  assessRogerianConditions,
  assessSessionQuality,
  assessTherapeuticAlliance,
  buildOrchestrationContext,
  generateAllianceRepair,
  loadOrchestrationProfile,
  orchestrationIntelligence,
  recordSessionQuality,
  routeToPersona,
  saveOrchestrationProfile,
  shouldHandoff,
  type AllianceComponent,
  type ConversationArc,
  type EmotionalState,
  type MIFidelity,
  type OrchestrationProfile,
  type PersonaId,
  type PersonaRouting,
  type RogerianConditions,
  type SessionDepth,
  type SessionQuality,
  type TherapeuticAllianceScore,
  type TopicDomain,
} from './orchestration-intelligence.js';

// Biometric Habit Intelligence - Physiological Data Integration
export {
  analyzeHabitBiometricCorrelation,
  biometricHabitIntelligence,
  buildBiometricHabitContext,
  calculateReadiness,
  generateRecoveryAwareSchedule,
  loadBiometricProfile,
  normalizeAppleHealthData,
  normalizeOuraData,
  normalizeWhoopData,
  saveBiometricProfile,
  saveBiometricReading,
  type BiometricProfile,
  type BiometricReading,
  type BiometricSource,
  type HabitBiometricCorrelation,
  type ReadinessLevel,
  type RecoveryAwareSchedule,
  type SleepStage,
} from './biometric-habit-intelligence.js';

// Financial Pattern Intelligence - Behavioral Finance Analysis
export {
  analyzeSpendingPatterns,
  analyzeValuesAlignment,
  buildFinancialPatternContext,
  calculateFinancialHealthScore,
  detectBehavioralBiases,
  detectEmotionalSpending,
  financialPatternIntelligence,
  loadFinancialProfile,
  saveFinancialProfile,
  type BehavioralBias,
  type BehavioralFinanceProfile,
  type EmotionalSpendingTrigger,
  type FinancialHealthScore,
  type FinancialProfile,
  type SpendingCategory,
  type SpendingPattern,
  type Transaction,
  type ValuesAlignmentAnalysis,
} from './financial-pattern-intelligence.js';

// N=1 Experimentation Platform - Personal Science
export {
  analyzeExperiment,
  buildExperimentationContext,
  designExperiment,
  generateDailyCheckIn,
  loadExperimentationProfile,
  n1ExperimentationPlatform,
  recordDataPoint,
  saveExperiment,
  saveExperimentationProfile,
  type DataPoint,
  type ExperimentationProfile,
  type ExperimentDesign,
  type ExperimentDesignSpec,
  type ExperimentPhase,
  type ExperimentResults,
  type ExperimentStatus,
  type ExperimentVariable,
  type MeasurementType,
} from './n1-experimentation-platform.js';

// Developmental Stage Awareness - Age-Appropriate Wisdom
export {
  assessEriksonStage,
  assessKeganStage,
  assessSpiralStage,
  buildDevelopmentalContext,
  developmentalStageAwareness,
  generateCommunicationGuidelines,
  generateDevelopmentalIntervention,
  identifyGrowthEdges,
  loadDevelopmentalProfile,
  saveDevelopmentalProfile,
  type DevelopmentalIntervention,
  type DevelopmentalProfile,
  type EriksonStage,
  type KeganStage,
  type SpiralStage,
  type StageIndicator,
} from './developmental-stage-awareness.js';
