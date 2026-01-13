/**
 * API v2 Router
 *
 * Main entry point for v2 APIs. Currently includes:
 * - /api/v2/developers/* - Developer platform APIs
 *
 * Future additions:
 * - /api/v2/users/* - User-facing APIs
 * - /api/v2/admin/* - Admin APIs
 *
 * @module api/v2
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { handleDeveloperV2Routes } from './developers/index.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'v2-router' });

/**
 * Main handler for all v2 API routes
 *
 * Returns true if the request was handled, false otherwise.
 * Follows the pattern established by v1 routes.
 */
export async function handleV2Routes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/v2/* routes
  if (!pathname.startsWith('/api/v2/')) {
    return false;
  }

  log.debug({ method: req.method, pathname }, 'Routing v2 request');

  // Developer platform APIs
  if (pathname.startsWith('/api/v2/developers')) {
    return handleDeveloperV2Routes(req, res, pathname);
  }

  // Future: Add more v2 route sections here
  // if (pathname.startsWith('/api/v2/users')) {
  //   return handleUserV2Routes(req, res, pathname);
  // }

  // No handler matched
  return false;
}

// Re-export all v2 modules for convenience
export * from './developers/index.js';
