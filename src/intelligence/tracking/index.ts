/**
 * Tracking Module
 *
 * Learning and tracking capabilities - Ferni gets smarter over time
 * by tracking what works and learning patterns.
 *
 * @module intelligence/tracking
 */

// Response Quality Tracker
export {
  getResponseQualityTracker,
  removeResponseQualityTracker,
  ResponseQualityTracker,
  type LearnedResponsePreferences,
  type ResponseSignal,
  type ResponseType,
  type UserReaction,
  type UserResponseQuality,
} from './response-quality.js';

// Conversation Pattern Analyzer
export {
  ConversationPatternAnalyzer,
  getConversationPatternAnalyzer,
  removeConversationPatternAnalyzer,
  type ConversationPrediction,
  type ConversationSession,
  type DayOfWeek,
  type DurationBucket,
  type LearnedConversationPatterns,
  type OpeningStyle,
  type TimeOfDay,
} from './conversation-patterns.js';

// Voice Pace Adapter
export {
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  VoicePaceAdapter,
  type ConversationTempo,
  type CurrentPaceState,
  type EnergyLevel,
  type LearnedPacePreferences,
  type PaceCategory,
  type PaceObservation,
} from './voice-pace.js';

// Humor Calibration
export {
  getHumorCalibration,
  HumorCalibrationEngine,
  removeHumorCalibration,
  resetAllHumorCalibration,
  type HumorAttempt,
  type HumorGuidance,
  type HumorPreferences,
  type HumorReaction,
  type HumorType,
} from './humor.js';

// Story Preference
export {
  getStoryPreference,
  removeStoryPreference,
  StoryPreferenceEngine,
  type EmotionalDepth,
  type StoryAttempt,
  type StoryGuidance,
  type StoryLength,
  type StoryPreferences,
  type StoryType,
  type UserEngagement,
} from './story-preference.js';

// Communication Style
export {
  CommunicationMirroringEngine,
  getCommunicationMirroring,
  removeCommunicationMirroring,
  type CommunicationStyle,
  type FormalityLevel,
  type EnergyLevel as MirroringEnergyLevel,
  type StyleGuidance,
  type VocabularyLevel,
} from './communication-style.js';

// Emotional Memory
export {
  EmotionalMemoryEngine,
  getEmotionalMemory,
  removeEmotionalMemory,
  type EmotionalCheckIn,
  type EmotionalContext,
  type EmotionalMoment,
  type EmotionalPattern,
} from './emotional-memory.js';

// Financial Journey Tracker
export {
  FinancialJourneyTracker,
  getFinancialJourneyTracker,
  removeFinancialJourneyTracker,
  type FinancialJourney,
  type FinancialSnapshot,
  type JourneyMilestone,
  type ProgressTrend,
} from './financial-journey.js';

// Cross-Session Threader
export {
  CrossSessionThreader,
  getCrossSessionThreader,
  removeCrossSessionThreader,
  type OpenThread,
  type PromisedFollowUp,
  type SessionEndContext,
  type ThreadOpenReason,
  type ThreadPriority,
} from './cross-session.js';

// Preference Extractor
export {
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
  type PreferenceCategory,
} from './preferences.js';

// Capability Learning
export {
  trackSurfacedDomains,
  getRecentlySurfacedDomains,
  finalizeSessionLearning,
  onUserEngagedWithCapability,
  onToolUsedInDomain,
  onToolExecuted,
  getMostEffectiveDomains,
  getBestEmotionalContext,
  getBestPersonaForDomain,
  getDomainEngagementRate,
  getAllPatterns,
  persistPatterns,
  loadPatterns,
  initializeCapabilityLearning,
  type CapabilityPattern,
} from './capabilities.js';
