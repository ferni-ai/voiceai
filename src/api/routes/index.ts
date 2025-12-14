/**
 * Engagement API Routes Index
 *
 * Central export for all modular route handlers.
 * Each domain has its own file for better organization and maintainability.
 */

// Types
export { MILESTONES, MILESTONE_MESSAGES, getMilestoneMessage, getPersonaName } from './types.js';
export type { AnyRecord, Pattern, UIMemory, Weather } from './types.js';

// Conversation routes
export { handleConversationsRoutes, handleGetConversations } from './conversations.js';

// Analytics routes
export { handleAnalyticsRoutes, handleGetUserAnalytics } from './analytics.js';

// Predictions routes
export {
  handleGetPredictions,
  handlePredictionsRoutes,
  handleUpdatePredictionActuals,
} from './predictions.js';

// Rituals routes
export {
  handleCompleteRitual,
  handleCreateRitual,
  handleDeleteRitual,
  handleGetRituals,
  handleRitualsRoutes,
} from './rituals.js';

// Memories routes
export {
  handleDeleteMemory,
  handleGetCognitiveMemories,
  handleMemoriesRoutes,
} from './memories.js';

// Team routes
export { handleGetHuddles, handleTeamRoutes } from './team.js';

// Data export/delete routes
export {
  handleDataRoutes,
  handleDeleteAllData,
  handleExportData,
  handleGetExportCategories,
} from './data.js';

// Relationship routes
export { handleGetRelationshipProgress, handleRelationshipRoutes } from './relationship.js';

// Sky Check routes (daily check-in / emotional weather)
export {
  handleGetSkyCheckHistory,
  handleRecordSkyCheck,
  handleSkyCheckRoutes,
} from './sky-check.js';

// Builder metrics routes (admin/monitoring)
export {
  handleBuilderMetricsRoutes,
  handleGetBuilderAlerts,
  handleGetBuilderMetrics,
  handleGetBuilderWarnings,
  handleGetSessionBuilderMetrics,
} from './builder-metrics.js';

// Growth visibility routes (user progress insights)
export { handleGrowthRoutes } from './growth.js';
