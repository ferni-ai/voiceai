/**
 * Engagement API Routes Index
 *
 * Central export for all modular route handlers.
 * Each domain has its own file for better organization and maintainability.
 */

// Types
export type { AnyRecord, Weather, Pattern, UIMemory } from './types.js';
export { MILESTONES, MILESTONE_MESSAGES, getMilestoneMessage, getPersonaName } from './types.js';

// Conversation routes
export { handleGetConversations, handleConversationsRoutes } from './conversations.js';

// Analytics routes
export { handleGetUserAnalytics, handleAnalyticsRoutes } from './analytics.js';

// Predictions routes
export {
  handleGetPredictions,
  handleUpdatePredictionActuals,
  handlePredictionsRoutes,
} from './predictions.js';

// Rituals routes
export {
  handleGetRituals,
  handleCreateRitual,
  handleDeleteRitual,
  handleCompleteRitual,
  handleRitualsRoutes,
} from './rituals.js';

// Memories routes
export {
  handleGetCognitiveMemories,
  handleDeleteMemory,
  handleMemoriesRoutes,
} from './memories.js';

// Team routes
export { handleGetHuddles, handleTeamRoutes } from './team.js';

// Data export/delete routes
export {
  handleGetExportCategories,
  handleExportData,
  handleDeleteAllData,
  handleDataRoutes,
} from './data.js';

// Relationship routes
export { handleGetRelationshipProgress, handleRelationshipRoutes } from './relationship.js';

// Sky Check routes (daily check-in / emotional weather)
export {
  handleRecordSkyCheck,
  handleGetSkyCheckHistory,
  handleSkyCheckRoutes,
} from './sky-check.js';
