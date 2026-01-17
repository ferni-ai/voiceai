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
