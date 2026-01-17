/**
 * Domain Hooks Index
 *
 * Central export for all domain-specific semantic indexing hooks.
 * Import from here to access hooks for any domain.
 *
 * @module services/data-layer/hooks
 */

// ============================================================================
// TRUST SYSTEMS
// ============================================================================
export {
  onCommitmentChange,
  onBoundaryChange,
  onInsideJokeChange,
  onGrowthReflectionChange,
  onSmallWinChange,
  onThinkingOfYouChange,
  onReadingBetweenLinesChange,
  onTonalMemoryChange,
  onVulnerabilityMomentChange,
  onTrustMilestoneChange,
  trustHooks,
} from './trust-hooks.js';

// ============================================================================
// SUPERHUMAN SERVICES
// ============================================================================
export {
  onDreamChange,
  onLifeChapterChange,
  onValuesAlignmentChange,
  onCapacityStateChange,
  onRelationshipMilestoneChange,
  onSeasonalPatternChange,
  onEmotionalFirstAidChange,
  onPredictiveInsightChange,
  onCommitmentKeeperChange,
  onRelationshipNetworkChange,
  onConflictMemoryChange,
  onRecoveryMilestoneChange,
  superhumanHooks,
} from './superhuman-hooks.js';

// ============================================================================
// CALENDAR & SCHEDULING
// ============================================================================
export {
  onCalendarEventChange,
  onMeetingMemoryChange,
  onRecurringCommitmentChange,
  onCalendarConflictChange,
  onMeetingPrepChange,
  onAvailabilityPatternChange,
  onTimeBlockChange,
  onDeadlineChange,
  calendarHooks,
} from './calendar-hooks.js';

// ============================================================================
// CONTACTS & RELATIONSHIPS
// ============================================================================
export {
  onContactChange,
  onRelationshipNoteChange,
  onGiftIdeaChange,
  onImportantDateChange,
  onContactInteractionChange,
  onRelationshipHealthChange,
  onFamilyMemberChange,
  onFriendMemoryChange,
  onProfessionalContactChange,
  onCommunicationPreferenceChange,
  contactsHooks,
} from './contacts-hooks.js';

// ============================================================================
// COACHING & GROWTH
// ============================================================================
export {
  onCoachingInsightChange,
  onBreakthroughMomentChange,
  onStuckPatternChange,
  onReframeSuggestionChange,
  onGrowthEdgeChange,
  onStrengthIdentifiedChange,
  onBlindSpotChange,
  onAccountabilityItemChange,
  onBehaviorChangeEntity,
  onMotivationInsightChange,
  coachingHooks,
} from './coaching-hooks.js';

// ============================================================================
// HEALTH & WELLNESS
// ============================================================================
export {
  onHealthGoalChange,
  onWellnessCheckinChange,
  onSleepPatternChange,
  onEnergyLevelChange,
  onWorkoutChange,
  onMentalHealthNoteChange,
  onNutritionGoalChange,
  onBodyAwarenessChange,
  onStressTriggerChange,
  onRecoveryPracticeChange,
  onHealthSummaryChange,
  healthHooks,
} from './health-hooks.js';

// ============================================================================
// MISCELLANEOUS
// ============================================================================
export {
  onConversationThreadChange,
  onVisualMemoryChange,
  onReminderChange,
  onCallResultChange,
  onFollowUpActionChange,
  onScheduledOutreachChange,
  miscHooks,
} from './misc-hooks.js';

// ============================================================================
// MEDIA & ENTERTAINMENT
// ============================================================================
export {
  onMusicPreferenceChange,
  onBookHighlightChange,
  onEmotionalSongChange,
  onPlaylistMemoryChange,
  onReadingGoalChange,
  onPodcastInsightChange,
  onMoviePreferenceChange,
  onGamePreferenceChange,
  onContentRecommendationChange,
  onMediaMemoryChange,
  onReadingListChange,
  onCreativeMemoryChange,
  mediaHooks,
} from './media-hooks.js';

// ============================================================================
// CAREER & PROFESSIONAL
// ============================================================================
export {
  onCareerGoalChange,
  onJobSearchChange,
  onSkillDevelopmentChange,
  onProfessionalNetworkChange,
  onWorkAchievementChange,
  onCareerReflectionChange,
  onWorkChallengeChange,
  onCareerAspirationChange,
  careerHooks,
} from './career-hooks.js';

