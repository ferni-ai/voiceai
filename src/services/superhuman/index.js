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
// ============================================================================
// RE-EXPORTS
// ============================================================================
// Commitment Keeper
export { commitmentKeeper, detectCommitment, saveCommitment, loadUserCommitments, updateCommitmentStatus, getFollowUpsForUser, buildCommitmentContext, } from './commitment-keeper.js';
// Superhuman Observations - "Only I Would Notice" pattern detection
export { SuperhumanObservationsEngine, getSuperhumanObservations, clearSuperhumanObservations, } from './observations.js';
// Predictive Coaching
export { predictiveCoaching, recordObservation, loadUserPatterns, generatePredictions, getDayPatterns, buildPredictiveContextString, } from './predictive-coaching.js';
// Life Narrative
export { lifeNarrative, detectChapterMoment, loadUserChapters, createOrUpdateChapter, loadIdentity, recordIdentityShift, identifyNarrativeArc, buildNarrativeContextString, } from './life-narrative.js';
// Values Alignment
export { valuesAlignment, detectValue, detectConflict, loadUserValues, recordValueMention, recordConflict, buildValuesContext, } from './values-alignment.js';
// Emotional First Aid
export { emotionalFirstAid, detectCrisis, detectCrisisFromVoice, getFirstAidResponse, getVoiceInstructions, buildFirstAidContext, } from './emotional-first-aid.js';
// Relationship Network
export { relationshipNetwork, extractPerson, analyzeSentiment, loadNetwork, recordMention, findConnectionOpportunities, buildNetworkContext, } from './relationship-network.js';
// Capacity Guardian
export { capacityGuardian, detectEnergyLevel, detectOvercommitment, recordEnergyReading, loadEnergyHistory, assessBurnoutRisk, buildCapacityContext, } from './capacity-guardian.js';
// Dream Keeper
export { dreamKeeper, detectDream, loadUserDreams, recordDreamMention, findDormantDreams, buildDreamContext, } from './dream-keeper.js';
// Relationship Milestones
export { relationshipMilestones, checkAndRecordMilestones, recordSpecialMilestone, acknowledgeMilestone, buildRelationshipSummary, buildMilestoneContext, } from './relationship-milestones.js';
// Seasonal Awareness
export { seasonalAwareness, getCurrentSeason, getDaysUntilSeasonChange, detectSeasonalPattern, loadSeasonalObservations, loadPersonalDates, recordSeasonalObservation, recordPersonalDate, findUpcomingDates, buildSeasonalContext, } from './seasonal-awareness.js';
// Milestone-Calendar Coordinator (Cross-Domain)
export { findOptimalMilestoneWindows, suggestTimeBlocks, detectMilestoneConflicts, getCapacityForNewMilestone, getCoordinationContext, } from './milestone-calendar-coordinator.js';
// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================
import { buildSilenceContext } from './silence-interpreter.js';
import { buildContradictionAwarenessContext } from './contradiction-comfort.js';
import { buildTimingContext } from './perfect-timing.js';
import { buildPatternMirrorContext } from './pattern-mirror.js';
import { buildFutureSelfContext, getRecentLetter } from './future-self.js';
// V2 Better Than Human imports
import { buildVoiceBiomarkersContext, } from './voice-biomarkers.js';
import { buildMoodCalendarContext } from './mood-calendar.js';
import { buildSocialBatteryContext } from './social-battery.js';
import { buildConflictResolutionContext } from './conflict-resolution-memory.js';
import { buildProtectiveSilenceContext } from './protective-silence.js';
import { buildCalendarPrepContext, } from './calendar-prep-coaching.js';
import { buildEnergyWaveContext } from './energy-wave-mapping.js';
import { buildVocabularyContext, buildVagueEmotionContext, detectVagueEmotions, } from './emotional-vocabulary.js';
import { buildRecoveryContext } from './recovery-tracking.js';
import { buildInsideJokeContext } from './inside-joke-memory.js';
// V3 Semantic Intelligence imports
import { buildSemanticIntelligenceContext, formatSemanticIntelligenceContext, } from './semantic-intelligence/index.js';
/**
 * Build complete superhuman context for a user.
 * Use this in the main context builder to inject all capabilities.
 */
