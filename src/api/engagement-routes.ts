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
import { handleCorsPreflightIfNeeded } from './helpers.js';
import { requireAuth, rateLimit } from './auth-middleware.js';

// Import modular route handlers
import { handleConversationsRoutes } from './routes/conversations.js';
import { handleAnalyticsRoutes } from './routes/analytics.js';
import { handlePredictionsRoutes } from './routes/predictions.js';
import { handleRitualsRoutes } from './routes/rituals.js';
import { handleMemoriesRoutes } from './routes/memories.js';
import { handleTeamRoutes } from './routes/team.js';
import { handleDataRoutes } from './routes/data.js';
import { handleRelationshipRoutes } from './routes/relationship.js';
import { handleGamesRoutes } from './routes/games.js';
import { handleSkyCheckRoutes } from './routes/sky-check.js';

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

  // Require authentication for all engagement routes
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // Auth failed, 401 already sent
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

  // Route not handled
  return false;
}
