/**
 * Where the root E2E suite may send traffic.
 *
 * Every spec reads its targets from here instead of hard-coding URLs. All
 * targets default to local servers; a non-local target is refused unless the
 * run explicitly opts in with E2E_ALLOW_REMOTE=1.
 *
 * This module has no Playwright import so the Vitest-based API specs in this
 * folder can use it too.
 *
 * | Variable            | Default                  | Used for                              |
 * | ------------------- | ------------------------ | ------------------------------------- |
 * | E2E_BASE_URL        | http://localhost:5173    | The web app (Vite dev server)         |
 * | E2E_API_URL         | http://localhost:3002    | UI server API (`pnpm ui-server`)      |
 * | E2E_AGENT_URL       | http://localhost:8080    | Voice agent health/observability port |
 * | E2E_LANDING_URL     | (unset → specs skip)     | Marketing landing page                |
 * | E2E_ALLOW_REMOTE    | (unset)                  | `1` permits non-localhost targets     |
 *
 * The older names TEST_API_URL / TEST_BASE_URL (API) and AGENT_URL are still
 * read as fallbacks, and pass through the same localhost guard.
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Schemes that never touch the network. */
const INERT_PROTOCOLS = new Set(['data:', 'blob:', 'about:', 'chrome:', 'chrome-extension:']);

/** True when the run explicitly allows non-local targets. */
export const REMOTE_ALLOWED = process.env.E2E_ALLOW_REMOTE === '1';

/** True for URLs that stay on this machine (or never hit the network at all). */
export function isLocalUrl(url: string | URL): boolean {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    // Relative URLs resolve against a local base URL.
    return true;
  }
  if (INERT_PROTOCOLS.has(parsed.protocol)) return true;
  const host = parsed.hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * Return `url` unchanged when it is local, or when remote targets are allowed.
 * Otherwise throw, so a misconfigured run fails before any request is sent.
 */
export function assertAllowedTarget(url: string, label: string): string {
  if (isLocalUrl(url) || REMOTE_ALLOWED) return url;
  throw new Error(
    `[e2e] ${label}=${url} is not a localhost URL. The E2E suite only talks to local ` +
      'servers by default. Set E2E_ALLOW_REMOTE=1 to target a remote host on purpose.'
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function target(label: string, value: string | undefined, fallback: string): string {
  return stripTrailingSlash(assertAllowedTarget(value || fallback, label));
}

/** The web app. The root Playwright config starts Vite here. */
export const APP_URL = target(
  'E2E_BASE_URL',
  process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL,
  'http://localhost:5173'
);

/** The UI server API (`pnpm ui-server`). */
export const API_URL = target(
  'E2E_API_URL',
  // TEST_API_URL / TEST_BASE_URL are the names older specs read.
  process.env.E2E_API_URL || process.env.TEST_API_URL || process.env.TEST_BASE_URL,
  'http://localhost:3002'
);

/** The voice agent's HTTP port (health, observability). */
export const AGENT_URL = target(
  'E2E_AGENT_URL',
  process.env.E2E_AGENT_URL || process.env.AGENT_URL,
  'http://localhost:8080'
);

/**
 * The marketing landing page. There is no local default: the landing specs
 * skip unless a URL is provided (and a remote one also needs E2E_ALLOW_REMOTE=1).
 */
export const LANDING_URL: string | undefined = process.env.E2E_LANDING_URL
  ? target('E2E_LANDING_URL', process.env.E2E_LANDING_URL, '')
  : undefined;

/** Every configured target, for the global setup banner and guard. */
export function configuredTargets(): Record<string, string> {
  const targets: Record<string, string> = {
    E2E_BASE_URL: APP_URL,
    E2E_API_URL: API_URL,
    E2E_AGENT_URL: AGENT_URL,
  };
  if (LANDING_URL) targets.E2E_LANDING_URL = LANDING_URL;
  return targets;
}
