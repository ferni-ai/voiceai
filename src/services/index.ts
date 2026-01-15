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
  ConversationAnalysis,
  ConversationState,
  CreateSessionOptions,
  DynamicUserContext,
  EmotionResult,
  GlobalServices,
  HumanizingStateUpdate,
  IntentResult,
  PromptContext,
  SessionServices,
  SpeechContext,
  UserProfile,
} from './types.js';

// ============================================================================
// GLOBAL SERVICES
// ============================================================================

export {
  getGlobalServices,
  getGlobalServicesSync,
  getStartupCapabilities,
  initializeServices,
  isPersonaIndexed,
  markPersonaIndexed,
  resetGlobalServices,
} from './global-services.js';

// ============================================================================
// STARTUP VALIDATION
// ============================================================================

export {
  checkEmbeddingConsistency,
  getCapabilitySummary,
  hasFullCapabilities,
  validateAndLog,
  validateStartup,
  type StartupCapabilities,
  type ValidationConfig,
  type ValidationResult,
} from './deployment/startup-validation.js';

// ============================================================================
// INTELLIGENCE PERSISTENCE
// ============================================================================

export {
  applyIntelligenceToProfile,
  cleanupIntelligenceEngines,
  exportIntelligenceState,
  getAutoSaveStatus,
  importIntelligenceState,
  loadIntelligenceFromProfile,
  startAutoSave,
  stopAllAutoSaves,
  stopAutoSave,
  type IntelligenceState,
  type PersistenceConfig,
} from './cross-persona/intelligence-persistence.js';

// ============================================================================
// PERSISTENCE METRICS
// ============================================================================

export {
  persistenceMetrics,
  withMetrics,
  withMetricsSync,
  type PersistenceMetricsSnapshot,
} from './analytics/persistence-metrics.js';

// ============================================================================
// ERROR TRACKING
// ============================================================================

export {
  errorTracking,
  trackApiCall,
  trackHandoff,
  trackVoiceSession,
  withErrorTracking,
} from './observability/error-tracking.js';

// ============================================================================
// PERFORMANCE PROFILING
// ============================================================================

export { performanceProfiler, Timed, withTiming } from './performance/performance-profiler.js';

// Performance instrumentation (memory & startup timing)
export {
  perfInstrumentation,
  PerformanceInstrumentation,
  type MemoryAlert,
  type MemoryAlertConfig,
  type MemorySnapshot,
  type PerformanceReport,
  type PhaseTimng,
  type ToolLoadMetrics,
} from './performance/performance-instrumentation.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export {
  clearAllSessions,
  createSessionServices,
  getActiveSessionCount,
  getActiveSessionIds,
  getSessionServices,
} from './session-manager.js';

// ============================================================================
// SESSION CONTEXT (DEPRECATED - REMOVED)
// This module was an abandoned architecture draft. Use these alternatives:
// - ContextManager (src/context/) - For conversation context and prompt building
// - SessionStateManager (src/agents/session/) - For session lifecycle and state
// - Trust Systems (src/services/trust-systems/) - For relationship context
// ============================================================================

// ============================================================================
// SHUTDOWN
// ============================================================================

export { shutdownServices } from './deployment/shutdown.js';

// ============================================================================
// CONVERSATION STATE (Tool Orchestration)
// ============================================================================

export {
  cleanupStaleConversations,
  ConversationStateManager,
  endConversation,
  getActiveSessionIds as getActiveConversationIds,
  getConversationState,
  hasConversationState,
  type ConversationState as ConversationStateType,
  type EmotionalContext,
  type FlowContext,
  type ToolExecutionData,
  type TopicContext,
  type UserContext,
} from './conversation-thread/conversation-state.js';

// ============================================================================
// USER IDENTIFICATION
// ============================================================================

export {
  formatPhoneForDisplay,
  getGreeting,
  getLLMAuthContext,
  identifyByPhone,
  identifyByWebAuth,
  identifyFromMetadata,
  identifyWithNaturalAuth,
  isValidPhoneNumber,
  linkPhoneToProfile,
  linkWebAuthToPhone,
  normalizePhoneNumber,
  type AuthAction as UserAuthAction,
  type AuthContext as UserAuthContext,
  type ConfidenceLevel as UserConfidenceLevel,
} from './identity/user-identification.js';

// ============================================================================
// VOICE MEMORY & IDENTIFICATION
// ============================================================================

