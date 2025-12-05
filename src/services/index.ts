/**
 * Services Module
 *
 * Clean barrel file that re-exports from focused modules.
 * This maintains backward compatibility while keeping code organized.
 *
 * Architecture:
 *   types.ts           - Type definitions (SessionServices, GlobalServices)
 *   global-services.ts - Global service initialization and access
 *   session-manager.ts - Per-session service creation and lifecycle
 *   shutdown.ts        - Graceful shutdown logic
 */

// ============================================================================
// CORE SERVICE TYPES
// ============================================================================

export type {
  SessionServices,
  GlobalServices,
  CreateSessionOptions,
  UserProfile,
  ConversationAnalysis,
  EmotionResult,
  IntentResult,
  ConversationState,
  PromptContext,
  SpeechContext,
  DynamicUserContext,
  HumanizingStateUpdate,
} from './types.js';

// ============================================================================
// GLOBAL SERVICES
// ============================================================================

export {
  initializeServices,
  getGlobalServices,
  getGlobalServicesSync,
  resetGlobalServices,
  markPersonaIndexed,
  isPersonaIndexed,
  getStartupCapabilities,
} from './global-services.js';

// ============================================================================
// STARTUP VALIDATION
// ============================================================================

export {
  validateStartup,
  validateAndLog,
  hasFullCapabilities,
  getCapabilitySummary,
  checkEmbeddingConsistency,
  type ValidationResult,
  type StartupCapabilities,
  type ValidationConfig,
} from './startup-validation.js';

// ============================================================================
// INTELLIGENCE PERSISTENCE
// ============================================================================

export {
  exportIntelligenceState,
  importIntelligenceState,
  applyIntelligenceToProfile,
  loadIntelligenceFromProfile,
  cleanupIntelligenceEngines,
  startAutoSave,
  stopAutoSave,
  stopAllAutoSaves,
  getAutoSaveStatus,
  type IntelligenceState,
  type PersistenceConfig,
} from './intelligence-persistence.js';

// ============================================================================
// PERSISTENCE METRICS
// ============================================================================

export {
  persistenceMetrics,
  withMetrics,
  withMetricsSync,
  type PersistenceMetricsSnapshot,
} from './persistence-metrics.js';

// ============================================================================
// ERROR TRACKING
// ============================================================================

export {
  errorTracking,
  withErrorTracking,
  trackVoiceSession,
  trackHandoff,
  trackApiCall,
} from './error-tracking.js';

// ============================================================================
// PERFORMANCE PROFILING
// ============================================================================

export {
  performanceProfiler,
  withTiming,
  Timed,
} from './performance-profiler.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export {
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
} from './session-manager.js';

// ============================================================================
// SESSION CONTEXT (Unified session state management)
// ============================================================================

export {
  createSessionContext,
  type SessionContext,
  type SessionContextConfig,
  type EnhancedAnalysis,
  type ThreadWithStarter,
  type SessionStats,
  type SessionCleanupResult,
} from './session-context.js';

// ============================================================================
// SHUTDOWN
// ============================================================================

export { shutdownServices } from './shutdown.js';

// ============================================================================
// CONVERSATION STATE (Tool Orchestration)
// ============================================================================

export {
  getConversationState,
  hasConversationState,
  endConversation,
  getActiveSessionIds as getActiveConversationIds,
  cleanupStaleConversations,
  ConversationStateManager,
  type EmotionalContext,
  type TopicContext,
  type FlowContext,
  type UserContext,
  type ToolExecutionData,
  type ConversationState as ConversationStateType,
} from './conversation-state.js';

// ============================================================================
// USER IDENTIFICATION
// ============================================================================

export {
  normalizePhoneNumber,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
  identifyWithNaturalAuth,
  linkPhoneToProfile,
  linkWebAuthToPhone,
  getGreeting,
  getLLMAuthContext,
  type AuthContext as UserAuthContext,
  type ConfidenceLevel as UserConfidenceLevel,
  type AuthAction as UserAuthAction,
} from './user-identification.js';

// ============================================================================
// VOICE MEMORY & IDENTIFICATION
// ============================================================================

export {
  getVoiceMemory,
  VoiceSketchBuilder,
  VoiceMemoryService,
  compareVoiceSketches,
  type VoiceSketch,
  type VoiceSearchResult,
  type VoiceSimilarityResult,
} from './voice-memory.js';

export {
  identifyWithVoice,
  mergeVoiceSketch,
  type VoiceIdentificationResult,
  type VoiceVerificationResult,
} from './voice-identification.js';

// ============================================================================
// NATURAL AUTHENTICATION
// ============================================================================

export {
  authenticateNaturally,
  verifyIdentity,
  enrollVoice,
  updateVoiceSignature,
  linkIdentifier,
  getNaturalGreeting,
  generateContextForLLM,
  type AuthContext,
  type ConfidenceLevel,
  type AuthAction,
} from './natural-auth.js';

