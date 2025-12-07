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
import {
  getFeatureFlags,
  type FeatureFlag,
} from '../services/feature-flags.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

/**
 * Send JSON response
 */
function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: message }));
}

/**
 * Parse request body as JSON
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

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
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  // Only handle /api/flags routes
  if (!pathname.startsWith('/api/flags')) {
    return false;
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
      flags.reload();
      sendJSON(res, { success: true, message: 'Flags reloaded' });
      return true;
    }

    // POST /api/flags - Create new flag
    if (pathname === '/api/flags' && method === 'POST') {
      const body = (await parseBody(req)) as Partial<FeatureFlag>;

      if (!body.id || !body.name || !body.type || !body.category) {
        sendError(res, 'Missing required fields: id, name, type, category', 400);
        return true;
      }

      try {
        const newFlag = flags.createFlag({
          id: body.id,
          name: body.name,
          description: body.description || '',
          type: body.type,
          enabled: body.enabled ?? false,
          percentage: body.percentage,
          userIds: body.userIds,
          value: body.value,
          category: body.category,
          metadata: body.metadata,
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
      const body = (await parseBody(req)) as Partial<FeatureFlag>;

      const updatedFlag = flags.updateFlag(flagId, body, 'api');

      if (!updatedFlag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      sendJSON(res, { success: true, flag: updatedFlag });
      return true;
    }

    // DELETE /api/flags/:id - Delete flag
    if (flagIdMatch && method === 'DELETE') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const deleted = flags.deleteFlag(flagId);

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

