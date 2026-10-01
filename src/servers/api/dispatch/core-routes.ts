/**
 * Core API routes from src/api/.
 *
 * These route groups share one error boundary ("API route error"), so a
 * throw anywhere in the chain sends a JSON 500 and stops dispatch. Order
 * matters: earlier guards win (e.g. /api/debug/cache before /api/debug,
 * /api/conversations/threads before /api/conversations).
 */

import { dispatchBillingRoutes } from './billing-routes.js';
import { dispatchEngagementRoutes } from './core-engagement-routes.js';
import { dispatchIntelligenceRoutes } from './core-intelligence-routes.js';
import { dispatchOperationsRoutes } from './core-operations-routes.js';
import { dispatchUserRoutes } from './core-user-routes.js';
import { withRouteErrorBoundary, type RouteContext, type RouteGroup } from './route-context.js';

/** Core route groups, in dispatch order. */
const CORE_ROUTE_GROUPS: readonly RouteGroup[] = [
  dispatchOperationsRoutes,
  dispatchEngagementRoutes,
  dispatchUserRoutes,
  dispatchIntelligenceRoutes,
  dispatchBillingRoutes,
];

/**
 * Dispatch core API routes. Returns true when the request is finished.
 */
export async function dispatchCoreRoutes(ctx: RouteContext): Promise<boolean> {
  return withRouteErrorBoundary(ctx.res, 'API route error', 'json', async () => {
    for (const group of CORE_ROUTE_GROUPS) {
      // Sequential on purpose: dispatch order is significant.
      // eslint-disable-next-line no-await-in-loop
      if (await group(ctx)) return true;
    }
    return false;
  });
}