export {
  compareVoiceSketches,
  getVoiceMemory,
  VoiceMemoryService,
  VoiceSketchBuilder,
  type VoiceSearchResult,
  type VoiceSimilarityResult,
  type VoiceSketch,
} from './memory/voice-memory.js';

export {
  identifyWithVoice,
  mergeVoiceSketch,
  type VoiceIdentificationResult,
  type VoiceVerificationResult,
} from './voice/voice-identification.js';

// ============================================================================
// NATURAL AUTHENTICATION
// ============================================================================

export {
  authenticateNaturally,
  enrollVoice,
  generateContextForLLM,
  getNaturalGreeting,
  linkIdentifier,
  updateVoiceSignature,
  verifyIdentity,
  type AuthAction,
  type AuthContext,
  type ConfidenceLevel,
} from './identity/natural-auth.js';

// ============================================================================
// PRODUCTIVITY DATA STORE
// ============================================================================

export {
  getProductivityStore,
  initializeProductivityStore,
  shutdownProductivityStore,
  type BillData,
  type HabitData,
  type MedicationData,
  type NoteData,
  type ProductivityData,
  type RoutineData,
  type TaskData,
} from './stores/productivity-store.js';

// ============================================================================
// COLLECTIVE LEARNING
// ============================================================================

export {
  getCollectiveLearningStore,
  initializeCollectiveLearning,
  shutdownCollectiveLearning,
} from './memory/collective-learning-store.js';

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

export {
  getTeamManager,
  initializeTeamManager,
  resetTeamManager,
  TeamManager,
} from './monetization/team-manager.js';

// ============================================================================
// MAYA GAMIFICATION
// ============================================================================

export {
  getGamificationStore,
  initializeMayaGamificationStore,
  type BehaviorToolUsage,
  type ChallengeProgress,
  type EarnedBadge,
  type GamificationExport,
  type GamificationProfile,
  type LeaderboardEntry,
  type MoodLog,
} from './engagement/gamification-store.js';

// ============================================================================
// MAYA NOTIFICATIONS
// ============================================================================

export {
  getMayaNotificationService,
  initializeMayaNotificationService,
  shutdownEngagementNotificationService,
  type MayaNotificationPreferences,
  type MayaNotificationRequest,
  type MayaNotificationType,
} from './engagement/engagement-notification-service.js';

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

export {
  consolidateProfiles,
  deletePhoneMapping,
  findDuplicateProfiles,
  findProfilesByVoice,
  generateVoiceRecognitionGreeting,
  getCachedPhoneMapping,
  getProactiveMemories,
  initializeMemoryManagement,
  loadPhoneCache,
  pruneMemorySystem,
  savePhoneMapping,
  shouldSurfaceMemory,
  shutdownMemoryManagement,
  type ConsolidationResult,
  type ProactiveMemory,
  type PruningConfig,
  type PruningResult,
} from './memory/memory-management.js';

// ============================================================================
// BACKGROUND TASKS
// ============================================================================

export {
  getBackgroundTaskService,
  initializeBackgroundTasks,
  registerTaskHandler,
  shutdownBackgroundTasks,
  type BackgroundData,
  type BackgroundTask,
  type Delegation,
  type PendingAction,
  type ScheduledJob,
  type TaskPriority,
  type TaskStatus,
  type Workflow,
  type WorkflowStep,
} from './scheduling/background-tasks.js';

// ============================================================================
// REMINDER SCHEDULER
// ============================================================================

export {
  cancelReminder,
  createReminder,
  createVoiceMessage,
  deliverReminder,
  getDueReminders,
  getPendingReminders,
  parseNaturalTime,
  sendVoiceMessage,
  startReminderScheduler,
  stopReminderScheduler,
  type ReminderDeliveryMethod,
  type ScheduledReminder,
  type VoiceMessage,
} from './scheduling/reminder-scheduler.js';

// ============================================================================
// AGENT BUS & LIFE DATA
// ============================================================================

export { getAgentBus, type AgentId, type AgentMessage } from './agent-bus.js';

export {
  getLifeDataStore,
  type LifeGoal,
  type LifeMilestone,
  type LifePortfolio,
  type RetirementPlan,
} from './stores/life-data-store.js';

// ============================================================================
// DJ & MUSIC SERVICES (NEW ARCHITECTURE)
// ============================================================================

