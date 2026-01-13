/**
 * Humanization Services Index
 *
 * Exports all humanization-related services for easy importing.
 */
import { preloadAllBehaviors as _preloadAllBehaviors } from '../persona-behavior-manager.js';
export { applyPacing, canShareVulnerability, clearBehaviorCache, getBackchannelPhrase, getCelebrationPhrase, getComfortPhrase, getComplimentPhrase, getContextualPhrase, getEmotionalResponse, getMemoryCallbackPhrase, getPacingMultiplier, getSpeechImperfection, getTimeOfDay, getVulnerabilityPhrase, loadPersonaBehaviors, PersonaBehaviorManager, preloadAllBehaviors, type BehaviorResult, type ConversationContext, type EmotionalContext, } from '../persona-behavior-manager.js';
export { analyzeConversationEmotion, detectEmotion, EmotionDetectionService, getResponseStyle, isUserDistressed, isUserExcited, type EmotionCategory, type EmotionResult, type EnergyLevel, } from '../emotion-detection.js';
export { canTellStory, clearUserStoryHistory, findStoryForContext, getContinuationStories, getPersonaStories, getStoriesTold, getStoryStats, hasStoryBeenTold, markStoryTold, registerStory, StoryTrackingService, type Story, type StoryResult, type StoryTellingContext, } from '../story-tracking.js';
export { clearSharedContent, referencePetPeeve, shareGrowthEdge, shareGuiltyPleasure, shareRelationshipMoment, shareSimpleJoy, SpontaneousSharingService, surfaceEnderingContradiction, trySpontaneousShare, type ShareResult, type SharingContext, } from '../spontaneous-sharing.js';
export { applyModeModifiers, clearSessionMode, detectSuggestedMode, getCurrentMode, getModeCheckInPhrase, getModeConfig, getModeHistory, getModeTransitionPhrase, PersonaModesService, recommendModeTransition, setMode, type ModeConfig, type ModeContext, type ModeTransition, type PersonaMode, } from '../persona-modes.js';
export { applyRelationshipUpdateToProfile, calculatePersonaRelationshipStage, canShareVulnerability as canShareVulnerabilityByRelationship, canTellStory as canTellStoryByRelationship, getPersonaRelationshipData, getMemoryCallbackPhrase as getRelationshipMemoryCallback, getRelationshipTransitionPhrase, getWarmthMultiplier, hasMinimumRelationship, } from '../per-persona-relationship.js';
export { checkHabitStreak, detectMilestones, getMilestoneCelebrationPhrase, markCelebrated, MilestoneDetectionService, shouldCelebrate, type Milestone, type MilestoneContext, type MilestoneType, } from '../milestone-detection.js';
export { findTopicsByKeyword, getImportantTopics, getLastTopic, getOpenTopics, getRecentTopics, getTopicForProactiveMemory, markTopicResolved, TopicTrackingService, trackTopic, type TrackedTopic, } from '../topic-tracking.js';
export { addEmphasis, addMicroExpressions, adjustForUserEmotion, applyRate, applyPauseMultiplier as applyVoicePauseMultiplier, getConversationBreak, getPersonaVoiceProfile, insertFiller, insertThinkingSound, processVoiceContent, VoiceAdaptationService, type VoiceContext, type VoiceExpression, type VoiceModifiers, } from '../voice/voice-adaptation.js';
export { CulturalAwarenessService, getCulturalContext, getCulturalMoment, getHolidayGreeting, getSeasonalAdjustment, getUpcomingHolidayMention, isFinanciallyRelevantDate, type CulturalContext, type Holiday, type Season, } from '../cultural-awareness.js';
export { emitConversationRhythm, emitEmotionalArc, emitHumanizationSignal, emitMemoryCallback, humanizationSignalEmitter, initHumanizationSignalEmitter, signalAnticipation, signalBreakthrough, signalDisengagement, signalEmotionalArcPeak, signalEmotionalArcRelease, signalEvidencePresented, signalHighEngagement, signalMemoryCallback, signalMindChange, signalMoodDrift, signalPhysicalPresence, signalRelationshipMilestone, signalRunningJoke, signalSilenceMoment, signalSpontaneousThought, signalTopicWeightShift, signalVulnerability, type ConversationRhythmPayload, type EmotionalArcPayload, type HumanizationSignalPayload, type HumanizationSignalType, type MemoryCallbackPayload, } from './humanization-signal-emitter.js';
export { analyzeTurnForArtifacts, getArtifactsSummary, getBestCallback, getOrCreateArtifacts, getVocabularyToMirror, incrementTurns, markCallbackUsed, markUserUsedReferenceBack, markVocabularyMirrored, recordBreakthrough, recordInsideReference, relationshipArtifacts, updateVocabulary, type CommunicationRhythm, type InsideReference, type RelationshipArtifacts, type SharedBreakthrough, type TurnAnalysisContext, type UserVocabulary, } from './relationship-artifacts.js';
export { arcAwareSelector, areStoriesAppropriate, getArcBehaviorRecommendation, getPhaseGuidance, getPhasePersonality, getRecommendedResponseLength, shouldSurfaceInnerWorld, type ArcBehaviorRecommendation, type PhasePersonality, } from './arc-aware-selector.js';
export { clearMonologue, decideSurfacing, getInternalStateSummary, internalMonologue, markThoughtSurfaced, processForThoughts, type ActiveThought, type MonologueContext, type SurfaceDecision, type ThoughtTrigger, type ThoughtType, } from './internal-monologue.js';
export { getAllStoryIds, getBestStoryForMoment, getFollowUpStories, getStoriesByDepth, getStoriesForTopic, getStoriesToldThisSession, getStoryIntroduction, getUnlockedStories, isStoryUnlocked, recordStoryTold, registerStoryUnlock, storyUnlocks, type StoryUnlockRequirements, type UnlockableStory, type UnlockContext, type UnlockResult, } from './story-unlocks.js';
export { analyzeVocabulary, generateMirrorPhrase, getMirrorOpportunities, getTopVocabulary, getUserStyle, getVocabSummary, markWordMirrored, shouldMirrorWord, vocabularyMirroring, type MirrorOpportunity, type VocabAnalysisContext, type VocabCategory, type VocabItem, type VocabProfile, } from './vocabulary-mirroring.js';
/**
 * Initialize all humanization services
 */
