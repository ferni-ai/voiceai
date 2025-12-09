/**
 * Admin API Router (v1)
 *
 * Aggregates all admin-only API routes under /api/v1/admin/*
 * All routes require admin authentication.
 *
 * Sub-routes:
 * - /api/v1/admin/flags/*     - Feature flag management
 * - /api/v1/admin/agents/*    - Agent management
 * - /api/v1/admin/monitoring/* - System monitoring
 * - /api/v1/admin/evalops/*   - Evaluation operations
 * - /api/v1/admin/diagnostics/* - Handoff diagnostics
 *
 * @module AdminAPIRouter
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import { handleAdminFlagsRoutes } from './flags.js';

const log = createLogger({ module: 'AdminAPI' });

// Base path for admin routes
const BASE_PATH = '/api/v1/admin';

/**
 * Handle all admin API routes
 * @returns true if the request was handled
 */
export async function handleAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/v1/admin routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  log.debug({ pathname, method: req.method }, 'Admin API request');

  // Route to specific admin handlers
  // Feature Flags
  if (pathname.startsWith(`${BASE_PATH}/flags`)) {
    return handleAdminFlagsRoutes(req, res, pathname, parsedUrl);
  }

  // Agent management (to be implemented)
  // if (pathname.startsWith(`${BASE_PATH}/agents`)) {
  //   return handleAdminAgentsRoutes(req, res, pathname, parsedUrl);
  // }

  // Monitoring (to be implemented)
  // if (pathname.startsWith(`${BASE_PATH}/monitoring`)) {
  //   return handleAdminMonitoringRoutes(req, res, pathname, parsedUrl);
  // }

  // EvalOps (to be implemented)
  // if (pathname.startsWith(`${BASE_PATH}/evalops`)) {
  //   return handleAdminEvalOpsRoutes(req, res, pathname, parsedUrl);
  // }

  // Diagnostics (to be implemented)
  // if (pathname.startsWith(`${BASE_PATH}/diagnostics`)) {
  //   return handleAdminDiagnosticsRoutes(req, res, pathname, parsedUrl);
  // }

  // Route not matched
  return false;
}

export default { handleAdminRoutes };

// Re-export sub-routes for direct access if needed
export { handleAdminFlagsRoutes } from './flags.js';