// DJ orchestration is now handled by the DJController
// Re-export from audio module for backward compatibility
export {
  getDJController,
  resetDJController,
  PERSONA_DJ_STYLES as DJ_PERSONA_STYLES,
  type PersonaDJStyle as DJPersonaStyle,
} from '../audio/index.js';

// Legacy DJ service functions - re-exported from dj-service.js
export {
  getContextualMusicSuggestion,
  getCrossSessionMusicCallback,
  getDJStyle,
  getMusicAppreciationComment,
  getMusicConversationStarter as getDJMusicConversationStarter,
  getMusicDiscoveryOffer,
  getMusicElementAppreciation,
  getQueueTeaser,
  getReadTheRoomAction,
  getSpontaneousMusicOffer,
} from './music/dj-service.js';

export {
  getProactiveScheduler,
  startProactiveScheduler,
  stopProactiveScheduler,
  type ProactiveNotification,
} from './scheduling/proactive-scheduler.js';

// ============================================================================
// RE-EXPORTS FROM OTHER MODULES (for backward compatibility)
// ============================================================================

// Intelligence re-exports
export {
  analyzeMessage,
  type ConversationLearningData,
  type ConversationPatternAnalyzer,
  type CrossSessionThreader,
  type FinancialJourneyTracker,
  type ProactiveInsightEngine,
  type ResponseQualityTracker,
  type VoicePaceAdapter,
} from '../intelligence/index.js';

// Memory re-exports
export { ragLookup as semanticRagLookup, type ConversationTurn } from '../memory/index.js';

// Speech re-exports
export { buildSpeechContext, tagTextWithSsmlAdaptive } from '../speech/index.js';

// ============================================================================
// GEO DETECTION (International Accent Support)
// ============================================================================

export {
  buildMetadataWithGeo,
  detectGeoFromRequest,
  extractCloudGeoHeaders,
  geoDetectionMiddleware,
  getClientIP,
  lookupIPCountry,
  parseAcceptLanguage,
  type GeoDetectionOptions,
  type GeoDetectionResult,
} from './identity/geo-detection.js';

// ============================================================================
// CARTESIA VOICE LOCALIZATION (International Accents)
// ============================================================================

export {
  clearLocalizationCache,
  getLocalizationCacheStats,
  getLocalizedVoiceId,
  getLocalizedVoiceIdSync,
  initializeLocalizationService,
  isVoiceCached,
  loadCacheFromFirestore,
  preWarmLocalizedVoices,
  type LocalizationResult,
  type LocalizedVoice,
} from './voice/cartesia-voice-localization.js';

// ============================================================================
// TEAM CAMEO SYSTEM (Team member "pop-in" feature)
// ============================================================================

export {
  buildCameoSpeech,
  CAMEO_CONFIG,
  // Timing
  CAMEO_TIMING,
  cameoEvents,
  cancelCameo,
  // Detection
  detectCameoOpportunity,
  endCameo,
  // Orchestrator
  executeCameo,
  getCooldownStatus as getCameoCooldownStatus,
  // Content
  getCameoGreeting,
  getCameoHandback,
  getCameoSessionState,
  getCameoStats,
  getCurrentCameoPersona,
  hasPersonaCameoed,
  isInCameo,
  resetSessionState as resetCameoSessionState,
  type CameoEvent,
  // Types
  type CameoPersonaId,
  type CameoRequest,
  type CameoResult,
  type CameoSessionState,
} from './cameo/index.js';

// ============================================================================
// HEALTH CHECKS
// ============================================================================

export {
  checkCognitiveIntelligenceHealth,
  checkFeatureFlagsHealth,
  checkObservabilityHealth,
  checkOutreachHealth,
  checkPersistenceHealth,
  checkSessionManagementHealth,
  checkTherapeuticFrameworksHealth,
  checkTrustSystemsHealth,
  checkWellbeingTrackingHealth,
  runAllHealthChecks,
  runCriticalHealthChecks,
  type HealthCheckResult,
  type SystemHealthReport,
} from './deployment/health-checks.js';

// ============================================================================
// LANDING INTELLIGENCE (Gemini-powered landing page optimization)
// ============================================================================

export {
  detectVisitorIntent,
  generatePersonalizedVariant,
  generateDemoConversation,
  getTimeAwareContent,
  getOptimalSectionOrder,
  generateChatGreeting,
  optimizeLandingPage,
  initLandingIntelligence,
  shutdownLandingIntelligence,
  type BehaviorSignals,
  type VisitorIntent,
  type GeneratedVariant,
  type TimeAwareContent,
  type DemoConversation,
  type LayoutOptimization,
  type LandingOptimizationRequest,
  type LandingOptimizationResponse,
} from './landing-intelligence/index.js';

