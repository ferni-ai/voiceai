/**
 * Feature Flag API Routes
 *
 * REST API for managing feature flags:
 * - GET /api/flags - List all flags
 * - GET /api/flags/:id - Get a specific flag
 * - PUT /api/flags/:id - Update a flag
 * - POST /api/flags - Create a new flag
 * - DELETE /api/flags/:id - Delete a flag
 * - POST /api/flags/:id/toggle - Quick toggle a flag
 * - GET /api/flags/categories - List categories
 * - POST /api/flags/reload - Force reload from storage
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getFeatureFlags } from '../services/feature-flags.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, handleCorsPreflightIfNeeded } from './helpers.js';
import { requireAuth, requireAdmin, rateLimit } from './auth-middleware.js';
import { validateBody, CreateFeatureFlagSchema, UpdateFeatureFlagSchema } from './validators.js';

const log = createLogger({ module: 'FeatureFlagAPI' });

/**
 * Handle feature flag API routes
 * @returns true if the request was handled
 */
export async function handleFeatureFlagRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/flags routes
  if (!pathname.startsWith('/api/flags')) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Write operations require admin access
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
  } else {
    // Read operations require basic auth
    const auth = requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  }

  const flags = getFeatureFlags();

  try {
    // GET /api/flags - List all flags
    if (pathname === '/api/flags' && method === 'GET') {
      const allFlags = flags.getAllFlags();
      const categories = flags.getCategories();

      sendJSON(res, {
        flags: allFlags,
        categories,
        count: allFlags.length,
      });
      return true;
    }

    // GET /api/flags/categories - List categories
    if (pathname === '/api/flags/categories' && method === 'GET') {
      sendJSON(res, { categories: flags.getCategories() });
      return true;
    }

    // POST /api/flags/reload - Force reload
    if (pathname === '/api/flags/reload' && method === 'POST') {
      void flags.reload();
      sendJSON(res, { success: true, message: 'Flags reloaded' });
      return true;
    }

    // POST /api/flags - Create new flag
    if (pathname === '/api/flags' && method === 'POST') {
      const body = await validateBody(req, res, CreateFeatureFlagSchema);
      if (!body) return true; // Validation failed

      try {
        const newFlag = await flags.createFlag({
          id: body.id,
          name: body.name,
          description: body.description || '',
          enabled: body.enabled,
          rolloutPercentage: body.percentage,
        });

        sendJSON(res, { success: true, flag: newFlag }, 201);
      } catch (e) {
        sendError(res, (e as Error).message, 400);
      }
      return true;
    }

    // Routes with flag ID
    const flagIdMatch = pathname.match(/^\/api\/flags\/([^/]+)$/);
    const toggleMatch = pathname.match(/^\/api\/flags\/([^/]+)\/toggle$/);

    // POST /api/flags/:id/toggle - Quick toggle
    if (toggleMatch && method === 'POST') {
      const flagId = decodeURIComponent(toggleMatch[1]);
      const flag = flags.getFlag(flagId);

      if (!flag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      const updatedFlag = flags.updateFlag(flagId, { enabled: !flag.enabled });
      sendJSON(res, { success: true, flag: updatedFlag });
      return true;
    }

    // GET /api/flags/:id - Get specific flag
    if (flagIdMatch && method === 'GET') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const flag = flags.getFlag(flagId);

      if (!flag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      sendJSON(res, { flag });
      return true;
    }

    // PUT /api/flags/:id - Update flag
    if (flagIdMatch && method === 'PUT') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const body = await validateBody(req, res, UpdateFeatureFlagSchema);
      if (!body) return true; // Validation failed

      // Check flag exists first
      const existingFlag = flags.getFlag(flagId);
      if (!existingFlag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      await flags.updateFlag(flagId, body);
      const updatedFlag = flags.getFlag(flagId);

      sendJSON(res, { success: true, flag: updatedFlag });
      return true;
    }

    // DELETE /api/flags/:id - Delete flag
    if (flagIdMatch && method === 'DELETE') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const deleted = await flags.deleteFlag(flagId);

      if (!deleted) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      sendJSON(res, { success: true, message: `Flag "${flagId}" deleted` });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Feature flag API error');
    sendError(res, 'Internal server error');
    return true;
  }
}
