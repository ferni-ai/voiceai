/**
 * Services - Central Export
 *
 * All application services for business logic.
 */

export * from './audio.service.js';
export * from './procedural-sounds.service.js';
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
export * from './brand-system.js';
export * from './ferni-audio.service.js';
export * from './glow-controller.service.js';
export * from './haptics.service.js';
export * from './ritual-engine.service.js';
export * from './voice-analyzer.service.js';
export * from './voice-auth.service.js';

// ============================================================================
// 🌱 PROGRESSIVE RELATIONSHIP FEATURES
// ============================================================================

// Exclude celebrateMilestone (conflicts with brand-system) and recordConversation (conflicts with progressive-features)
export {
  type JourneyMilestone,
  type Season,
  type JourneyProgress,
  init as initGrowthJourney,
  getCurrentSeason,
  getProgress,
  isSeasonActive,
  getDaysRemaining,
  recordGoalAchieved,
  getAllMilestonesWithStatus,
  getReadyMilestones,
  becomeCompanion,
  isCompanion,
  getCompanionPrice,
  onProgressChange,
  growthJourneyService,
} from './growth-journey.service.js';
// Exclude recordConversation (conflicts with growth-journey's function of same name)
export {
  initProgressiveFeatures,
  isProgressiveFeaturesInitialized,
  triggerTrustSignal,
  getRelationshipInfo,
  progressiveFeatures,
} from './progressive-features.service.js';
export * from './team-unlock.service.js';

// ============================================================================
// 🌿 ROADMAP & COMING SOON FEATURES
// ============================================================================

export * from './roadmap.service.js';
export * from './soul-stats.service.js';