// ============================================================================
// MCP INTEGRATION (Model Context Protocol)
// ============================================================================

export {
  buildMCPTools,
  cleanupMCPConnections,
  getMCPConnectionStatus,
  initializeMCPConnections,
  loadMCPToolsForPersona,
  type MCPToolDefinition,
} from '../personas/bundles/mcp-integration.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import {
  getGlobalServices as _getGlobalServices,
  initializeServices as _initializeServices,
} from './global-services.js';
import {
  createSessionServices as _createSessionServices,
  getActiveSessionIds as _getActiveSessionIds,
  getSessionServices as _getSessionServices,
} from './session-manager.js';
import { shutdownServices as _shutdownServices } from './deployment/shutdown.js';

// ============================================================================
// ASYNC EVENTS (Fire-and-Forget Event System)
// ============================================================================

export {
  AsyncEvents,
  emitConversationStart,
  emitConversationEnd,
  emitTrustUpdate,
  emitAnalyticsInteraction,
  type EventType,
  type EventPayload,
} from './async-events/index.js';

// ============================================================================
// CONTEXT SERVICE (Future Microservice)
// ============================================================================

export {
  ContextService,
  getContextService,
  configureContextService,
  type ContextRequest,
  type ContextResponse,
  type ContextInjection,
  type SearchRequest,
  type SearchResult,
} from './context-service/index.js';

// ============================================================================
// WRITE-AHEAD LOG (Non-blocking Firestore Writes)
// ============================================================================

export {
  initializeFirestoreWAL,
  shutdownFirestoreWAL,
  queueUserProfileUpdate,
  queueUserProfileSet,
  queueSubcollectionWrite,
  queueMemoryWrite,
  queueSessionWrite,
  queueHighPriorityWrite,
  queueDeletion,
  queueAnalyticsEvent,
  flushUserWrites,
  flushAllWrites,
  getWALStatistics,
  isWALHealthy,
  type WritePriority,
} from './data-layer/firestore-wal-integration.js';

export {
  WriteAheadLog,
  getWriteAheadLog,
  queueWrite,
  queueSet,
  queueUpdate,
  queueMerge,
  queueDelete,
  flushWrites,
  getWALStats,
  type WALEntry,
  type WALStats,
  type WALConfig,
} from './data-layer/write-ahead-log.js';

// ============================================================================
// LIFE AUTOMATION SERVICES (NEW - Phase 1 Foundation)
// ============================================================================

// Integration Hub - Central API management
export { IntegrationHub, getIntegrationHub, INTEGRATIONS } from './integrations/index.js';

// Email Intelligence
export { EmailIntelligence, FollowUpTracker, UnsubscribeDetector } from './email/index.js';

// Action Engine - Two-phase transactional execution
export {
  ActionEngine,
  getActionEngine,
  registerActionType,
  getActionTypeConfig,
} from './actions/action-engine.js';

export type {
  Action,
  ActionPayload,
  ActionType,
  ActionStatus,
  ActionResult,
  ActionTypeConfig,
  ActionExecutionContext,
  ActionConfirmationDetails,
  ActionPriority,
  GroceryOrderPayload,
  UberRidePayload,
  LyftRidePayload,
} from './actions/action-types.js';

// Subscription Detector - Detect recurring subscriptions from transactions
export {
  SubscriptionDetector,
  getSubscriptionDetector,
  resetSubscriptionDetector,
  type PlaidTransaction,
  type DetectedSubscription,
} from './subscriptions/subscription-detector.js';

// Meal Planner - Recipe and meal planning
export { MealPlanner, getMealPlanner } from './meals/meal-planner.js';

// Workflow Engine - Automation workflows
export {
  WorkflowEngine,
  getWorkflowEngine,
  resetWorkflowEngine,
  WORKFLOW_TEMPLATES,
  type WorkflowContext,
  type ActionResult as WorkflowActionResult,
} from './workflows/workflow-engine.js';

export default {
  initializeServices: _initializeServices,
  getGlobalServices: _getGlobalServices,
  createSessionServices: _createSessionServices,
  getSessionServices: _getSessionServices,
  getActiveSessionIds: _getActiveSessionIds,
  shutdownServices: _shutdownServices,
};
