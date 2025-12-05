/**
 * Ferni Cloud Functions Index
 *
 * Exports all Cloud Functions for deployment.
 */

// Export optimization scheduler functions
export {
  runOptimizationCycle,
  dailyAnalyticsSummary,
  weeklyRecommendationsReport,
  triggerOptimization,
  dashboardData,
} from './optimization-scheduler.js';
