/**
 * Humanization Services Index
 *
 * Exports all humanization-related services for easy importing.
 */

// Core behavior management
import {
  PersonaBehaviorManager as _PersonaBehaviorManager,
  preloadAllBehaviors as _preloadAllBehaviors,
} from '../persona-behavior-manager.js';

export {
  PersonaBehaviorManager,
  loadPersonaBehaviors,
  getEmotionalResponse,
  getComfortPhrase,
  getCelebrationPhrase,
  getBackchannelPhrase,
  getComplimentPhrase,
  getSpeechImperfection,
  getMemoryCallbackPhrase,
  getContextualPhrase,
  getVulnerabilityPhrase,
  getPacingMultiplier,
  applyPacing,
  clearBehaviorCache,
  preloadAllBehaviors,
  getTimeOfDay,
  canShareVulnerability,
  type EmotionalContext,
  type ConversationContext,
  type BehaviorResult,
} from '../persona-behavior-manager.js';

// Emotion detection
import { EmotionDetectionService as _EmotionDetectionService } from '../emotion-detection.js';

export {
  EmotionDetectionService,
  detectEmotion,
  isUserDistressed,
  isUserExcited,
  getResponseStyle,
  analyzeConversationEmotion,
  type EmotionCategory,
  type EnergyLevel,
  type EmotionResult,
} from '../emotion-detection.js';

// Story tracking
import { StoryTrackingService as _StoryTrackingService } from '../story-tracking.js';

export {
  StoryTrackingService,
  hasStoryBeenTold,
  markStoryTold,
  getStoriesTold,
  canTellStory,
  findStoryForContext,
  getContinuationStories,
  registerStory,
  getPersonaStories,
  clearUserStoryHistory,
  getStoryStats,
  type Story,
  type StoryTellingContext,
  type StoryResult,
} from '../story-tracking.js';

// Spontaneous sharing
import { SpontaneousSharingService as _SpontaneousSharingService } from '../spontaneous-sharing.js';

export {
  SpontaneousSharingService,
  surfaceEnderingContradiction,
  shareSimpleJoy,
  referencePetPeeve,
  shareGrowthEdge,
  shareRelationshipMoment,
  shareGuiltyPleasure,
  trySpontaneousShare,
  clearSharedContent,
  type SharingContext,
  type ShareResult,
} from '../spontaneous-sharing.js';

// Persona modes
import { PersonaModesService as _PersonaModesService } from '../persona-modes.js';

export {
  PersonaModesService,
  detectSuggestedMode,
  getCurrentMode,
  setMode,
  getModeConfig,
  getModeTransitionPhrase,
  getModeCheckInPhrase,
  recommendModeTransition,
  applyModeModifiers,
  clearSessionMode,
  getModeHistory,
  type PersonaMode,
  type ModeConfig,
  type ModeTransition,
  type ModeContext,
} from '../persona-modes.js';

// Re-export relationship tracking
export {
  getPersonaRelationshipData,
  calculatePersonaRelationshipStage,
  applyRelationshipUpdateToProfile,
  hasMinimumRelationship,
  getWarmthMultiplier,
  canTellStory as canTellStoryByRelationship,
  canShareVulnerability as canShareVulnerabilityByRelationship,
  getRelationshipTransitionPhrase,
  getMemoryCallbackPhrase as getRelationshipMemoryCallback,
} from '../per-persona-relationship.js';

// Milestone detection
import { MilestoneDetectionService as _MilestoneDetectionService } from '../milestone-detection.js';

export {
  MilestoneDetectionService,
  detectMilestones,
  getMilestoneCelebrationPhrase,
  checkHabitStreak,
  shouldCelebrate,
  markCelebrated,
  type Milestone,
  type MilestoneType,
  type MilestoneContext,
} from '../milestone-detection.js';

// Topic tracking
import { TopicTrackingService as _TopicTrackingService } from '../topic-tracking.js';

export {
  TopicTrackingService,
  trackTopic,
  getRecentTopics,
  getLastTopic,
  getOpenTopics,
  getImportantTopics,
  findTopicsByKeyword,
  markTopicResolved,
  getTopicForProactiveMemory,
  type TrackedTopic,
} from '../topic-tracking.js';

// Voice adaptation
import { VoiceAdaptationService as _VoiceAdaptationService } from '../voice-adaptation.js';

export {
  VoiceAdaptationService,
  getPersonaVoiceProfile,
  adjustForUserEmotion,
  applyRate,
  applyPauseMultiplier as applyVoicePauseMultiplier,
  addEmphasis,
  insertThinkingSound,
  insertFiller,
  addMicroExpressions,
  processVoiceContent,
  getConversationBreak,
  type VoiceExpression,
  type VoiceContext,
  type VoiceModifiers,
} from '../voice-adaptation.js';

// Cultural awareness
import { CulturalAwarenessService as _CulturalAwarenessService } from '../cultural-awareness.js';

export {
  CulturalAwarenessService,
  getCulturalContext,
  getHolidayGreeting,
  getUpcomingHolidayMention,
  getSeasonalAdjustment,
  getCulturalMoment,
  isFinanciallyRelevantDate,
  type Holiday,
  type Season,
  type CulturalContext,
} from '../cultural-awareness.js';

/**
 * Initialize all humanization services
 */
export async function initializeHumanizationServices(): Promise<void> {
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
};

export default HumanizationServices;
