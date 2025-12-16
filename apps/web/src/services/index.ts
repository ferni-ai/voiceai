/**
 * Services - Central Export
 *
 * All application services for business logic.
 */

export * from './audio.service.js';
export * from './connection.service.js';
export * from './delight.service.js';
export * from './engagement-demo-data.js';
export * from './engagement.service.js';
export * from './handoff.service.js';
export * from './mood.service.js';
export * from './push-notifications.service.js';
export * from './relationship-stage.service.js';
export * from './spotify.service.js';

// ============================================================================
// 🌟 BRAND SYSTEM - World-class multi-sensory experience
// ============================================================================

export * from './avatar-state.service.js';
// brand-system.ts is a re-export barrel - only export its unique functions
// to avoid conflicts with modules we already export directly
export {
  initializeBrandSystem,
  brandAppWake,
  preloadPersonaSounds,
  preloadCelebrationSounds,
} from './brand-system.js';
export * from './ferni-audio.service.js';
export * from './glow-controller.service.js';
export * from './haptics.service.js';
export * from './ritual-engine.service.js';
export * from './voice-analyzer.service.js';
export * from './voice-auth.service.js';

// ============================================================================
// 🌱 PROGRESSIVE RELATIONSHIP FEATURES
// ============================================================================

// growth-journey exports recordConversation which conflicts with progressive-features
// Export growth-journey's as journeyRecordConversation
export {
  init as initGrowthJourney,
  getCurrentSeason,
  getProgress as getJourneyProgress,
  isSeasonActive,
  getDaysRemaining,
  recordConversation as journeyRecordConversation,
  recordGoalAchieved,
  getAllMilestonesWithStatus,
  celebrateMilestone,
  getReadyMilestones,
  becomeCompanion,
  isCompanion,
  getCompanionPrice,
  onProgressChange,
  growthJourneyService,
} from './growth-journey.service.js';
export type { JourneyMilestone, Season, JourneyProgress } from './growth-journey.service.js';
export * from './progressive-features.service.js';
export * from './team-unlock.service.js';

// ============================================================================
// 🌿 ROADMAP & COMING SOON FEATURES
// ============================================================================

export * from './roadmap.service.js';
