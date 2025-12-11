/**
 * API Module Exports
 *
 * Centralized exports for all API-related modules.
 *
 * USAGE:
 *   import { handleEngagementRoutes, requireAuth, validateBody } from './api/index.js';
 */

// Route handlers
export { handleEngagementRoutes } from './engagement-routes.js';
export { handleDORARoutes } from './dora-routes.js';
export { handleFeatureFlagsRoutes } from './feature-flags-routes.js';
export { handleVoicePresenceRoutes } from './voice-presence-routes.js';
export { handleObservabilityRoutes } from './observability-routes.js';
export { handleGDPRRoutes } from './gdpr-routes.js';
export { handlePerformanceRoutes } from './performance-routes.js';
export {
  handleSubscriptionRequest,
  isSubscriptionRoute,
  routeSubscriptionRequest,
} from './subscription-routes.js';
export {
  getHandoffMetrics,
  getRecentHandoffs,
  getHandoffFailures,
  getInProgressHandoffs,
  getHandoffTrace,
  setupHandoffDiagnosticsRoutes,
  handleDiagnosticsRoutes,
  getDashboardPage,
  getDashboardHtml,
  clearDashboardCache,
} from './handoff-diagnostics.js';

// Helpers
export {
  parseBody,
  getUserId,
  requireUserId,
  sendJSON,
  sendJSONCached,
  sendError,
  getCorsHeaders,
  handleCorsPreflightIfNeeded,
  parsePositiveInt,
  type RouteHandler,
} from './helpers.js';

// Authentication
export {
  authenticate,
  requireAuth,
  requireAdmin,
  optionalAuth,
  getAuthenticatedUserId,
  checkRateLimit,
  rateLimit,
  type AuthContext,
  type AuthConfig,
} from './auth-middleware.js';

// Validators
export {
  validateBody,
  validateQuery,
  // Common schemas
  UserIdSchema,
  LimitSchema,
  ISODateSchema,
  PositiveNumberSchema,
  // Ritual schemas
  WeatherSchema,
  CreateRitualSchema,
  CompleteRitualSchema,
  // Prediction schemas
  UpdatePredictionActualsSchema,
  // Export schemas
  ExportDataSchema,
  DeleteAllDataSchema,
  // Memory schemas
  DeleteMemoryParamsSchema,
  // Subscription schemas
  CreateCheckoutSchema,
  CreatePortalSchema,
  RecordConversationSchema,
  // DORA schemas
  RecordDeploymentSchema,
  RecordIncidentSchema,
  ResolveIncidentSchema,
  // Feature flag schemas
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  // Voice presence schemas
  UpdateVoicePresenceConfigSchema,
} from './validators.js';
