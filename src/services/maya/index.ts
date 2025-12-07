/**
 * Maya Services
 *
 * Dedicated services for Maya persona's habit coaching and gamification features.
 *
 * @module services/maya
 */

// Financial store for budgets, savings goals, subscriptions
export {
  getMayaFinancialStore,
  type MayaFinancialData,
  type BudgetData,
  type SavingsGoalData,
  type SubscriptionData,
  type SpendingTriggerData,
  type SpendingLimitData,
  type WeeklyCheckInData,
} from './financial-store.js';

// Gamification store for XP, badges, challenges
export {
  getMayaGamificationStore,
  EarnedBadgeSchema,
  GamificationProfileSchema,
  type EarnedBadge,
  type GamificationProfile,
} from './gamification-store.js';

// Notification service for proactive coaching
export {
  getMayaNotificationService,
  type MayaNotificationType,
  type MayaNotificationRequest,
} from './notification-service.js';

