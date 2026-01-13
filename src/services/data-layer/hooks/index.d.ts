/**
 * Domain Hooks Index
 *
 * Central export for all domain-specific semantic indexing hooks.
 * Import from here to access hooks for any domain.
 *
 * @module services/data-layer/hooks
 */
export { onCommitmentChange, onBoundaryChange, onInsideJokeChange, onGrowthReflectionChange, onSmallWinChange, onThinkingOfYouChange, onReadingBetweenLinesChange, onTonalMemoryChange, onVulnerabilityMomentChange, onTrustMilestoneChange, trustHooks, } from './trust-hooks.js';
export { onDreamChange, onLifeChapterChange, onValuesAlignmentChange, onCapacityStateChange, onRelationshipMilestoneChange, onSeasonalPatternChange, onEmotionalFirstAidChange, onPredictiveInsightChange, onCommitmentKeeperChange, onRelationshipNetworkChange, onConflictMemoryChange, onRecoveryMilestoneChange, superhumanHooks, } from './superhuman-hooks.js';
export { onCalendarEventChange, onMeetingMemoryChange, onRecurringCommitmentChange, onCalendarConflictChange, onMeetingPrepChange, onAvailabilityPatternChange, onTimeBlockChange, onDeadlineChange, calendarHooks, } from './calendar-hooks.js';
export { onContactChange, onRelationshipNoteChange, onGiftIdeaChange, onImportantDateChange, onContactInteractionChange, onRelationshipHealthChange, onFamilyMemberChange, onFriendMemoryChange, onProfessionalContactChange, onCommunicationPreferenceChange, contactsHooks, } from './contacts-hooks.js';
export { onCoachingInsightChange, onBreakthroughMomentChange, onStuckPatternChange, onReframeSuggestionChange, onGrowthEdgeChange, onStrengthIdentifiedChange, onBlindSpotChange, onAccountabilityItemChange, onBehaviorChangeEntity, onMotivationInsightChange, coachingHooks, } from './coaching-hooks.js';
export { onHealthGoalChange, onWellnessCheckinChange, onSleepPatternChange, onEnergyLevelChange, onWorkoutChange, onMentalHealthNoteChange, onNutritionGoalChange, onBodyAwarenessChange, onStressTriggerChange, onRecoveryPracticeChange, onHealthSummaryChange, healthHooks, } from './health-hooks.js';
export { onConversationThreadChange, onVisualMemoryChange, onReminderChange, onCallResultChange, onFollowUpActionChange, onScheduledOutreachChange, miscHooks, } from './misc-hooks.js';
export { onMusicPreferenceChange, onBookHighlightChange, onEmotionalSongChange, onPlaylistMemoryChange, onReadingGoalChange, onPodcastInsightChange, onMoviePreferenceChange, onGamePreferenceChange, onContentRecommendationChange, onMediaMemoryChange, onReadingListChange, onCreativeMemoryChange, mediaHooks, } from './media-hooks.js';
export { onCareerGoalChange, onJobSearchChange, onSkillDevelopmentChange, onProfessionalNetworkChange, onWorkAchievementChange, onCareerReflectionChange, onWorkChallengeChange, onCareerAspirationChange, careerHooks, } from './career-hooks.js';
export { onWisdomInsightChange, onLifeLessonChange, onLifeThesisComponentChange, onValueStatementChange, onPurposeExplorationChange, onPerspectiveShiftChange, onExistentialQuestionChange, onLegacyThoughtChange, onEmotionalPatternChange, onMoodTriggerChange, onCopingStrategyChange, onJoyTriggerChange, wisdomHooks, } from './wisdom-hooks.js';
export { onNewParentChange, onEmptyNestChange, onInfidelityChange, onHealthDiagnosisChange, onJobLossChange, onSobrietyChange, onSandwichGenerationChange, onBlendedFamilyChange, onComingOutChange, onFaithTransitionChange, lifeStageHooks, } from './life-stage-hooks.js';
export { onFavoritePlaceChange, onLocationMemoryChange, onGeographicPreferenceChange, } from './location-hooks.js';
export { onPetChange, onPetHealthChange, onPetMilestoneChange } from './pets-hooks.js';
export { onVehicleChange, onHomeMaintenanceChange, onPropertyAssetChange, } from './property-hooks.js';
export { onInsurancePolicyChange, onLegalDocumentChange } from './legal-hooks.js';
export { onCrisisEpisodeChange, onSupportReceivedChange } from './crisis-hooks.js';
export { onUserCorrectionChange, onImplicitPreferenceChange } from './learning-hooks.js';
export { onOutreachAttemptChange, onOutreachResponseChange, onOutreachPreferenceChange, } from './outreach-history-hooks.js';
export { onPersonaAffinityChange, onHandoffPreferenceChange, onPersonaInteractionHistoryChange, } from './persona-hooks.js';
export { onVoiceBiomarkerChange, deindexVoiceBiomarker, onSessionSummaryChange, deindexSessionSummary, onPatternInsightChange, deindexPatternInsight, onBehavioralPatternChange, deindexBehavioralPattern, onCrossSessionThreadChange, deindexCrossSessionThread, onCorrelationInsightChange, deindexCorrelationInsight, onProtectiveMomentChange, deindexProtectiveMoment, onVoiceRecognitionChange, deindexVoiceRecognition, betterThanHumanHooks, } from './better-than-human-hooks.js';
export declare const locationHooks: {
    onFavoritePlaceChange: import("../hook-generator.js").DomainHook<import("../types.js").FavoritePlaceEntity>;
    onLocationMemoryChange: import("../hook-generator.js").DomainHook<import("../types.js").LocationMemoryEntity>;
    onGeographicPreferenceChange: import("../hook-generator.js").DomainHook<import("../types.js").GeographicPreferenceEntity>;
};
export declare const petsHooks: {
    onPetChange: import("../hook-generator.js").DomainHook<import("../types.js").PetEntity>;
    onPetHealthChange: import("../hook-generator.js").DomainHook<import("../types.js").PetHealthEntity>;
    onPetMilestoneChange: import("../hook-generator.js").DomainHook<import("../types.js").PetMilestoneEntity>;
};
export declare const propertyHooks: {
    onVehicleChange: import("../hook-generator.js").DomainHook<import("../types.js").VehicleEntity>;
    onHomeMaintenanceChange: import("../hook-generator.js").DomainHook<import("../types.js").HomeMaintenanceEntity>;
    onPropertyAssetChange: import("../hook-generator.js").DomainHook<import("../types.js").PropertyAssetEntity>;
};
export declare const legalHooks: {
    onInsurancePolicyChange: import("../hook-generator.js").DomainHook<import("../types.js").InsurancePolicyEntity>;
    onLegalDocumentChange: import("../hook-generator.js").DomainHook<import("../types.js").LegalDocumentEntity>;
};
export declare const crisisHooks: {
    onCrisisEpisodeChange: import("../hook-generator.js").DomainHook<import("../types.js").CrisisEpisodeEntity>;
    onSupportReceivedChange: import("../hook-generator.js").DomainHook<import("../types.js").SupportReceivedEntity>;
};
export declare const learningHooks: {
    onUserCorrectionChange: import("../hook-generator.js").DomainHook<import("../types.js").UserCorrectionEntity>;
    onImplicitPreferenceChange: import("../hook-generator.js").DomainHook<import("../types.js").ImplicitPreferenceEntity>;
};
export declare const outreachHistoryHooks: {
    onOutreachAttemptChange: import("../hook-generator.js").DomainHook<import("../types.js").OutreachAttemptEntity>;
    onOutreachResponseChange: import("../hook-generator.js").DomainHook<import("../types.js").OutreachResponseEntity>;
    onOutreachPreferenceChange: import("../hook-generator.js").DomainHook<import("../types.js").OutreachPreferenceEntity>;
};
export declare const personaHooks: {
    onPersonaAffinityChange: import("../hook-generator.js").DomainHook<import("../types.js").PersonaAffinityEntity>;
    onHandoffPreferenceChange: import("../hook-generator.js").DomainHook<import("../types.js").HandoffPreferenceEntity>;
    onPersonaInteractionHistoryChange: import("../hook-generator.js").DomainHook<import("../types.js").PersonaInteractionHistoryEntity>;
};
/**
 * Domain name to hooks object mapping
 * Returns the hooks object for a specific domain
 */
export declare function getDomainHooks(domain: 'trust' | 'superhuman' | 'calendar' | 'contacts' | 'coaching' | 'health' | 'media' | 'career' | 'wisdom' | 'misc' | 'better-than-human' | 'life-stage' | 'location' | 'pets' | 'property' | 'legal' | 'crisis' | 'learning' | 'outreach-history' | 'persona'): Record<string, (...args: unknown[]) => Promise<void>>;
/**
 * Get all domain names
 */
export declare function getDomainNames(): string[];
//# sourceMappingURL=index.d.ts.map