// ============================================================================
// WISDOM & PHILOSOPHY
// ============================================================================
export {
  onWisdomInsightChange,
  onLifeLessonChange,
  onLifeThesisComponentChange,
  onValueStatementChange,
  onPurposeExplorationChange,
  onPerspectiveShiftChange,
  onExistentialQuestionChange,
  onLegacyThoughtChange,
  onEmotionalPatternChange,
  onMoodTriggerChange,
  onCopingStrategyChange,
  onJoyTriggerChange,
  wisdomHooks,
} from './wisdom-hooks.js';

// ============================================================================
// LIFE STAGE TRANSITIONS
// ============================================================================
export {
  onNewParentChange,
  onEmptyNestChange,
  onInfidelityChange,
  onHealthDiagnosisChange,
  onJobLossChange,
  onSobrietyChange,
  onSandwichGenerationChange,
  onBlendedFamilyChange,
  onComingOutChange,
  onFaithTransitionChange,
  lifeStageHooks,
} from './life-stage-hooks.js';

// ============================================================================
// LOCATION & PLACES
// ============================================================================
export {
  onFavoritePlaceChange,
  onLocationMemoryChange,
  onGeographicPreferenceChange,
} from './location-hooks.js';

// ============================================================================
// PETS & ANIMALS
// ============================================================================
export { onPetChange, onPetHealthChange, onPetMilestoneChange } from './pets-hooks.js';

// ============================================================================
// PROPERTY & VEHICLES
// ============================================================================
export {
  onVehicleChange,
  onHomeMaintenanceChange,
  onPropertyAssetChange,
} from './property-hooks.js';

// ============================================================================
// INSURANCE & LEGAL
// ============================================================================
export { onInsurancePolicyChange, onLegalDocumentChange } from './legal-hooks.js';

// ============================================================================
// CRISIS & SUPPORT
// ============================================================================
export { onCrisisEpisodeChange, onSupportReceivedChange } from './crisis-hooks.js';

// ============================================================================
// USER CORRECTIONS & LEARNING
// ============================================================================
export { onUserCorrectionChange, onImplicitPreferenceChange } from './learning-hooks.js';

// ============================================================================
// OUTREACH HISTORY
// ============================================================================
export {
  onOutreachAttemptChange,
  onOutreachResponseChange,
  onOutreachPreferenceChange,
} from './outreach-history-hooks.js';

// ============================================================================
// PERSONA INTERACTION
// ============================================================================
export {
  onPersonaAffinityChange,
  onHandoffPreferenceChange,
  onPersonaInteractionHistoryChange,
} from './persona-hooks.js';

// ============================================================================
// BETTER THAN HUMAN - What makes us 200%
// ============================================================================
export {
  // Voice biomarkers - "We hear what you're not saying"
  onVoiceBiomarkerChange,
  deindexVoiceBiomarker,

  // Session summaries - "We remember your whole story"
  onSessionSummaryChange,
  deindexSessionSummary,

  // Pattern insights - "We see patterns you can't see yourself"
  onPatternInsightChange,
  deindexPatternInsight,

  // Behavioral patterns - "We understand how you tick"
  onBehavioralPatternChange,
  deindexBehavioralPattern,

  // Cross-session threads - "We connect the dots across time"
  onCrossSessionThreadChange,
  deindexCrossSessionThread,

  // Correlation insights - "We find connections you'd never notice"
  onCorrelationInsightChange,
  deindexCorrelationInsight,

  // Protective moments - "We know when NOT to say something"
  onProtectiveMomentChange,
  deindexProtectiveMoment,

  // Voice recognition - "We know your voice"
  onVoiceRecognitionChange,
  deindexVoiceRecognition,
  betterThanHumanHooks,
} from './better-than-human-hooks.js';

// ============================================================================
// ALL HOOKS OBJECT
// ============================================================================