export async function buildSuperhumanContext(userId, options) {
    const { crisisSignal, relationshipStats, currentReceptivity, currentVoiceBiomarkers, upcomingCalendarEvents, currentTranscript, currentMentionedPerson, currentTopics, currentEmotion, } = options || {};
    // Build all contexts in parallel
    const [commitments, predictions, narrative, values, network, capacity, dreams, milestones, seasonal, 
    // V1 capabilities
    silence, contradiction, futureSelfLetter, 
    // V2 "Better Than Human" capabilities
    voiceBiomarkers, moodCalendar, socialBattery, conflictResolution, protectiveSilence, calendarPrep, energyWave, emotionalVocabularyBase, recoveryTracking, insideJokes, semanticIntelligenceCtx,] = await Promise.all([
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
    let crisis = null;
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
export function formatSuperhumanContextForPrompt(context) {
    const sections = [];
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
export { silenceInterpreter, analyzeSilence, recordSilenceOutcome, loadSilenceProfile, updateBaselineTolerance, buildSilenceGuidance, buildSilenceContext, shouldAnalyzeSilence, getResponsePhrase, } from './silence-interpreter.js';
// Contradiction Comfort - Hold space for opposing emotions
export { contradictionComfort, detectContradiction, recordContradiction, loadContradictionProfile, buildContradictionContext, buildContradictionAwarenessContext, getValidationPhrase, areCommonlyCoexisting, } from './contradiction-comfort.js';
// Perfect Timing Intelligence - Know when to surface topics
export { perfectTiming, detectReceptivity, recordTimingLearning, queueTopicForRightMoment, getTopicsForNow, markTopicSurfaced, isGoodTimeFor, buildTimingContext, loadTimingProfile, getTimingProfile, } from './perfect-timing.js';
// Pattern Mirror - Surface patterns users can't see
export { patternMirror, recordTopicEnergy, recordWordVoiceMismatch, recordCyclicalPattern, getPatternToSurface, markInsightSurfaced as markPatternInsightSurfaced, buildPatternMirrorContext, savePatternProfile, loadPatternProfile, getPatternProfile, } from './pattern-mirror.js';
// Future Self Letters - Project trajectory
export { futureSelf, generateFutureSelfLetter, getRecentLetter, buildFutureSelfContext, } from './future-self.js';
// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES V2 (New - Dec 2025)
// ============================================================================
// Voice Biomarkers - Wellness detection from voice patterns
export { voiceBiomarkers, analyzeVoiceBiomarkers, storeBiomarkerReading, loadBiomarkerReadings, getBiomarkerTrends, calculateStressTrajectory, buildVoiceBiomarkersContext, } from './voice-biomarkers.js';
// Mood Calendar - Predict emotional patterns
export { moodCalendar, recordMoodEntry, loadMoodEntries, detectMoodPatterns, predictMood, getMoodCalendarSummary, buildMoodCalendarContext, } from './mood-calendar.js';
// Social Battery - Know when they're "peopled out"
export { socialBattery, recordSocialEvent, loadSocialEvents, getSocialBatteryState, getSocialBatteryProfile, calculateBatteryLevel, buildSocialBatteryContext, } from './social-battery.js';
// Conflict Resolution Memory - What works in conflicts
export { conflictResolution, recordConflict as recordConflictHistory, updateConflictResolution, loadConflictHistory, analyzeConflictPattern, getAllConflictPatterns, getConflictRecommendations, buildConflictResolutionContext, } from './conflict-resolution-memory.js';
// Protective Silence - Topics to avoid
export { protectiveSilence, recordBoundary, updateBoundary, removeBoundary, loadBoundaries, checkBoundaries, inferBoundaryFromReaction, checkResponseSafety, buildProtectiveSilenceContext, } from './protective-silence.js';
// Calendar Prep Coaching - Proactive event prep
export { calendarPrepCoaching, classifyEvent, loadEventHistory, recordEventOutcome, getPrepRecommendations, buildCalendarPrepContext, } from './calendar-prep-coaching.js';
// Energy Wave Mapping - Optimal conversation times
export { energyWaveMapping, recordInteraction as recordEnergyInteraction, loadInteractions as loadEnergyInteractions, analyzeEnergyPatterns, getTimingRecommendation, buildEnergyWaveContext, } from './energy-wave-mapping.js';
// Emotional Vocabulary Expansion - Name feelings precisely
export { emotionalVocabulary, detectVagueEmotions, suggestPreciseEmotions, recordEmotionUsage, loadEmotionHistory, analyzeVocabularyProfile, buildVagueEmotionContext, buildVocabularyContext, } from './emotional-vocabulary.js';
// Recovery Time Tracking - Post-event recovery needs
export { recoveryTracking, startRecoveryTracking, markRecovered, loadRecoveryHistory, getActiveRecoveryEvents, buildRecoveryProfile, getCheckInRecommendation, buildRecoveryContext, } from './recovery-tracking.js';
// Inside Joke Memory - Shared history callbacks
export { insideJokeMemory, recordSharedMoment, loadSharedMoments, recordMomentReference, findCallbackOpportunities, detectPotentialMoment, identifyRunningGags, buildInsideJokeContext, suggestCallback, } from './inside-joke-memory.js';
// ============================================================================
// "BETTER THAN HUMAN" V3 - SEMANTIC INTELLIGENCE (Dec 2025)
// ============================================================================
// Semantic Intelligence - 6 New Capabilities
export { 
// Main entry points
semanticIntelligence, recordSemanticData, buildSemanticIntelligenceContext, formatSemanticIntelligenceContext, getSemanticIntelligenceSummary, clearSemanticIntelligenceCache, 
// Individual services
correlationMining, emotionalTrajectories, relationalSemantics, counterfactualMemory, growthFingerprint, crossSessionThreading, } from './semantic-intelligence/index.js';
// ============================================================================
// V4 JORDAN'S SUPERHUMAN PLANNING (January 2026)
// ============================================================================
// Event Pattern Memory - Perfect recall across all events
export { eventPatternMemory, recordEventOutcome as recordEventPatternOutcome, recordGuestConflict, recordRegrettedOmission, recordVendorExperience, getEventPatternInsights, buildEventPatternContext, } from './event-pattern-memory.js';
// Guest Intelligence - Permanent guest profiles
export { guestIntelligence, getGuestProfile, upsertGuestProfile, recordGuestDietary, recordGuestAccessibility, recordGuestRelationship, upsertGuestGroup, getSeatingRecommendations, getGuestListDietary, predictAttendance, getGuestListSummary, buildGuestIntelligenceContext, } from './guest-intelligence.js';
// Proactive Milestone Detector - Detect celebrations humans forget
export { proactiveMilestoneDetector, trackDate, trackQuietWin, resetQuietWin, recordLifeStageSignal, detectUpcomingMilestones, getMilestonesToCelebrate, acknowledgeMilestone as acknowledgeDetectedMilestone, getLifeStageInsights, buildMilestoneDetectorContext, } from './proactive-milestone-detector.js';
// Event Story Capture - Remember what events MEANT
export { eventStoryCapture, startStoryCapture, updateEventStory, addMeaningfulMoment, addGratitudeNote, getStoryCapturePrompts, getEventStory, findEventStory, getAllEventStories, recallEventMeaning, buildEventStoryContext, getStoriesWithUpcomingAnniversaries, } from './event-story-capture.js';
// Anticipatory Planning - See life transitions coming
export { anticipatoryPlanning, detectTransitionSignals, recordTransitionSignal, updateDemographics, getAnticipatedTransitions, markTransitionSurfaced, buildAnticipatoryPlanningContext, } from './anticipatory-planning.js';
// Celebration Balance - Track joy objectively
export { celebrationBalance, recordCelebration as recordCelebrationEvent, getCelebrationBalance, getCelebrationSuggestions, shouldPromptForCelebration, buildCelebrationBalanceContext, } from './celebration-balance.js';
// Planning Coordination - Cross-domain readiness checks
export { planningCoordination, checkPlanningReadiness, quickReadinessCheck, checkGoalAlignment, buildPlanningCoordinationContext, } from './planning-coordination.js';
// Seasonal Planning Intelligence - Cultural dates and optimal timing
export { seasonalPlanningIntelligence, getRelevantCulturalDates, getSeasonalPatterns as getSeasonalPlanningPatterns, updateCulturalBackgrounds, updatePersonalPatterns, recordEventOutcome as recordSeasonalEventOutcome, suggestOptimalTiming, checkDateConflicts, buildSeasonalPlanningContext, } from './seasonal-planning-intelligence.js';
// Post-Event Learning - Follow up and learn
export { postEventLearning, scheduleEventFollowUps, getDueFollowUps, recordLearning, getApplicableLearnings, getLearningSummary, buildPostEventLearningContext, } from './post-event-learning.js';
//# sourceMappingURL=index.js.map