/**
 * API Module Exports
 *
 * Centralized exports for all API-related modules.
 *
 * USAGE:
 *   import { handleEngagementRoutes, requireAuth, validateBody } from './api/index.js';
 */

// Route handlers
export { handleBrandRoutes } from './brand-routes.js';
export { handleCommandsRoutes } from './commands-routes.js';
export { handleWidgetRoutes } from './widget-routes.js';
export { handleDORARoutes } from './dora-routes.js';
export { handleEngagementRoutes } from './engagement-routes.js';
export { handleFeatureFlagsRoutes } from './feature-flags-routes.js';
export { handleGDPRRoutes } from './gdpr-routes.js';
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
export { handleObservabilityRoutes } from './observability-routes.js';
export { handleOptimizerRoutes } from './optimizer-routes.js';
export { handleToolsAnalyticsRoutes } from './tools-analytics-routes.js';
export { handlePerformanceRoutes } from './performance-routes.js';
export {
  handleSubscriptionRequest,
  isSubscriptionRoute,
  routeSubscriptionRequest,
} from './subscription-routes.js';
export { handleVoicePresenceRoutes } from './voice-presence-routes.js';

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
