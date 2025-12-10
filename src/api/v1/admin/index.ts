/**
 * Admin API Router (v1)
 *
 * Aggregates all admin-only API routes under /api/v1/admin/*
 * All routes require admin authentication.
 *
 * Sub-routes:
 * - /api/v1/admin/flags/*       - Feature flag management
 * - /api/v1/admin/agents/*      - Agent management
 * - /api/v1/admin/diagnostics/* - System diagnostics & handoff monitoring
 *
 * @module AdminAPIRouter
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import { handleAdminAgentsRoutes } from './agents.js';
import { handleAdminDashboardRoutes } from './dashboard.js';
import { handleAdminDiagnosticsRoutes } from './diagnostics.js';
import { handleAdminExperimentsRoutes } from './experiments.js';
import { handleAdminFlagsRoutes } from './flags.js';
import { handleHumanListeningRoutes } from './human-listening.js';

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
  // Dashboard aggregation
  if (pathname.startsWith(`${BASE_PATH}/dashboard`)) {
    return handleAdminDashboardRoutes(req, res, pathname, parsedUrl);
  }

  // Feature Flags
  if (pathname.startsWith(`${BASE_PATH}/flags`)) {
    return handleAdminFlagsRoutes(req, res, pathname, parsedUrl);
  }

  // Agent management
  if (pathname.startsWith(`${BASE_PATH}/agents`)) {
    return handleAdminAgentsRoutes(req, res, pathname, parsedUrl);
  }

  // Diagnostics & Handoff monitoring
  if (pathname.startsWith(`${BASE_PATH}/diagnostics`)) {
    return handleAdminDiagnosticsRoutes(req, res, pathname, parsedUrl);
  }

  // Human Listening insights
  if (pathname.startsWith(`${BASE_PATH}/human-listening`)) {
    return handleHumanListeningRoutes(req, res, pathname, parsedUrl);
  }

  // Web Experiments management
  if (pathname.startsWith(`${BASE_PATH}/experiments`)) {
    return handleAdminExperimentsRoutes(req, res, pathname, parsedUrl);
  }

  // Route not matched
  return false;
}

export default { handleAdminRoutes };

// Re-export sub-routes for direct access if needed
export { handleAdminAgentsRoutes } from './agents.js';
export { getRecentActivity, handleAdminDashboardRoutes, recordActivity } from './dashboard.js';
export { handleAdminDiagnosticsRoutes, recordHandoffEvent } from './diagnostics.js';
export { handleAdminExperimentsRoutes } from './experiments.js';
export { handleAdminFlagsRoutes } from './flags.js';
export {
  endLiveSession,
  handleHumanListeningRoutes,
  recordListeningEvent,
  updateLiveSession,
} from './human-listening.js';
