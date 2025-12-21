/**
 * Engagement API Routes
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Main router for engagement endpoints. Handlers are organized into modular files
 * in the routes/ directory for better maintainability.
 *
 * REST endpoints:
 * - GET /api/conversations - Conversation history
 * - GET /api/analytics/user - User progress analytics
 * - GET /api/predictions - User predictions
 * - POST /api/predictions/:id/actuals - Update prediction actuals
 * - GET /api/cognitive/memories - What I've learned
 * - DELETE /api/cognitive/memories/:id - Forget a memory
 * - GET /api/rituals - User rituals
 * - POST /api/rituals - Create a ritual
 * - DELETE /api/rituals/:id - Delete a ritual
 * - POST /api/rituals/:id/complete - Complete a ritual
 * - GET /api/huddles - Team huddles
 * - GET /api/export/categories - Exportable data categories
 * - POST /api/export - Export user data
 * - DELETE /api/export/all - GDPR data deletion
 * - GET /api/relationship/progress - Relationship progress
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { optionalAuthAsync, rateLimit } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import { getUserId, handleCorsPreflightIfNeeded, sendError } from './helpers.js';

// Import modular route handlers
import { handleAnalyticsRoutes } from './routes/analytics.js';
import { handleConversationsRoutes } from './routes/conversations.js';
import { handleDataRoutes } from './routes/data.js';
import { handleGamesRoutes } from './routes/games.js';
import { handleGroupCoachingRoutes } from './routes/group-coaching.js';
import { handleGrowthRoutes } from './routes/growth.js';
import { handleMemoriesRoutes } from './routes/memories.js';
import { handlePredictionsRoutes } from './routes/predictions.js';
import { handleRelationshipRoutes } from './routes/relationship.js';
import { handleRitualsRoutes } from './routes/rituals.js';
import { handleSkyCheckRoutes } from './routes/sky-check.js';
import { handleTeamRoutes } from './routes/team.js';
import { handleTeamInsightsRoutes } from './routes/team-insights.js';
import { handleLifeContextRoutes } from './life-context-routes.js';
import { handleVideoSessionRoutes } from './routes/video-sessions.js';
import { handleWearableRoutes } from './routes/wearable.js';

// Route prefixes handled by this module (for early bailout)
const ENGAGEMENT_ROUTE_PREFIXES = [
  '/api/conversations',
  '/api/analytics',
  '/api/predictions',
  '/api/rituals',
  '/api/cognitive',
  '/api/huddles',
  '/api/export',
  '/api/relationship',
  '/api/games',
  '/api/sky-check',
  '/api/growth',
  '/api/video',
  '/api/wearable',
  '/api/group',
  '/api/team-insights',
  '/api/life-context',
];

/**
 * Check if a pathname matches an engagement route prefix
 */
function isEngagementRoute(pathname: string): boolean {
  return ENGAGEMENT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Handle engagement API routes
 * @returns true if route was handled
 */
export async function handleEngagementRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // EARLY BAILOUT: Don't process routes we don't handle
  // This prevents auth errors for routes like /api/agents
  if (!isEngagementRoute(pathname)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting (100 requests per minute per IP)
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true; // Rate limited
  }

  // Auth strategy for engagement routes:
  // 1. Try Firebase auth (preferred) - sets userId to Firebase UID
  // 2. Fall back to userId from query params or X-User-Id header (legacy device IDs)
  // This allows users who haven't migrated to Firebase to still use the API
  const auth = await optionalAuthAsync(req);

  // If we have Firebase auth, we can use the userId from there
  // Otherwise, individual handlers will get userId from query params/headers
  // We still need SOME form of user identification
  const userId = auth?.userId || getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }

  // Store userId in request for handlers to use
  // This normalizes Firebase UID vs device ID for downstream handlers
  if (auth) {
    // If we have Firebase auth, set the X-User-Id header so handlers use Firebase UID
    (req.headers as Record<string, string | string[] | undefined>)['x-user-id'] = auth.userId;
  }

  // Delegate to modular route handlers
  // Each handler returns true if it handled the route, false otherwise

  // Conversations
  if (await handleConversationsRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Analytics
  if (await handleAnalyticsRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Predictions
  if (await handlePredictionsRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Rituals
  if (await handleRitualsRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Cognitive Memories
  if (await handleMemoriesRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Team/Huddles
  if (await handleTeamRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Data Export/Delete
  if (await handleDataRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Relationship Progress
  if (await handleRelationshipRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Games (Music insights, dashboard data)
  if (await handleGamesRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Sky Check (Daily check-in / emotional weather)
  if (await handleSkyCheckRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Growth Visibility (User progress insights)
  if (await handleGrowthRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Video Sessions (Multi-modal)
  if (await handleVideoSessionRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Wearable Integration (Health data)
  if (await handleWearableRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Group Coaching (Multi-participant sessions)
  if (await handleGroupCoachingRoutes(req, res, pathname, parsedUrl)) {
    return true;
  }

  // Team Insights (Cross-persona intelligence)
  if (await handleTeamInsightsRoutes(req, res, pathname)) {
    return true;
  }

  // Life Context (Phase 6 Cross-Domain Synthesis)
  if (await handleLifeContextRoutes(req, res, pathname)) {
    return true;
  }

  // Route not handled
  return false;
}
