/**
 * UI Server request handler
 *
 * Applies the shared request pipeline (request ID, security headers, CORS,
 * verified identity, subdomain rewriting, health/security endpoints, global API rate limit),
 * then walks the route groups in order and falls back to static files.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import { setCorsHeaders, handleCorsPreflightRequest } from '../../shared/cors.js';
import { setSecurityHeaders } from '../../shared/security-headers.js';
import {
  addRequestId,
  handleHealthEndpoint,
  handleSecurityMonitoring,
} from '../../../utils/ddos-protection.js';
import { rateLimit } from '../../../api/auth-middleware.js';
import { enforceVerifiedIdentity } from '../../../api/identity-guard.js';
import { handleStaticRoutes } from '../static.js';
import { dispatchCoreRoutes } from './core-routes.js';
import { dispatchFeatureRoutes } from './feature-routes.js';
import { dispatchIntegrationRoutes } from './integration-routes.js';
import { dispatchPlatformRoutes } from './platform-routes.js';
import type { RouteContext, RouteGroup } from './route-context.js';

const log = createLogger({ module: 'APIServer' });

/** Subdomains of ferni.ai that belong to the main app, not custom agent sites. */
const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'mail', 'staging', 'dev', 'test'];

/** Route groups, in dispatch order. */
const ROUTE_GROUPS: readonly RouteGroup[] = [
  // LOCAL ROUTES (TypeScript modules) + "Better Than Human" routes
  dispatchIntegrationRoutes,
  // EXISTING API ROUTES (from src/api/)
  dispatchFeatureRoutes,
  dispatchPlatformRoutes,
  dispatchCoreRoutes,
];

/**
 * SUBDOMAIN ROUTING for *.ferni.ai custom agent sites.
 * e.g., joel-dickson.ferni.ai -> /sites/joel-dickson
 */
function rewriteSubdomainPath(req: IncomingMessage, pathname: string): string {
  const host = req.headers.host || '';
  const subdomainMatch = host.match(/^([a-z0-9-]+)\.ferni\.ai$/i);
  if (subdomainMatch) {
    const subdomain = subdomainMatch[1].toLowerCase();
    // Skip reserved subdomains (these should go to main app)
    if (!RESERVED_SUBDOMAINS.includes(subdomain)) {
      // Rewrite pathname to serve the deployed site
      const rewrittenPath = `/sites/${subdomain}${pathname === '/' ? '' : pathname}`;
      log.debug({ host, subdomain, rewrittenPath }, 'Subdomain routing');
      return rewrittenPath;
    }
  }
  return pathname;
}

/**
 * Handle one UI server request.
 */
export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Add request ID for tracing
  addRequestId(req, res);

  // Set security headers (HSTS, CSP, X-Frame-Options, etc.)
  setSecurityHeaders(res);

  // Handle CORS
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    handleCorsPreflightRequest(req, res);
    return;
  }

  // SECURITY: identity comes only from verified credentials (or anonymous
  // device IDs); strips client-claimed x-firebase-uid / x-user-id / ?userId
  await enforceVerifiedIdentity(req);

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = rewriteSubdomainPath(req, parsedUrl.pathname);

  // Health endpoint with rate limiting (DDoS Protection)
  if (handleHealthEndpoint(req, res, pathname, 'bogle-ui')) {
    return;
  }

  // Security monitoring endpoint (Admin Only)
  if (handleSecurityMonitoring(req, res, pathname)) {
    return;
  }

  // Global rate limiting for API routes
  if (pathname.startsWith('/api/') && pathname !== '/api/health') {
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return;
    }
  }

  const ctx: RouteContext = { req, res, pathname, parsedUrl };
  for (const group of ROUTE_GROUPS) {
    // Sequential on purpose: dispatch order is significant.
    // eslint-disable-next-line no-await-in-loop
    if (await group(ctx)) return;
  }

  // ============================================================================
  // STATIC FILES (fallback)
  // ============================================================================
  handleStaticRoutes(req, res, pathname);
}
