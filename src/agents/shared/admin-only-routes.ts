/**
 * The agent health server's diagnostic routes answer only an admin.
 *
 * The server listens on 0.0.0.0, and on GCE that is a public IP
 * (docs/runbooks/DISCONNECT-DEBUGGING.md). /api/metrics and /api/metrics/sessions
 * served user ids to anyone; /api/diagnostics/session alerts can carry part of
 * Ferni's reply. For these routes health-server.ts calls requireAdmin, as for
 * /api/cognitive: no or a bad token is 401, a non-admin 403, and neither carries
 * any data. This file only names the routes: it sits below src/api, so the
 * caller does the auth check.
 *
 * Probes stay public: /, /health, /health/ready (deploys), /health/warmup and
 * /api/warmup. Nothing in the repo scrapes /metrics; uptime checks and the Docker
 * HEALTHCHECK use /health.
 *
 * @module agents/shared/admin-only-routes
 */

/** Every URL the server routes by these prefixes (it matches them with startsWith). */
const ADMIN_PREFIXES = [
  '/api/metrics',
  '/api/diagnostics',
  '/api/session-metrics',
  '/api/memory',
  '/api/cache',
  '/api/observability',
];

/** Routes the server matches exactly. */
const ADMIN_PATHS = new Set([
  '/metrics',
  '/api/watchdog',
  '/api/watchdog/status',
  '/health/workers',
  '/health/native',
  '/health/gemini',
]);

/** The route answers only an admin. Matches at least every URL its handler would serve. */
export function adminOnlyRoute(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return ADMIN_PATHS.has(path) || ADMIN_PREFIXES.some((prefix) => url.startsWith(prefix));
}
