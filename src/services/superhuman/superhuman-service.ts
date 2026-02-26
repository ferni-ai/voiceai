/**
 * Superhuman Context Orchestrator
 *
 * Builds and formats the unified superhuman context by orchestrating
 * all 40+ capability builders in parallel. Extracted from index.ts
 * to separate orchestration from barrel exports.
 *
 * @module services/superhuman/superhuman-service
 */

// ============================================================================
// IMPORTS - Context builders from individual capabilities
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

// V1 "Better Than Human" capabilities
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

// ============================================================================
// SUPERHUMAN CONTEXT INTERFACE
// ============================================================================

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

// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================

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

// ============================================================================
// PROMPT FORMATTER
// ============================================================================

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
