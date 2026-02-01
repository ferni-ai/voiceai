/**
 * API Module Exports
 *
 * Centralized exports for all API-related modules.
 *
 * USAGE:
 *   import { handleEngagementRoutes, requireAuth, validateBody } from './api/index.js';
 */

// Route handlers
export {
  handleBackgroundResultsRoutes,
  isBackgroundResultsRoute,
} from './background-results-routes.js';
export { handleBrandRoutes } from './brand-routes.js';
export { handleMemoryRoutes } from './memory-routes.js';
export { handleCameoAnalyticsRoutes } from './cameo-analytics-routes.js';
export { handleCalendarRoutes } from './calendar-routes/index.js';
export { handleCommandsRoutes } from './commands-routes.js';
export { handleDebugRoutes } from './debug-routes.js';
export { handleWidgetRoutes } from './widget-routes.js';
export { handleDORARoutes } from './dora-routes.js';
export { handleEngagementRoutes } from './engagement-routes.js';
export { handleFeatureFlagsRoutes } from './feature-flags-routes.js';
export { handleFeedbackRoutes, isFeedbackRoute } from './feedback-routes.js';
export { handleGardenRoutes } from './garden-routes.js';
export { handleGDPRRoutes } from './gdpr-routes.js';
export { handleHouseholdRoutes } from './household-routes.js';
export {
  clearDashboardCache,
  getDashboardHtml,
  getDashboardPage,
  getHandoffFailures,
  getHandoffMetrics,
  getHandoffTrace,
  getInProgressHandoffs,
  getRecentHandoffs,
  handleDiagnosticsRoutes,
  setupHandoffDiagnosticsRoutes,
} from './handoff-diagnostics.js';
export { handleLandingIntelligenceRoutes } from './landing-intelligence.routes.js';
export { handleLandingOptimizationRoutes } from './landing-optimization.routes.js';
export { handleObservabilityRoutes } from './observability-routes.js';
export { handleOptimizerRoutes } from './optimizer-routes.js';
export { handleStoryJourneyRoutes } from './story-journey-routes.js';
export { handleToolsAnalyticsRoutes } from './tools-analytics-routes.js';
export { handleChatRoutes } from './chat-routes.js';
export { handleTrustExportRoutes } from './trust-export-routes.js';
export { handleTrustJourneyRoutes } from './trust-journey-routes.js';
export { handleTrustSystemsRoutes } from './trust-systems-routes.js';
export { handleRelationshipArcRoutes } from './relationship-arc-routes.js';
export { handlePerformanceRoutes } from './performance-routes.js';
export { handleConciergeRoutes } from './concierge-routes.js';
export {
  handleSubscriptionRequest,
  isSubscriptionRoute,
  routeSubscriptionRequest,
} from './subscription-routes.js';
export { handleVoicePresenceRoutes } from './voice-presence-routes.js';
export { handleWellbeingRoutes } from './wellbeing.routes.js';
export { handleWorkerRoutes } from './worker-routes.js';
export { handleVisualStorytellingRoutes } from './visual-storytelling-routes.js';
export { handleAutomationRoutes } from './automation-routes.js';
export { handleSuperhumanMetricsRoutes } from './superhuman-metrics-routes.js';
export { handleInsightsRoutes } from './insights-routes.js';
export { handleStoryRoutes, isStoryRoute } from './story-routes.js';

// Modular route handlers
export { handleVoiceAuthRoutes } from './voice-auth.routes.js';
export {
  handleMarketplaceRoutes,
  isMarketplaceRoute,
  isMarketplaceAdminRoute,
} from './marketplace-routes.js';

// Helpers
export {
  getCorsHeaders,
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  parsePositiveInt,
  requireUserId,
  sendError,
  sendJSON,
  sendJSONCached,
  type RouteHandler,
} from './helpers.js';

// Authentication
export {
  authenticate,
  checkRateLimit,
  getAuthenticatedUserId,
  optionalAuth,
  rateLimit,
  requireAdmin,
  requireAuth,
  type AuthConfig,
  type AuthContext,
} from './auth-middleware.js';

// Validators
export {
  CompleteRitualSchema,
  // Subscription schemas
  CreateCheckoutSchema,
  // Feature flag schemas
  CreateFeatureFlagSchema,
  CreatePortalSchema,
  CreateRitualSchema,
  DeleteAllDataSchema,
  // Memory schemas
  DeleteMemoryParamsSchema,
  // Export schemas
  ExportDataSchema,
  ISODateSchema,
  LimitSchema,
  PositiveNumberSchema,
  RecordConversationSchema,
  // DORA schemas
  RecordDeploymentSchema,
  RecordIncidentSchema,
  ResolveIncidentSchema,
  UpdateFeatureFlagSchema,
  // Prediction schemas
  UpdatePredictionActualsSchema,
  // Voice presence schemas
  UpdateVoicePresenceConfigSchema,
  // Common schemas
  UserIdSchema,
  // Ritual schemas
  WeatherSchema,
  validateBody,
  validateQuery,
} from './validators.js';
