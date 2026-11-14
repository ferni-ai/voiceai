/**
 * The few agent health server routes that answer without an admin.
 *
 * Deny by default: health-server.ts sends every other request through
 * requireAdmin (no or a bad credential is 401, a non-admin 403, and neither
 * carries any data). A route someone adds later is admin only until it is
 * listed here. The diagnostic routes serve user ids, session state and crash
 * records, and on the retired GCE VM this server had a public address.
 *
 * Matching is exact on the raw request URL, query included, which is how the
 * router matches these routes. Any variant (`/health/`, `/HEALTH`,
 * `/health?x=1`, `/api//metrics`, a percent-encoded path) is not on the list,
 * so it needs an admin as well.
 *
 * @module agents/shared/public-routes
 */

const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  // Status only (service name, timestamp). The same answer as /health.
  '/',
  // Liveness: infra/Dockerfile.worker HEALTHCHECK, infra/main.tf and
  // instance-template.tf health checks, setup-monitoring uptime checks,
  // deploy-worker.yml.
  '/health',
  // Readiness: infra/docker/Dockerfile.agent HEALTHCHECK, the GCE MIG health
  // check (infra/gce/autoscaling/mig.tf), and the deploy script before it
  // shifts traffic (worker-readiness.ts).
  '/health/ready',
  // Warm-up: answers only whether it warmed up and the module names it loaded.
  // No caller in the repo.
  '/health/warmup',
  '/api/warmup',
]);

/** The URL answers without an admin. Exact match only: no prefixes. */
export function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.has(url);
}