// ============================================================================
// PRODUCTIVITY DATA STORE
// ============================================================================

export {
  getProductivityStore,
  initializeProductivityStore,
  shutdownProductivityStore,
  type ProductivityData,
  type TaskData,
  type BillData,
  type HabitData,
  type MedicationData,
  type NoteData,
  type RoutineData,
} from './productivity-store.js';

// ============================================================================
// COLLECTIVE LEARNING
// ============================================================================

export {
  getCollectiveLearningStore,
  initializeCollectiveLearning,
  shutdownCollectiveLearning,
} from './collective-learning-store.js';

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

export {
  TeamManager,
  getTeamManager,
  initializeTeamManager,
  resetTeamManager,
} from './team-manager.js';

// ============================================================================
// MAYA GAMIFICATION
// ============================================================================

export {
  getMayaGamificationStore,
  initializeMayaGamificationStore,
  type GamificationProfile,
  type EarnedBadge,
  type ChallengeProgress,
  type BehaviorToolUsage,
  type MoodLog,
  type LeaderboardEntry,
  type GamificationExport,
} from './maya-gamification-store.js';

// ============================================================================
// MAYA NOTIFICATIONS
// ============================================================================

export {
  getMayaNotificationService,
  initializeMayaNotificationService,
  shutdownMayaNotificationService,
  type MayaNotificationType,
  type MayaNotificationRequest,
  type MayaNotificationPreferences,
} from './maya-notification-service.js';

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

export {
  loadPhoneCache,
  savePhoneMapping,
  getCachedPhoneMapping,
  deletePhoneMapping,
  findDuplicateProfiles,
  consolidateProfiles,
  findProfilesByVoice,
  generateVoiceRecognitionGreeting,
  getProactiveMemories,
  shouldSurfaceMemory,
  pruneMemorySystem,
  initializeMemoryManagement,
  shutdownMemoryManagement,
  type ProactiveMemory,
  type ConsolidationResult,
  type PruningResult,
  type PruningConfig,
} from './memory-management.js';

// ============================================================================
// BACKGROUND TASKS
// ============================================================================

export {
  getBackgroundTaskService,
  initializeBackgroundTasks,
  shutdownBackgroundTasks,
  registerTaskHandler,
  type BackgroundTask,
  type Workflow,
  type WorkflowStep,
  type PendingAction,
  type ScheduledJob,
  type Delegation,
  type BackgroundData,
  type TaskPriority,
  type TaskStatus,
} from './background-tasks.js';

// ============================================================================
// REMINDER SCHEDULER
// ============================================================================

export {
  createReminder,
  getPendingReminders,
  getDueReminders,
  cancelReminder,
  deliverReminder,
  createVoiceMessage,
  sendVoiceMessage,
  startReminderScheduler,
  stopReminderScheduler,
  parseNaturalTime,
  type ReminderDeliveryMethod,
  type ScheduledReminder,
  type VoiceMessage,
} from './reminder-scheduler.js';

// ============================================================================
// AGENT BUS & LIFE DATA
// ============================================================================

export { getAgentBus, type AgentMessage, type AgentId } from './agent-bus.js';

export {
  getLifeDataStore,
  type LifeMilestone,
  type LifeGoal,
  type RetirementPlan,
  type LifePortfolio,
} from './life-data-store.js';

export {
  getProactiveScheduler,
  startProactiveScheduler,
  stopProactiveScheduler,
  type ProactiveNotification,
} from './proactive-scheduler.js';

// ============================================================================
// RE-EXPORTS FROM OTHER MODULES (for backward compatibility)
// ============================================================================

// Intelligence re-exports
export {
  analyzeMessage,
  type ConversationLearningData,
  type ResponseQualityTracker,
  type ConversationPatternAnalyzer,
  type ProactiveInsightEngine,
  type FinancialJourneyTracker,
  type CrossSessionThreader,
  type VoicePaceAdapter,
} from '../intelligence/index.js';

// Memory re-exports
export {
  ragLookup as semanticRagLookup,
  type ConversationTurn,
} from '../memory/index.js';

// Speech re-exports
export {
  tagTextWithSsmlAdaptive,
  buildSpeechContext,
} from '../speech/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import {
  initializeServices as _initializeServices,
  getGlobalServices as _getGlobalServices,
} from './global-services.js';
import {
  createSessionServices as _createSessionServices,
  getSessionServices as _getSessionServices,
  getActiveSessionIds as _getActiveSessionIds,
} from './session-manager.js';
import { shutdownServices as _shutdownServices } from './shutdown.js';

export default {
  initializeServices: _initializeServices,
  getGlobalServices: _getGlobalServices,
  createSessionServices: _createSessionServices,
  getSessionServices: _getSessionServices,
  getActiveSessionIds: _getActiveSessionIds,
  shutdownServices: _shutdownServices,
};