import { trustHooks } from './trust-hooks.js';
import { superhumanHooks } from './superhuman-hooks.js';
import { calendarHooks } from './calendar-hooks.js';
import { contactsHooks } from './contacts-hooks.js';
import { coachingHooks } from './coaching-hooks.js';
import { healthHooks } from './health-hooks.js';
import { mediaHooks } from './media-hooks.js';
import { careerHooks } from './career-hooks.js';
import { wisdomHooks } from './wisdom-hooks.js';
import { miscHooks } from './misc-hooks.js';
import { betterThanHumanHooks } from './better-than-human-hooks.js';
import { lifeStageHooks } from './life-stage-hooks.js';
import {
  onFavoritePlaceChange,
  onLocationMemoryChange,
  onGeographicPreferenceChange,
} from './location-hooks.js';
import { onPetChange, onPetHealthChange, onPetMilestoneChange } from './pets-hooks.js';
import {
  onVehicleChange,
  onHomeMaintenanceChange,
  onPropertyAssetChange,
} from './property-hooks.js';
import { onInsurancePolicyChange, onLegalDocumentChange } from './legal-hooks.js';
import { onCrisisEpisodeChange, onSupportReceivedChange } from './crisis-hooks.js';
import { onUserCorrectionChange, onImplicitPreferenceChange } from './learning-hooks.js';
import {
  onOutreachAttemptChange,
  onOutreachResponseChange,
  onOutreachPreferenceChange,
} from './outreach-history-hooks.js';
import {
  onPersonaAffinityChange,
  onHandoffPreferenceChange,
  onPersonaInteractionHistoryChange,
} from './persona-hooks.js';

// Grouped hooks objects for new domains
export const locationHooks = {
  onFavoritePlaceChange,
  onLocationMemoryChange,
  onGeographicPreferenceChange,
};

export const petsHooks = {
  onPetChange,
  onPetHealthChange,
  onPetMilestoneChange,
};

export const propertyHooks = {
  onVehicleChange,
  onHomeMaintenanceChange,
  onPropertyAssetChange,
};

export const legalHooks = {
  onInsurancePolicyChange,
  onLegalDocumentChange,
};

export const crisisHooks = {
  onCrisisEpisodeChange,
  onSupportReceivedChange,
};

export const learningHooks = {
  onUserCorrectionChange,
  onImplicitPreferenceChange,
};

export const outreachHistoryHooks = {
  onOutreachAttemptChange,
  onOutreachResponseChange,
  onOutreachPreferenceChange,
};

export const personaHooks = {
  onPersonaAffinityChange,
  onHandoffPreferenceChange,
  onPersonaInteractionHistoryChange,
};

/**
 * Domain name to hooks object mapping
 * Returns the hooks object for a specific domain
 */
export function getDomainHooks(
  domain:
    | 'trust'
    | 'superhuman'
    | 'calendar'
    | 'contacts'
    | 'coaching'
    | 'health'
    | 'media'
    | 'career'
    | 'wisdom'
    | 'misc'
    | 'better-than-human'
    | 'life-stage'
    | 'location'
    | 'pets'
    | 'property'
    | 'legal'
    | 'crisis'
    | 'learning'
    | 'outreach-history'
    | 'persona'
): Record<string, (...args: unknown[]) => Promise<void>> {
  const hooks: Record<string, Record<string, (...args: unknown[]) => Promise<void>>> = {
    trust: trustHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    superhuman: superhumanHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    calendar: calendarHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    contacts: contactsHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    coaching: coachingHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    health: healthHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    media: mediaHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    career: careerHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    wisdom: wisdomHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    misc: miscHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    'better-than-human': betterThanHumanHooks as unknown as Record<
      string,
      (...args: unknown[]) => Promise<void>
    >,
    'life-stage': lifeStageHooks as unknown as Record<
      string,
      (...args: unknown[]) => Promise<void>
    >,
    location: locationHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    pets: petsHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    property: propertyHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    legal: legalHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    crisis: crisisHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    learning: learningHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
    'outreach-history': outreachHistoryHooks as unknown as Record<
      string,
      (...args: unknown[]) => Promise<void>
    >,
    persona: personaHooks as unknown as Record<string, (...args: unknown[]) => Promise<void>>,
  };
  return hooks[domain];
}

/**
 * Get all domain names
 */
export function getDomainNames(): string[] {
  return [
    'trust',
    'superhuman',
    'calendar',
    'contacts',
    'coaching',
    'health',
    'media',
    'career',
    'wisdom',
    'misc',
    'better-than-human',
    'life-stage',
    'location',
    'pets',
    'property',
    'legal',
    'crisis',
    'learning',
    'outreach-history',
    'persona',
  ];
}
