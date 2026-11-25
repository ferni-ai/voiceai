/**
 * Whether this UI server can start calls (#3870).
 *
 * Calls need LiveKit. A deployed server without the LiveKit settings stops at start, as it
 * always has. A developer's server (NODE_ENV=development) starts without them, so work that
 * never places a call doesn't need real call credentials; its call routes answer 503.
 *
 * @module servers/api/call-availability
 */
import type { ServerResponse } from 'http';
import { API_ERRORS } from '../../api/error-messages.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallAvailability' });

type Env = Record<string, string | undefined>;

/** Routes that mint a call token or hand out the LiveKit URL. */
const CALL_ROUTES = new Set(['/token', '/demo-token', '/token-url']);

function liveKitConfigured(env: Env): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/** A developer's server without LiveKit: it runs, and its call routes are off. */
function runsWithoutCalls(env: Env): boolean {
  return !liveKitConfigured(env) && env.NODE_ENV === 'development';
}

/**
 * Decides at start whether the server may run: true when LiveKit is configured or a
 * development server runs without calls; false when a deployed server must stop.
 */
export function decideCallsAtStartup(env: Env = process.env): boolean {
  if (liveKitConfigured(env)) return true;
  if (!runsWithoutCalls(env)) {
    log.error(
      'Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
    );
    return false;
  }
  log.warn('LiveKit is not configured: running without calls; call routes answer 503');
  return true;
}

/** Answers 503 on a call route while the server runs without calls; true when it answered. */
export function refuseCallWithoutLiveKit(
  res: ServerResponse,
  pathname: string,
  env: Env = process.env
): boolean {
  if (!CALL_ROUTES.has(pathname) || !runsWithoutCalls(env)) return false;
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: API_ERRORS.CALLS_NOT_CONFIGURED }));
  return true;
}
