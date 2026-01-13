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
export type { ConversationAnalysis, ConversationState, CreateSessionOptions, DynamicUserContext, EmotionResult, GlobalServices, HumanizingStateUpdate, IntentResult, PromptContext, SessionServices, SpeechContext, UserProfile, } from './types.js';
export { getGlobalServices, getGlobalServicesSync, getStartupCapabilities, initializeServices, isPersonaIndexed, markPersonaIndexed, resetGlobalServices, } from './global-services.js';
export { checkEmbeddingConsistency, getCapabilitySummary, hasFullCapabilities, validateAndLog, validateStartup, type StartupCapabilities, type ValidationConfig, type ValidationResult, } from './deployment/startup-validation.js';
export { applyIntelligenceToProfile, cleanupIntelligenceEngines, exportIntelligenceState, getAutoSaveStatus, importIntelligenceState, loadIntelligenceFromProfile, startAutoSave, stopAllAutoSaves, stopAutoSave, type IntelligenceState, type PersistenceConfig, } from './intelligence-persistence.js';
export { persistenceMetrics, withMetrics, withMetricsSync, type PersistenceMetricsSnapshot, } from './analytics/persistence-metrics.js';
export { errorTracking, trackApiCall, trackHandoff, trackVoiceSession, withErrorTracking, } from './error-tracking.js';
export { performanceProfiler, Timed, withTiming } from './performance-profiler.js';
export { perfInstrumentation, PerformanceInstrumentation, type MemoryAlert, type MemoryAlertConfig, type MemorySnapshot, type PerformanceReport, type PhaseTimng, type ToolLoadMetrics, } from './performance-instrumentation.js';
export { clearAllSessions, createSessionServices, getActiveSessionCount, getActiveSessionIds, getSessionServices, } from './session-manager.js';
export { shutdownServices } from './deployment/shutdown.js';
export { cleanupStaleConversations, ConversationStateManager, endConversation, getActiveSessionIds as getActiveConversationIds, getConversationState, hasConversationState, type ConversationState as ConversationStateType, type EmotionalContext, type FlowContext, type ToolExecutionData, type TopicContext, type UserContext, } from './conversation-state.js';
export { formatPhoneForDisplay, getGreeting, getLLMAuthContext, identifyByPhone, identifyByWebAuth, identifyFromMetadata, identifyWithNaturalAuth, isValidPhoneNumber, linkPhoneToProfile, linkWebAuthToPhone, normalizePhoneNumber, type AuthAction as UserAuthAction, type AuthContext as UserAuthContext, type ConfidenceLevel as UserConfidenceLevel, } from './identity/user-identification.js';
export { compareVoiceSketches, getVoiceMemory, VoiceMemoryService, VoiceSketchBuilder, type VoiceSearchResult, type VoiceSimilarityResult, type VoiceSketch, } from './memory/voice-memory.js';
export { identifyWithVoice, mergeVoiceSketch, type VoiceIdentificationResult, type VoiceVerificationResult, } from './voice/voice-identification.js';
export { authenticateNaturally, enrollVoice, generateContextForLLM, getNaturalGreeting, linkIdentifier, updateVoiceSignature, verifyIdentity, type AuthAction, type AuthContext, type ConfidenceLevel, } from './identity/natural-auth.js';
export { getProductivityStore, initializeProductivityStore, shutdownProductivityStore, type BillData, type HabitData, type MedicationData, type NoteData, type ProductivityData, type RoutineData, type TaskData, } from './stores/productivity-store.js';
export { getCollectiveLearningStore, initializeCollectiveLearning, shutdownCollectiveLearning, } from './memory/collective-learning-store.js';
export { getTeamManager, initializeTeamManager, resetTeamManager, TeamManager, } from './team-manager.js';
export { getGamificationStore, initializeMayaGamificationStore, type BehaviorToolUsage, type ChallengeProgress, type EarnedBadge, type GamificationExport, type GamificationProfile, type LeaderboardEntry, type MoodLog, } from './engagement/gamification-store.js';
export { getMayaNotificationService, initializeMayaNotificationService, shutdownEngagementNotificationService, type MayaNotificationPreferences, type MayaNotificationRequest, type MayaNotificationType, } from './engagement/engagement-notification-service.js';
export { consolidateProfiles, deletePhoneMapping, findDuplicateProfiles, findProfilesByVoice, generateVoiceRecognitionGreeting, getCachedPhoneMapping, getProactiveMemories, initializeMemoryManagement, loadPhoneCache, pruneMemorySystem, savePhoneMapping, shouldSurfaceMemory, shutdownMemoryManagement, type ConsolidationResult, type ProactiveMemory, type PruningConfig, type PruningResult, } from './memory/memory-management.js';
export { getBackgroundTaskService, initializeBackgroundTasks, registerTaskHandler, shutdownBackgroundTasks, type BackgroundData, type BackgroundTask, type Delegation, type PendingAction, type ScheduledJob, type TaskPriority, type TaskStatus, type Workflow, type WorkflowStep, } from './scheduling/background-tasks.js';
export { cancelReminder, createReminder, createVoiceMessage, deliverReminder, getDueReminders, getPendingReminders, parseNaturalTime, sendVoiceMessage, startReminderScheduler, stopReminderScheduler, type ReminderDeliveryMethod, type ScheduledReminder, type VoiceMessage, } from './scheduling/reminder-scheduler.js';
export { getAgentBus, type AgentId, type AgentMessage } from './agent-bus.js';
export { getLifeDataStore, type LifeGoal, type LifeMilestone, type LifePortfolio, type RetirementPlan, } from './stores/life-data-store.js';
export { getDJController, resetDJController, PERSONA_DJ_STYLES as DJ_PERSONA_STYLES, type PersonaDJStyle as DJPersonaStyle, } from '../audio/index.js';
export { getContextualMusicSuggestion, getCrossSessionMusicCallback, getDJStyle, getMusicAppreciationComment, getMusicConversationStarter as getDJMusicConversationStarter, getMusicDiscoveryOffer, getMusicElementAppreciation, getQueueTeaser, getReadTheRoomAction, getSpontaneousMusicOffer, } from './dj-service.js';
export { getProactiveScheduler, startProactiveScheduler, stopProactiveScheduler, type ProactiveNotification, } from './scheduling/proactive-scheduler.js';
export { analyzeMessage, type ConversationLearningData, type ConversationPatternAnalyzer, type CrossSessionThreader, type FinancialJourneyTracker, type ProactiveInsightEngine, type ResponseQualityTracker, type VoicePaceAdapter, } from '../intelligence/index.js';
export { ragLookup as semanticRagLookup, type ConversationTurn } from '../memory/index.js';
export { buildSpeechContext, tagTextWithSsmlAdaptive } from '../speech/index.js';
export { buildMetadataWithGeo, detectGeoFromRequest, extractCloudGeoHeaders, geoDetectionMiddleware, getClientIP, lookupIPCountry, parseAcceptLanguage, type GeoDetectionOptions, type GeoDetectionResult, } from './identity/geo-detection.js';
export { clearLocalizationCache, getLocalizationCacheStats, getLocalizedVoiceId, getLocalizedVoiceIdSync, initializeLocalizationService, isVoiceCached, loadCacheFromFirestore, preWarmLocalizedVoices, type LocalizationResult, type LocalizedVoice, } from './voice/cartesia-voice-localization.js';
export { buildCameoSpeech, CAMEO_CONFIG, CAMEO_TIMING, cameoEvents, cancelCameo, detectCameoOpportunity, endCameo, executeCameo, getCooldownStatus as getCameoCooldownStatus, getCameoGreeting, getCameoHandback, getCameoSessionState, getCameoStats, getCurrentCameoPersona, hasPersonaCameoed, isInCameo, resetSessionState as resetCameoSessionState, type CameoEvent, type CameoPersonaId, type CameoRequest, type CameoResult, type CameoSessionState, } from './cameo/index.js';
export { checkCognitiveIntelligenceHealth, checkFeatureFlagsHealth, checkObservabilityHealth, checkOutreachHealth, checkPersistenceHealth, checkSessionManagementHealth, checkTherapeuticFrameworksHealth, checkTrustSystemsHealth, checkWellbeingTrackingHealth, runAllHealthChecks, runCriticalHealthChecks, type HealthCheckResult, type SystemHealthReport, } from './deployment/health-checks.js';
export { detectVisitorIntent, generatePersonalizedVariant, generateDemoConversation, getTimeAwareContent, getOptimalSectionOrder, generateChatGreeting, optimizeLandingPage, initLandingIntelligence, shutdownLandingIntelligence, type BehaviorSignals, type VisitorIntent, type GeneratedVariant, type TimeAwareContent, type DemoConversation, type LayoutOptimization, type LandingOptimizationRequest, type LandingOptimizationResponse, } from './landing-intelligence/index.js';
export { buildMCPTools, cleanupMCPConnections, getMCPConnectionStatus, initializeMCPConnections, loadMCPToolsForPersona, type MCPToolDefinition, } from '../personas/bundles/mcp-integration.js';
import { getGlobalServices as _getGlobalServices, initializeServices as _initializeServices } from './global-services.js';
import { createSessionServices as _createSessionServices } from './session-manager.js';
import { shutdownServices as _shutdownServices } from './deployment/shutdown.js';
export { AsyncEvents, emitConversationStart, emitConversationEnd, emitTrustUpdate, emitAnalyticsInteraction, type EventType, type EventPayload, } from './async-events/index.js';
export { ContextService, getContextService, configureContextService, type ContextRequest, type ContextResponse, type ContextInjection, type SearchRequest, type SearchResult, } from './context-service/index.js';
export { initializeFirestoreWAL, shutdownFirestoreWAL, queueUserProfileUpdate, queueUserProfileSet, queueSubcollectionWrite, queueMemoryWrite, queueSessionWrite, queueHighPriorityWrite, queueDeletion, queueAnalyticsEvent, flushUserWrites, flushAllWrites, getWALStatistics, isWALHealthy, type WritePriority, } from './firestore-wal-integration.js';
export { WriteAheadLog, getWriteAheadLog, queueWrite, queueSet, queueUpdate, queueMerge, queueDelete, flushWrites, getWALStats, type WALEntry, type WALStats, type WALConfig, } from './write-ahead-log.js';
export { IntegrationHub, getIntegrationHub, INTEGRATIONS } from './integrations/index.js';
export { EmailIntelligence, FollowUpTracker, UnsubscribeDetector } from './email/index.js';
export { ActionEngine, getActionEngine, registerActionType, getActionTypeConfig, } from './actions/action-engine.js';
export type { Action, ActionPayload, ActionType, ActionStatus, ActionResult, ActionTypeConfig, ActionExecutionContext, ActionConfirmationDetails, ActionPriority, GroceryOrderPayload, UberRidePayload, LyftRidePayload, } from './actions/action-types.js';
export { SubscriptionDetector, getSubscriptionDetector, resetSubscriptionDetector, type PlaidTransaction, type DetectedSubscription, } from './subscriptions/subscription-detector.js';
export { MealPlanner, getMealPlanner } from './meals/meal-planner.js';
export { WorkflowEngine, getWorkflowEngine, resetWorkflowEngine, WORKFLOW_TEMPLATES, type WorkflowContext, type ActionResult as WorkflowActionResult, } from './workflows/workflow-engine.js';
declare const _default: {
    initializeServices: typeof _initializeServices;
    getGlobalServices: typeof _getGlobalServices;
    createSessionServices: typeof _createSessionServices;
    getSessionServices: typeof import("./session-manager/access.js").getSessionServices;
    getActiveSessionIds: typeof import("./session-manager/access.js").getActiveSessionIds;
    shutdownServices: typeof _shutdownServices;
};
export default _default;
//# sourceMappingURL=index.d.ts.map