export declare function initializeHumanizationServices(): Promise<void>;
/**
 * Quick access to all services
 */
export declare const HumanizationServices: {
    behaviors: {
        load: typeof import("../persona-behavior-manager.js").loadPersonaBehaviors;
        getEmotionalResponse: typeof import("../persona-behavior-manager.js").getEmotionalResponse;
        getComfortPhrase: typeof import("../persona-behavior-manager.js").getComfortPhrase;
        getCelebrationPhrase: typeof import("../persona-behavior-manager.js").getCelebrationPhrase;
        getBackchannelPhrase: typeof import("../persona-behavior-manager.js").getBackchannelPhrase;
        getComplimentPhrase: typeof import("../persona-behavior-manager.js").getComplimentPhrase;
        getSpeechImperfection: typeof import("../persona-behavior-manager.js").getSpeechImperfection;
        getMemoryCallbackPhrase: typeof import("../persona-behavior-manager.js").getMemoryCallbackPhrase;
        getContextualPhrase: typeof import("../persona-behavior-manager.js").getContextualPhrase;
        getVulnerabilityPhrase: typeof import("../persona-behavior-manager.js").getVulnerabilityPhrase;
        getPacingMultiplier: typeof import("../persona-behavior-manager.js").getPacingMultiplier;
        applyPacing: typeof import("../persona-behavior-manager.js").applyPacing;
        clearCache: typeof import("../persona-behavior-manager.js").clearBehaviorCache;
        preload: typeof _preloadAllBehaviors;
        getTimeOfDay: typeof import("../persona-behavior-manager.js").getTimeOfDay;
        canShareVulnerability: typeof import("../persona-behavior-manager.js").canShareVulnerability;
    };
    emotions: {
        detect: typeof import("../emotion-detection.js").detectEmotion;
        isDistressed: typeof import("../emotion-detection.js").isUserDistressed;
        isExcited: typeof import("../emotion-detection.js").isUserExcited;
        getResponseStyle: typeof import("../emotion-detection.js").getResponseStyle;
        analyzeConversation: typeof import("../emotion-detection.js").analyzeConversationEmotion;
    };
    stories: {
        hasBeenTold: typeof import("../story-tracking.js").hasStoryBeenTold;
        markTold: typeof import("../story-tracking.js").markStoryTold;
        getStoriesTold: typeof import("../story-tracking.js").getStoriesTold;
        canTell: typeof import("../story-tracking.js").canTellStory;
        findForContext: typeof import("../story-tracking.js").findStoryForContext;
        getContinuations: typeof import("../story-tracking.js").getContinuationStories;
        register: typeof import("../story-tracking.js").registerStory;
        getPersonaStories: typeof import("../story-tracking.js").getPersonaStories;
        clearHistory: typeof import("../story-tracking.js").clearUserStoryHistory;
        getStats: typeof import("../story-tracking.js").getStoryStats;
        flush: typeof import("../story-tracking.js").flushStoryPersistence;
    };
    spontaneous: {
        initialize: typeof import("../spontaneous-sharing.js").initializeSpontaneousSharingPersistence;
        shutdown: typeof import("../spontaneous-sharing.js").shutdownSpontaneousSharingPersistence;
        surfaceContradiction: typeof import("../spontaneous-sharing.js").surfaceEnderingContradiction;
        shareJoy: typeof import("../spontaneous-sharing.js").shareSimpleJoy;
        referencePeeve: typeof import("../spontaneous-sharing.js").referencePetPeeve;
        shareGrowthEdge: typeof import("../spontaneous-sharing.js").shareGrowthEdge;
        shareRelationshipMoment: typeof import("../spontaneous-sharing.js").shareRelationshipMoment;
        shareGuiltyPleasure: typeof import("../spontaneous-sharing.js").shareGuiltyPleasure;
        trySpontaneousShare: typeof import("../spontaneous-sharing.js").trySpontaneousShare;
        clearSharedContent: typeof import("../spontaneous-sharing.js").clearSharedContent;
    };
    modes: {
        detect: typeof import("../persona-modes.js").detectSuggestedMode;
        getCurrent: typeof import("../persona-modes.js").getCurrentMode;
        set: typeof import("../persona-modes.js").setMode;
        getConfig: typeof import("../persona-modes.js").getModeConfig;
        getTransitionPhrase: typeof import("../persona-modes.js").getModeTransitionPhrase;
        getCheckInPhrase: typeof import("../persona-modes.js").getModeCheckInPhrase;
        recommendTransition: typeof import("../persona-modes.js").recommendModeTransition;
        applyModifiers: typeof import("../persona-modes.js").applyModeModifiers;
        clearSession: typeof import("../persona-modes.js").clearSessionMode;
        getHistory: typeof import("../persona-modes.js").getModeHistory;
    };
    milestones: {
        detect: typeof import("../milestone-detection.js").detectMilestones;
        getCelebrationPhrase: typeof import("../milestone-detection.js").getMilestoneCelebrationPhrase;
        checkStreak: typeof import("../milestone-detection.js").checkHabitStreak;
        shouldCelebrate: typeof import("../milestone-detection.js").shouldCelebrate;
        markCelebrated: typeof import("../milestone-detection.js").markCelebrated;
    };
    topics: {
        track: typeof import("../topic-tracking.js").trackTopic;
        getRecent: typeof import("../topic-tracking.js").getRecentTopics;
        getLast: typeof import("../topic-tracking.js").getLastTopic;
        getOpen: typeof import("../topic-tracking.js").getOpenTopics;
        getImportant: typeof import("../topic-tracking.js").getImportantTopics;
        findByKeyword: typeof import("../topic-tracking.js").findTopicsByKeyword;
        markResolved: typeof import("../topic-tracking.js").markTopicResolved;
        getProactiveMemory: typeof import("../topic-tracking.js").getTopicForProactiveMemory;
        loadFromProfile: typeof import("../topic-tracking.js").loadTopicsFromProfile;
        getForSaving: typeof import("../topic-tracking.js").getTopicsForSaving;
        clear: typeof import("../topic-tracking.js").clearTopicHistory;
        flush: typeof import("../topic-tracking.js").flushTopicPersistence;
        getStats: typeof import("../topic-tracking.js").getTopicTrackingStats;
        clearAll: typeof import("../topic-tracking.js").clearAllTopicHistory;
        registerWithSessionManager: typeof import("../topic-tracking.js").registerTopicTrackingWithSessionManager;
    };
    voice: {
        getProfile: typeof import("../voice/voice-adaptation.js").getPersonaVoiceProfile;
        adjustForEmotion: typeof import("../voice/voice-adaptation.js").adjustForUserEmotion;
        applyRate: typeof import("../voice/voice-adaptation.js").applyRate;
        applyPauseMultiplier: typeof import("../voice/voice-adaptation.js").applyPauseMultiplier;
        addEmphasis: typeof import("../voice/voice-adaptation.js").addEmphasis;
        insertThinkingSound: typeof import("../voice/voice-adaptation.js").insertThinkingSound;
        insertFiller: typeof import("../voice/voice-adaptation.js").insertFiller;
        addMicroExpressions: typeof import("../voice/voice-adaptation.js").addMicroExpressions;
        process: typeof import("../voice/voice-adaptation.js").processVoiceContent;
        getConversationBreak: typeof import("../voice/voice-adaptation.js").getConversationBreak;
    };
    cultural: {
        getContext: typeof import("../cultural-awareness.js").getCulturalContext;
        getHolidayGreeting: typeof import("../cultural-awareness.js").getHolidayGreeting;
        getUpcomingHolidayMention: typeof import("../cultural-awareness.js").getUpcomingHolidayMention;
        getSeasonalAdjustment: typeof import("../cultural-awareness.js").getSeasonalAdjustment;
        getCulturalMoment: typeof import("../cultural-awareness.js").getCulturalMoment;
        isFinanciallyRelevantDate: typeof import("../cultural-awareness.js").isFinanciallyRelevantDate;
        getSeason: () => import("../cultural-awareness.js").Season;
    };
    signalEmitter: {
        init: typeof import("./humanization-signal-emitter.js").initHumanizationSignalEmitter;
        setEnabled: typeof import("./humanization-signal-emitter.js").setSignalEmitterEnabled;
        emit: typeof import("./humanization-signal-emitter.js").emitHumanizationSignal;
        emitMemory: typeof import("./humanization-signal-emitter.js").emitMemoryCallback;
        emitRhythm: typeof import("./humanization-signal-emitter.js").emitConversationRhythm;
        emitArc: typeof import("./humanization-signal-emitter.js").emitEmotionalArc;
        breakthrough: typeof import("./humanization-signal-emitter.js").signalBreakthrough;
        vulnerability: typeof import("./humanization-signal-emitter.js").signalVulnerability;
        disengagement: typeof import("./humanization-signal-emitter.js").signalDisengagement;
        highEngagement: typeof import("./humanization-signal-emitter.js").signalHighEngagement;
        mindChange: typeof import("./humanization-signal-emitter.js").signalMindChange;
        memoryCallback: typeof import("./humanization-signal-emitter.js").signalMemoryCallback;
        runningJoke: typeof import("./humanization-signal-emitter.js").signalRunningJoke;
        physicalPresence: typeof import("./humanization-signal-emitter.js").signalPhysicalPresence;
        spontaneousThought: typeof import("./humanization-signal-emitter.js").signalSpontaneousThought;
        moodDrift: typeof import("./humanization-signal-emitter.js").signalMoodDrift;
        silenceMoment: typeof import("./humanization-signal-emitter.js").signalSilenceMoment;
        anticipation: typeof import("./humanization-signal-emitter.js").signalAnticipation;
        evidencePresented: typeof import("./humanization-signal-emitter.js").signalEvidencePresented;
        topicWeightShift: typeof import("./humanization-signal-emitter.js").signalTopicWeightShift;
        relationshipMilestone: typeof import("./humanization-signal-emitter.js").signalRelationshipMilestone;
        emotionalArcPeak: typeof import("./humanization-signal-emitter.js").signalEmotionalArcPeak;
        emotionalArcRelease: typeof import("./humanization-signal-emitter.js").signalEmotionalArcRelease;
        concernDetected: typeof import("./humanization-signal-emitter.js").signalConcernDetected;
        proactiveMemory: typeof import("./humanization-signal-emitter.js").signalProactiveMemory;
        voiceStateDetected: typeof import("./humanization-signal-emitter.js").signalVoiceStateDetected;
        needPredicted: typeof import("./humanization-signal-emitter.js").signalNeedPredicted;
        emotionalTrajectory: typeof import("./humanization-signal-emitter.js").signalEmotionalTrajectory;
        emotionalBondDeepen: typeof import("./humanization-signal-emitter.js").signalEmotionalBondDeepen;
        protectiveInstinct: typeof import("./humanization-signal-emitter.js").signalProtectiveInstinct;
        spontaneousDelight: typeof import("./humanization-signal-emitter.js").signalSpontaneousDelight;
        insideJokeCallback: typeof import("./humanization-signal-emitter.js").signalInsideJokeCallback;
        superhumanObservation: typeof import("./humanization-signal-emitter.js").signalSuperhumanObservation;
        visibleVulnerability: typeof import("./humanization-signal-emitter.js").signalVisibleVulnerability;
        temporalInsight: typeof import("./humanization-signal-emitter.js").signalTemporalInsight;
        metaRelationshipMoment: typeof import("./humanization-signal-emitter.js").signalMetaRelationshipMoment;
        somaticPresence: typeof import("./humanization-signal-emitter.js").signalSomaticPresence;
        anticipatoryPresence: typeof import("./humanization-signal-emitter.js").signalAnticipatoryPresence;
    };
    artifacts: {
        getOrCreate: typeof import("./relationship-artifacts.js").getOrCreateArtifacts;
        analyze: typeof import("./relationship-artifacts.js").analyzeTurnForArtifacts;
        getBestCallback: typeof import("./relationship-artifacts.js").getBestCallback;
        getVocabularyToMirror: typeof import("./relationship-artifacts.js").getVocabularyToMirror;
        recordBreakthrough: typeof import("./relationship-artifacts.js").recordBreakthrough;
        recordInsideReference: typeof import("./relationship-artifacts.js").recordInsideReference;
        updateVocabulary: typeof import("./relationship-artifacts.js").updateVocabulary;
        incrementTurns: typeof import("./relationship-artifacts.js").incrementTurns;
        markCallbackUsed: typeof import("./relationship-artifacts.js").markCallbackUsed;
        markVocabularyMirrored: typeof import("./relationship-artifacts.js").markVocabularyMirrored;
        markUserUsedReferenceBack: typeof import("./relationship-artifacts.js").markUserUsedReferenceBack;
        getSummary: typeof import("./relationship-artifacts.js").getArtifactsSummary;
        clearAll: typeof import("./relationship-artifacts.js").clearSessionArtifacts;
    };
    arcSelector: {
        getRecommendation: typeof import("./arc-aware-selector.js").getArcBehaviorRecommendation;
        getGuidance: typeof import("./arc-aware-selector.js").getPhaseGuidance;
        getPersonality: typeof import("./arc-aware-selector.js").getPhasePersonality;
        shouldSurfaceInnerWorld: typeof import("./arc-aware-selector.js").shouldSurfaceInnerWorld;
        areStoriesAppropriate: typeof import("./arc-aware-selector.js").areStoriesAppropriate;
        getRecommendedResponseLength: typeof import("./arc-aware-selector.js").getRecommendedResponseLength;
    };
    monologue: {
        process: typeof import("./internal-monologue.js").processForThoughts;
        decideSurfacing: typeof import("./internal-monologue.js").decideSurfacing;
        markSurfaced: typeof import("./internal-monologue.js").markThoughtSurfaced;
        getState: typeof import("./internal-monologue.js").getInternalStateSummary;
        clear: typeof import("./internal-monologue.js").clearMonologue;
        clearAll: typeof import("./internal-monologue.js").clearAllMonologues;
    };
    storyUnlocks: {
        getUnlocked: typeof import("./story-unlocks.js").getUnlockedStories;
        getBest: typeof import("./story-unlocks.js").getBestStoryForMoment;
        isUnlocked: typeof import("./story-unlocks.js").isStoryUnlocked;
        byDepth: typeof import("./story-unlocks.js").getStoriesByDepth;
        forTopic: typeof import("./story-unlocks.js").getStoriesForTopic;
        followUps: typeof import("./story-unlocks.js").getFollowUpStories;
        allIds: typeof import("./story-unlocks.js").getAllStoryIds;
        getIntro: typeof import("./story-unlocks.js").getStoryIntroduction;
        register: typeof import("./story-unlocks.js").registerStoryUnlock;
        recordTold: typeof import("./story-unlocks.js").recordStoryTold;
        getTold: typeof import("./story-unlocks.js").getStoriesToldThisSession;
        clearSession: typeof import("./story-unlocks.js").clearStoryProgression;
    };
    vocabulary: {
        getProfile: typeof import("./vocabulary-mirroring.js").getOrCreateProfile;
        analyze: typeof import("./vocabulary-mirroring.js").analyzeVocabulary;
        getOpportunities: typeof import("./vocabulary-mirroring.js").getMirrorOpportunities;
        generatePhrase: typeof import("./vocabulary-mirroring.js").generateMirrorPhrase;
        shouldMirror: typeof import("./vocabulary-mirroring.js").shouldMirrorWord;
        markMirrored: typeof import("./vocabulary-mirroring.js").markWordMirrored;
        getStyle: typeof import("./vocabulary-mirroring.js").getUserStyle;
        getTopVocab: typeof import("./vocabulary-mirroring.js").getTopVocabulary;
        getSummary: typeof import("./vocabulary-mirroring.js").getVocabSummary;
        clearUser: typeof import("./vocabulary-mirroring.js").clearUserProfile;
        clearAll: typeof import("./vocabulary-mirroring.js").clearAllProfiles;
    };
};
export default HumanizationServices;
//# sourceMappingURL=index.d.ts.map