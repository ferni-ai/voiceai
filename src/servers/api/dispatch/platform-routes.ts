/**
 * Platform routes from src/api/, each wrapped in its own error boundary.
 *
 * Diagnostics, versioned APIs (v1, v2 developer platform), auth migration,
 * identity linking,
 * account, session accent and auth monitoring.
 */

import { handleDiagnosticsRoutes } from '../../../api/handoff-diagnostics.js';
import { handleV1Routes } from '../../../api/v1/index.js';
import { handleV2Routes } from '../../../api/v2/index.js';
import handleMigrationRoutes from '../../../api/migration-routes.js';
import handleIdentityLinkRoutes from '../../../api/identity-link-routes.js';
import handleAccountRoutes from '../../../api/account-routes.js';
import handleAuthMonitoringRoutes from '../../../api/auth-monitoring-routes.js';
import handleSessionAccentRoutes from '../../../api/session-accent-routes.js';
import { withRouteErrorBoundary, type RouteContext } from './route-context.js';

/** A pathname-prefixed route handled inside its own error boundary. */
interface PrefixedRoute {
  readonly prefix: string;
  readonly errorMessage: string;
  readonly handle: (ctx: RouteContext) => Promise<unknown>;
}

/** Prefixed platform routes, in dispatch order. */
const PREFIXED_PLATFORM_ROUTES: readonly PrefixedRoute[] = [
  // API v1 routes
  {
    prefix: '/api/v1/',
    errorMessage: 'API v1 route error',
    handle: async ({ req, res, pathname, parsedUrl }) =>
      handleV1Routes(req, res, pathname, parsedUrl),
  },
  // API v2 routes (Developer Platform)
  {
    prefix: '/api/v2/',
    errorMessage: 'API v2 route error',
    handle: async ({ req, res, pathname }) => handleV2Routes(req, res, pathname),
  },
  // Migration routes
  {
    prefix: '/api/auth/migrat',
    errorMessage: 'Migration route error',
    handle: async ({ req, res, pathname }) => handleMigrationRoutes(req, res, pathname),
  },
  // Identity link routes (carry anonymous memory into a signed-in account)
  {
    prefix: '/api/identity/',
    errorMessage: 'Identity link route error',
    handle: async ({ req, res, pathname }) => handleIdentityLinkRoutes(req, res, pathname),
  },
  // Account routes
  {
    prefix: '/api/account',
    errorMessage: 'Account route error',
    handle: async ({ req, res, pathname }) => handleAccountRoutes(req, res, pathname),
  },
  // Session accent routes
  {
    prefix: '/api/session/accent',
    errorMessage: 'Session accent route error',
    handle: async ({ req, res, pathname }) => handleSessionAccentRoutes(req, res, pathname),
  },
  // Auth monitoring routes
  {
    prefix: '/api/auth/',
    errorMessage: 'Auth monitoring route error',
    handle: async ({ req, res, pathname }) => handleAuthMonitoringRoutes(req, res, pathname),
  },
];

/**
 * Dispatch platform routes. Returns true when the request is finished.
 */
export async function dispatchPlatformRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Diagnostics routes
  const diagnosticsDone = await withRouteErrorBoundary(
    res,
    'Diagnostics route error',
    'json',
    async () => {
      const diagnosticsHandled = await handleDiagnosticsRoutes(req, res, pathname, parsedUrl);
      return Boolean(diagnosticsHandled);
    }
  );
  if (diagnosticsDone) return true;

  for (const route of PREFIXED_PLATFORM_ROUTES) {
    // Sequential on purpose: dispatch order is significant.
    // eslint-disable-next-line no-await-in-loop
    const done = await withRouteErrorBoundary(res, route.errorMessage, 'json', async () => {
      if (pathname.startsWith(route.prefix)) {
        const handled = await route.handle(ctx);
        if (handled) return true;
      }
      return false;
    });
    if (done) return true;
  }

  return false;
}
