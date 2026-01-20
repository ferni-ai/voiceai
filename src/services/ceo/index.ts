/**
 * CEO Services
 *
 * Services for the CEO CLI commands - personal productivity,
 * tracking, coaching, and business intelligence.
 *
 * @module services/ceo
 */

// Goals Service
export {
  // Types
  type Goal,
  type Milestone,
  type GoalStatus,
  type GoalCategory,
  type CreateGoalInput,
  type UpdateGoalInput,
  type GoalsService,
  // Functions
  createGoal,
  getGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  updateProgress,
  addMilestone,
  completeMilestone,
  // Singleton
  goalsService,
} from './goals.js';

// Wins Service
export {
  // Types
  type Win,
  type WinPeriod,
  // Functions
  addWin,
  getWins,
  getRandomWin,
  getWinsByCategory,
  getWinCount,
  // Singleton
  winsService,
} from './wins.js';

// Journal Service
export {
  // Types
  type JournalEntry,
  type JournalPeriod,
  type Sentiment,
  // Functions
  addEntry,
  getEntries,
  search,
  getEntriesBySentiment,
  getLatestEntry,
  // Singleton
  journalService,
} from './journal.js';

// Energy Service
export {
  // Types
  type EnergyLog,
  type EnergyTrend,
  // Functions
  logEnergy,
  getToday as getEnergyToday,
  getWeeklyAverage,
  getTrend,
  getWeeklyAnalysis,
  getLatestLog,
  // Singleton
  energyService,
} from './energy.js';

// Gratitude Service
export {
  // Types
  type GratitudeEntry,
  type GratitudeCategory,
  // Constants
  GRATITUDE_CATEGORIES,
  // Functions
  addGratitude,
  getEntries as getGratitudeEntries,
  getRandom,
  getToday as getGratitudeToday,
  getThisWeek,
  getByCategory,
  getCount,
  getStreak,
  // Singleton
  gratitudeService,
} from './gratitude.js';

// Notification Service
export {
  // Types
  type SlackBlock,
  type SlackAttachment,
  type SlackMessage,
  type Incident,
  type ExperimentResult,
  type DigestContent,
  type NotificationService,
  // Functions
  getCEONotificationService,
  resetCEONotificationService,
  // Singleton
  notificationService,
} from './notification.js';

// Ask Service
export {
  // Types
  type AskContext,
  type AskResponse,
  type AskService,
  // Functions
  ask,
  buildContext,
  // Singleton
  askService,
} from './ask.js';

// Focus Service
export {
  // Types
  type FocusSession,
  type FocusStats,
  type StartSessionOptions,
  type FocusService,
  // Singleton
  focusService,
} from './focus.js';

// Briefing Service
export {
  // Types
  type CalendarEvent,
  type Priority,
  type MetricsSummary,
  type ExperimentSummary,
  type Briefing,
  type BriefingService,
  // Functions
  generateBriefing,
  formatForTerminal as formatBriefingForTerminal,
  // Singleton
  briefingService,
} from './briefing.js';

// Weekly Review Service
export {
  // Types
  type GoalProgress,
  type TimeAllocation,
  type MetricsTrend,
  type FocusSummary,
  type WeeklyReview,
  type WeeklyReviewService,
  // Singleton
  weeklyReviewService,
} from './weekly-review.js';

// Ideas Service
export {
  // Types
  type Idea,
  // Functions
  addIdea,
  getIdeas,
  getIdeasByTag,
  getRandomIdea,
  searchIdeas,
  tagIdea,
  archiveIdea,
  getIdeaCount,
  // Singleton
  ideasService,
} from './ideas.js';

// Blockers Service
export {
  // Types
  type Blocker,
  type BlockerSeverity,
  type BlockerStatus,
  type BlockersService,
  // Functions
  addBlocker,
  getBlockers,
  getActiveBlockers,
  getBlocker,
  resolveBlocker,
  escalateBlocker,
  getBlockersForGoal,
  getActiveBlockerCount,
  getBlockersBySeverity,
  // Singleton
  blockersService,
} from './blockers.js';

// Decisions Service
export {
  // Types
  type Decision,
  type DecisionStatus,
  type DecisionsService,
  // Functions
  addDecision,
  getDecisions,
  getDecision,
  makeDecision,
  addOutcome,
  getPendingDecisions,
  // Singleton
  decisionsService,
} from './decisions.js';

// Priorities Service
export {
  // Types
  type Priority as UserPriority,
  type PrioritiesService,
  // Functions
  addPriority,
  getPriorities,
  completePriority,
  reorderPriorities,
  clearCompleted,
  getTopPriority,
  // Singleton
  prioritiesService,
} from './priorities.js';

// Meetings Service
export {
  // Types
  type ActionItem,
  type Meeting,
  type MeetingPeriod,
  // Functions
  addMeeting,
  getMeetings,
  getMeeting,
  updateNotes,
  addActionItem,
  completeActionItem,
  getActionItems,
  searchMeetings,
  // Singleton
  meetingsService,
} from './meetings.js';

// Insights Service - "Better than Human" cross-data intelligence
export {
  // Types
  type Insight,
  type InsightType,
  type InsightCategory,
  type InsightPriority,
  type InsightsService,
  // Functions
  getEnergyGoalInsights,
  getBlockerImpactInsights,
  getDecisionQualityInsights,
  getFocusEffectivenessInsights,
  getMomentumInsights,
  getBurnoutWarning,
  getWeeklyPatterns,
  getAllInsights,
  getInsightsByCategory,
  getInsightsByType,
  getCriticalInsights,
  refreshInsights,
  // Singleton
  insightsService,
} from './insights.js';
