/**
 * API v1 Router
 *
 * Central router for all versioned API endpoints.
 * Provides stable API contracts with versioning support.
 *
 * Route Structure:
 * /api/v1/
 * ├── /admin/*     - Admin-only APIs (requires admin auth)
 * │   ├── /flags/* - Feature flag management
 * │   ├── /agents/* - Agent management
 * │   ├── /monitoring/* - System monitoring
 * │   └── /evalops/* - Evaluation operations
 * ├── /user/*      - User-facing APIs
 * ├── /voice/*     - Voice authentication APIs
 * ├── /trust/*     - Trust system APIs
 * └── /public/*    - Public APIs (no auth required)
 *
 * @module APIv1Router
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../utils/safe-logger.js';
import { handleAdminRoutes } from './admin/index.js';

const log = createLogger({ module: 'APIv1' });

// Base path for v1 API
const BASE_PATH = '/api/v1';

/**
 * Handle all v1 API routes
 * @returns true if the request was handled
 */
export async function handleV1Routes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/v1 routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  log.debug({ pathname, method: req.method }, 'API v1 request');

  // Admin routes
  if (pathname.startsWith(`${BASE_PATH}/admin`)) {
    return handleAdminRoutes(req, res, pathname, parsedUrl);
  }

  // User routes (to be migrated)
  // if (pathname.startsWith(`${BASE_PATH}/user`)) {
  //   return handleUserRoutes(req, res, pathname, parsedUrl);
  // }

  // Voice routes (to be migrated)
  // if (pathname.startsWith(`${BASE_PATH}/voice`)) {
  //   return handleVoiceRoutes(req, res, pathname, parsedUrl);
  // }

  // Trust routes (to be migrated)
  // if (pathname.startsWith(`${BASE_PATH}/trust`)) {
  //   return handleTrustRoutes(req, res, pathname, parsedUrl);
  // }

  // Public routes (to be migrated)
  // if (pathname.startsWith(`${BASE_PATH}/public`)) {
  //   return handlePublicRoutes(req, res, pathname, parsedUrl);
  // }

  // Route not matched in v1
  return false;
}

export default { handleV1Routes };

// Re-export sub-routers
export { handleAdminRoutes } from './admin/index.js';

