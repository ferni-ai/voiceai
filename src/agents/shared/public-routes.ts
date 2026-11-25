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

/**
 * Probes aimed at this port by a caller that is not ours. They still need an admin (so 401 and no
 * data), but the 401 is logged once per process at info, then at debug, instead of a warn each.
 *
 * `/worker` is the status route of the LiveKit agents SDK (`@livekit/agents` http_server.js, its
 * own port, 8081 by default in production). Nothing in this repo or its config polls it. Prod
 * showed one `GET /worker` per pod about every 5 minutes, 14 warnings an hour, once #3763 made
 * 401 the answer (#4292). Exact match, like the public list.
 */
const KNOWN_EXTERNAL_PROBES: ReadonlySet<string> = new Set(['/worker']);

/** The URL is a known external probe: its 401 is not a warning. Exact match only. */
export function isKnownExternalProbe(url: string): boolean {
  return KNOWN_EXTERNAL_PROBES.has(url);
}
