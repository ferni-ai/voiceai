/**
 * Developer Console API Routes
 *
 * Provides API endpoints for the developer console at developers.ferni.ai:
 * - /api/v1/developers/auth/* - Authentication (Firebase)
 * - /api/v1/developers/keys/* - API key management
 *
 * Future routes:
 * - /api/v1/developers/personas/* - Persona creation/management
 * - /api/v1/developers/voices/* - Voice preview/selection
 * - /api/v1/developers/analytics/* - Usage statistics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { handleDeveloperAuthRoutes } from './auth-routes.js';
import { handleDeveloperKeysRoutes } from './keys-routes.js';

/**
 * Main handler for all developer console routes
 */
export async function handleDeveloperRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/v1/developers/* routes
  if (!pathname.startsWith('/api/v1/developers')) {
    return false;
  }

  // Try each route handler in order
  if (await handleDeveloperAuthRoutes(req, res, pathname)) {
    return true;
  }

  if (await handleDeveloperKeysRoutes(req, res, pathname)) {
    return true;
  }

  // No handler matched
  return false;
}

// Re-export types
export type { DeveloperSession } from './auth-routes.js';
