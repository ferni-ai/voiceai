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

// Export summarization scheduler functions (for realtime memory)
export {
  summarizeConversations,
  triggerSummarization,
  summarizeUserConversations,
} from './summarization-scheduler.js';

// Export outreach scheduler functions (proactive "thinking of you" notifications)
export {
  outreachScheduler,
  outreachSchedulerHttp,
} from './outreach-scheduler.js';
