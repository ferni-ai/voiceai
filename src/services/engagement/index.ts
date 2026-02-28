/**
 * Engagement Services
 *
 * Services related to user engagement, notifications, and gamification.
 */

// daily-challenges exports ChallengeProgress type
export {
  getTodaysChallenge,
  getUpcomingChallenges,
  startChallenge,
  completeChallenge,
  getChallengeStats,
  type ChallengeProgress,
  type DailyChallenge,
  type UserChallengeStats,
} from './daily-challenges.js';
export * from './engagement-conversation-triggers.js';
export * from './engagement-notification-service.js';
export * from './engagement-store.js';
// gamification-store also exports ChallengeProgress - import as alias
export {
  ChallengeProgressSchema,
  GamificationProfileSchema,
  type GamificationProfile,
  type EarnedBadge,
  type ChallengeProgress as GamificationChallengeProgress,
} from './gamification-store.js';
export * from './team-engagement.js';

// Consolidated from root-level services (DDD migration Feb 2026)
export * from './celebration-engine.js';
export * from './daily-rituals.js';
export * from './engagement-data-sender.js';
export * from './growth-visibility-engine.js';
export * from './milestone-detection.js';
export * from './ritual-onboarding.js';
export * from './seed-economy.js';
export * from './spontaneous-sharing.js';
export * from './story-tracking.js';
