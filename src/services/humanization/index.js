/**
 * Humanization Services Index
 *
 * Exports all humanization-related services for easy importing.
 */
// Core behavior management
import { PersonaBehaviorManager as _PersonaBehaviorManager, preloadAllBehaviors as _preloadAllBehaviors, } from '../persona-behavior-manager.js';
export { applyPacing, canShareVulnerability, clearBehaviorCache, getBackchannelPhrase, getCelebrationPhrase, getComfortPhrase, getComplimentPhrase, getContextualPhrase, getEmotionalResponse, getMemoryCallbackPhrase, getPacingMultiplier, getSpeechImperfection, getTimeOfDay, getVulnerabilityPhrase, loadPersonaBehaviors, PersonaBehaviorManager, preloadAllBehaviors, } from '../persona-behavior-manager.js';
// Emotion detection
import { EmotionDetectionService as _EmotionDetectionService } from '../emotion-detection.js';
export { analyzeConversationEmotion, detectEmotion, EmotionDetectionService, getResponseStyle, isUserDistressed, isUserExcited, } from '../emotion-detection.js';
// Story tracking
import { StoryTrackingService as _StoryTrackingService } from '../story-tracking.js';
export { canTellStory, clearUserStoryHistory, findStoryForContext, getContinuationStories, getPersonaStories, getStoriesTold, getStoryStats, hasStoryBeenTold, markStoryTold, registerStory, StoryTrackingService, } from '../story-tracking.js';
// Spontaneous sharing
import { SpontaneousSharingService as _SpontaneousSharingService } from '../spontaneous-sharing.js';
export { clearSharedContent, referencePetPeeve, shareGrowthEdge, shareGuiltyPleasure, shareRelationshipMoment, shareSimpleJoy, SpontaneousSharingService, surfaceEnderingContradiction, trySpontaneousShare, } from '../spontaneous-sharing.js';
// Persona modes
import { PersonaModesService as _PersonaModesService } from '../persona-modes.js';
export { applyModeModifiers, clearSessionMode, detectSuggestedMode, getCurrentMode, getModeCheckInPhrase, getModeConfig, getModeHistory, getModeTransitionPhrase, PersonaModesService, recommendModeTransition, setMode, } from '../persona-modes.js';
// Re-export relationship tracking
export { applyRelationshipUpdateToProfile, calculatePersonaRelationshipStage, canShareVulnerability as canShareVulnerabilityByRelationship, canTellStory as canTellStoryByRelationship, getPersonaRelationshipData, getMemoryCallbackPhrase as getRelationshipMemoryCallback, getRelationshipTransitionPhrase, getWarmthMultiplier, hasMinimumRelationship, } from '../per-persona-relationship.js';
// Milestone detection
import { MilestoneDetectionService as _MilestoneDetectionService } from '../milestone-detection.js';
export { checkHabitStreak, detectMilestones, getMilestoneCelebrationPhrase, markCelebrated, MilestoneDetectionService, shouldCelebrate, } from '../milestone-detection.js';
// Topic tracking
import { TopicTrackingService as _TopicTrackingService } from '../topic-tracking.js';
export { findTopicsByKeyword, getImportantTopics, getLastTopic, getOpenTopics, getRecentTopics, getTopicForProactiveMemory, markTopicResolved, TopicTrackingService, trackTopic, } from '../topic-tracking.js';
// Voice adaptation
import { VoiceAdaptationService as _VoiceAdaptationService } from '../voice/voice-adaptation.js';
export { addEmphasis, addMicroExpressions, adjustForUserEmotion, applyRate, applyPauseMultiplier as applyVoicePauseMultiplier, getConversationBreak, getPersonaVoiceProfile, insertFiller, insertThinkingSound, processVoiceContent, VoiceAdaptationService, } from '../voice/voice-adaptation.js';
// Cultural awareness
import { CulturalAwarenessService as _CulturalAwarenessService } from '../cultural-awareness.js';
export { CulturalAwarenessService, getCulturalContext, getCulturalMoment, getHolidayGreeting, getSeasonalAdjustment, getUpcomingHolidayMention, isFinanciallyRelevantDate, } from '../cultural-awareness.js';
// 🌉 Humanization Signal Emitter - Bridges backend to frontend EQ
import { humanizationSignalEmitter as _humanizationSignalEmitter } from './humanization-signal-emitter.js';
export { emitConversationRhythm, emitEmotionalArc, emitHumanizationSignal, emitMemoryCallback, humanizationSignalEmitter, initHumanizationSignalEmitter, signalAnticipation, signalBreakthrough, signalDisengagement, signalEmotionalArcPeak, signalEmotionalArcRelease, signalEvidencePresented, signalHighEngagement, signalMemoryCallback, signalMindChange, signalMoodDrift, signalPhysicalPresence, signalRelationshipMilestone, signalRunningJoke, signalSilenceMoment, signalSpontaneousThought, signalTopicWeightShift, signalVulnerability, } from './humanization-signal-emitter.js';
// ============================================================================
// 🎭 DEEP HUMANIZATION SYSTEMS - Make Ferni feel ALIVE
// ============================================================================
// Relationship Artifacts - Track shared moments, inside jokes, callbacks
import { relationshipArtifacts as _relationshipArtifacts } from './relationship-artifacts.js';
export { analyzeTurnForArtifacts, getArtifactsSummary, getBestCallback, getOrCreateArtifacts, getVocabularyToMirror, incrementTurns, markCallbackUsed, markUserUsedReferenceBack, markVocabularyMirrored, recordBreakthrough, recordInsideReference, relationshipArtifacts, updateVocabulary, } from './relationship-artifacts.js';
// Arc-Aware Behavior Selector - Choose behaviors based on emotional arc phase
import { arcAwareSelector as _arcAwareSelector } from './arc-aware-selector.js';
export { arcAwareSelector, areStoriesAppropriate, getArcBehaviorRecommendation, getPhaseGuidance, getPhasePersonality, getRecommendedResponseLength, shouldSurfaceInnerWorld, } from './arc-aware-selector.js';
// Internal Monologue - Active thoughts that may surface naturally
import { internalMonologue as _internalMonologue } from './internal-monologue.js';
export { clearMonologue, decideSurfacing, getInternalStateSummary, internalMonologue, markThoughtSurfaced, processForThoughts, } from './internal-monologue.js';
// Story Unlocks - Stories unlock based on relationship + emotional moment
import { storyUnlocks as _storyUnlocks } from './story-unlocks.js';
export { getAllStoryIds, getBestStoryForMoment, getFollowUpStories, getStoriesByDepth, getStoriesForTopic, getStoriesToldThisSession, getStoryIntroduction, getUnlockedStories, isStoryUnlocked, recordStoryTold, registerStoryUnlock, storyUnlocks, } from './story-unlocks.js';
// Vocabulary Mirroring - Learn and adopt user's language patterns
import { vocabularyMirroring as _vocabularyMirroring } from './vocabulary-mirroring.js';
export { analyzeVocabulary, generateMirrorPhrase, getMirrorOpportunities, getTopVocabulary, getUserStyle, getVocabSummary, markWordMirrored, shouldMirrorWord, vocabularyMirroring, } from './vocabulary-mirroring.js';
/**
 * Initialize all humanization services
 */
export async function initializeHumanizationServices() {
    // Preload behaviors for all personas
    await _preloadAllBehaviors();
}
/**
 * Quick access to all services
 */
export const HumanizationServices = {
    behaviors: _PersonaBehaviorManager,
    emotions: _EmotionDetectionService,
    stories: _StoryTrackingService,
    spontaneous: _SpontaneousSharingService,
    modes: _PersonaModesService,
    milestones: _MilestoneDetectionService,
    topics: _TopicTrackingService,
    voice: _VoiceAdaptationService,
    cultural: _CulturalAwarenessService,
    signalEmitter: _humanizationSignalEmitter,
    // 🎭 Deep Humanization
    artifacts: _relationshipArtifacts,
    arcSelector: _arcAwareSelector,
    monologue: _internalMonologue,
    storyUnlocks: _storyUnlocks,
    vocabulary: _vocabularyMirroring,
};
export default HumanizationServices;
//# sourceMappingURL=index.js.map