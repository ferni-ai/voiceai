/**
 * Store Services
 *
 * Data store services for various domain entities.
 *
 * Architecture:
 * - Domain stores (productivity, financial, life-data) provide structured CRUD
 * - Unified data layer (../data-layer/) bridges stores with semantic memory
 * - Life Automation stores use Firestore with in-memory fallback
 *
 * See: src/services/data-layer/CLAUDE.md for the unified architecture
 */

export * from './conversation-history.js';
export * from './financial-store.js';
export * from './session-cache.js';

// Firestore Life Automation Adapter
export {
  getLifeAutomationData,
  saveLifeAutomationData,
  deleteLifeAutomationData,
  isFirestoreAvailable,
  batchSaveLifeAutomationData,
  getAllLifeAutomationData,
  migrateToFirestore,
  hasLifeAutomationData,
  type LifeAutomationDomain,
  type FirestoreOperationResult,
} from './firestore-life-adapter.js';

// Export types from type files (source of truth)
export * from './life-data-types.js';
export * from './productivity-types.js';

// Export only functions from store files (NOT types - they're already exported above)
export { getLifeDataStore } from './life-data-store.js';
export {
  getProductivityStore,
  initializeProductivityStore,
  shutdownProductivityStore,
} from './productivity-store.js';

// New domain stores for Life Automation
// Subscription Store (renamed SubscriptionData to UserSubscriptionData to avoid conflict with financial-store)
export {
  getSubscriptionData,
  saveSubscriptionData,
  addSubscription,
  updateSubscription,
  cancelSubscription,
  getActiveSubscriptions,
  getSubscriptionsByCategory,
  getUpcomingRenewals,
  recordPayment,
  getPaymentHistory,
  createAlert,
  getUnacknowledgedAlerts,
  acknowledgeAlert,
  getSubscriptionSummary,
  migrateUserToFirestore as migrateSubscriptionsToFirestore,
  type Subscription,
  type SubscriptionPayment,
  type SubscriptionAlert,
  type UserSubscriptionData,
  type SubscriptionStatus,
  type SubscriptionFrequency,
  type SubscriptionCategory,
  type DetectionSource,
  type SubscriptionSummary,
} from './subscription-store.js';

// Document Store
export {
  getDocumentData,
  saveDocumentData,
  addDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  getDocumentsByType,
  getExpiringDocuments,
  getExpiredDocuments,
  searchDocuments,
  getWarrantyStatus,
  createFolder,
  addDocumentToFolder,
  getDocumentsInFolder,
  migrateUserToFirestore as migrateDocumentsToFirestore,
  type Document,
  type DocumentFolder,
  type DocumentAlert,
  type DocumentData,
  type DocumentType,
  type DocumentStatus,
} from './document-store.js';

// Workflow Store
export {
  getWorkflowData,
  saveWorkflowData,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  setWorkflowStatus,
  getWorkflow,
  getActiveWorkflows,
  getWorkflowsByTriggerType,
  getWorkflowsForPhrase,
  getDueScheduledWorkflows,
  startExecution,
  updateExecutionAction,
  completeExecution,
  failExecution,
  getExecutionHistory,
  getRecentExecutions,
  createFromTemplate,
  migrateUserToFirestore as migrateWorkflowsToFirestore,
  type Workflow,
  type WorkflowTrigger,
  type WorkflowAction,
  type WorkflowExecution,
  type WorkflowTemplate,
  type WorkflowData,
  type WorkflowStatus,
  type TriggerType,
  type TimeTrigger,
  type PhraseTrigger,
  type EventTrigger,
  type LocationTrigger,
  type CalendarTrigger,
  type DeviceTrigger,
  type WebhookTrigger,
  type ActionType,
  type WorkflowCondition,
} from './workflow-store.js';

// Meal Store
export {
  getMealData,
  saveMealData,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  toggleFavorite,
  recordCooking,
  getRecipe,
  searchRecipes,
  getRecipesByMealType,
  getRecipesByCuisine,
  getRecipesForDiet,
  getQuickRecipes,
  suggestRecipesByIngredients,
  createMealPlan,
  addMealPlanEntry,
  getCurrentMealPlan,
  getMealsForDate,
  generateShoppingList,
  updatePreferences,
  addRestriction,
  addAllergy,
  migrateUserToFirestore as migrateMealsToFirestore,
  type Recipe,
  type MealPlan,
  type MealPlanEntry,
  type MealData,
  type MealType,
  type DietaryTag,
  type CuisineType,
  type DifficultyLevel,
  type Ingredient,
  type NutritionInfo,
  type DietaryPreferences,
  type MealHistory,
} from './meal-store.js';

// Re-export unified data layer for convenience
export {
  getUnifiedDataLayer,
  getUnifiedContext,
  searchUserContext,
  indexUserData,
  buildLLMContext,
  warmCache,
  invalidateCache,
} from '../data-layer/index.js';

export {
  onHabitChange,
  onSavingsGoalChange,
  onMilestoneChange,
  onBudgetChange,
  onTaskChange,
  onSubscriptionChange,
  onSpendingTriggerChange,
  onRoutineChange,
  onLifeGoalChange,
  flushPendingChanges,
  getIndexingMetrics,
} from '../data-layer/store-hooks.js';

export {
  onSessionStart,
  onSessionEnd,
  getSessionMetrics,
  flushAllSessions,
  registerShutdownHandler,
} from '../data-layer/session-integration.js';

export { getDataLayerHealth, isHealthy, getDiagnostics } from '../data-layer/health.js';

export { routeQuery, executeRoutedQuery } from '../data-layer/query-router.js';
