/**
 * The dev flag switchboard's admin routes (docs/plans/2026-11-16-dev-flag-switchboard.md,
 * "2. Server"), served only by the dev UI server:
 * - GET  /api/v1/admin/agent-flags        - every per-file flag, the dev agent's boot
 *   snapshot, whether it is stale, the flags waiting for a restart, and the 20 latest changes
 * - GET  /api/v1/admin/agent-flags/rooms  - the dev project's occupied rooms (502 when the
 *   room service fails or takes over 10 s)
 *
 * Unless DEPLOY_ENV is exactly 'dev', every path is a 404, decided before auth runs and
 * before the LiveKit or Firestore adapter is built. The adapters are built per request with
 * no arguments, so they read this server's env and refuse anything but the dev project and
 * the ferni-dev database.
 *
 * @module api/v1/admin/agent-flags
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { firestoreFlagStore } from '../../../config/agent-flags/adapters/flag-store.js';
import { liveKitDevAgent } from '../../../config/agent-flags/adapters/livekit-dev-agent.js';
import { loggableError } from '../../../config/agent-flags/domain/dev-agent-error.js';
import {
  flagsPendingRestart,
  isSnapshotStale,
  type FlagSnapshot,
} from '../../../config/agent-flags/domain/snapshot.js';
import { agentFlags } from '../../../config/agent-flags/domain/switchable.js';
import type { DevAgent } from '../../../config/agent-flags/ports/dev-agent.js';
import type { FlagStore } from '../../../config/agent-flags/ports/flag-store.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAdmin, type AuthContext } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';

const log = createLogger({ module: 'AdminAgentFlagsAPI' });

const BASE_PATH = '/api/v1/admin/agent-flags';
const CHANGES_SHOWN = 20;
const TIMES_UNKNOWN =
  "Could not read when the dev agent's flags last changed, so these values may be out of date.";
const AGENT_UNREACHABLE =
  "This server's LiveKit settings are missing or not the dev project's, so these values may be out of date.";
const ROOMS_UNKNOWN = 'Could not list the dev rooms. Try again shortly.';

/** How the routes reach the dev agent and the flag store; tests pass fakes. */
export interface AgentFlagsDeps {
  agent: () => DevAgent;
  store: () => FlagStore;
}

const LIVE_DEPS: AgentFlagsDeps = {
  agent: () => liveKitDevAgent(),
  store: () => firestoreFlagStore(),
};

type RestartState = { stale: boolean; pendingRestart: string[]; warning?: string };

/** Whether the snapshot is stale, from LiveKit; stale with a warning when LiveKit fails. */
async function restartState(
  deps: AgentFlagsDeps,
  snapshot: FlagSnapshot | null
): Promise<RestartState> {
  let agent: DevAgent;
  try {
    agent = deps.agent();
  } catch (error) {
    log.warn({ error: loggableError(error) }, 'Dev agent not built; showing the flags as stale');
    return { stale: true, pendingRestart: [], warning: AGENT_UNREACHABLE };
  }
  try {
    const times = await agent.flagSecretTimes();
    return {
      stale: isSnapshotStale(snapshot, times),
      pendingRestart: flagsPendingRestart(snapshot, times),
    };
  } catch (error) {
    const fields = { error: loggableError(error) };
    log.warn(fields, 'Dev agent flag secret times not read; showing the flags as stale');
    return { stale: true, pendingRestart: [], warning: TIMES_UNKNOWN };
  }
}

async function sendFlags(res: ServerResponse, deps: AgentFlagsDeps): Promise<void> {
  const store = deps.store();
  const [snapshot, changes] = await Promise.all([
    store.readSnapshot(),
    store.recentChanges(CHANGES_SHOWN),
  ]);
  sendJSON(res, {
    flags: agentFlags(),
    snapshot,
    ...(await restartState(deps, snapshot)),
    changes,
  });
}

/** 502 rather than 500 or a hang when the room service fails or times out. */
async function sendRooms(res: ServerResponse, deps: AgentFlagsDeps): Promise<void> {
  const agent = deps.agent();
  let rooms: Awaited<ReturnType<DevAgent['occupiedRooms']>>;
  try {
    rooms = await agent.occupiedRooms();
  } catch (error) {
    log.error({ error: loggableError(error) }, 'Dev rooms not listed');
    sendJSON(res, { error: ROOMS_UNKNOWN }, 502);
    return;
  }
  sendJSON(res, { rooms });
}

/**
 * The admin making the request, or null once the request has been answered: 404 off the dev
 * server (before anything else runs), a CORS preflight, 429, or requireAdmin's 401 or 403.
 */
async function requireDevAdmin(
  req: IncomingMessage,
  res: ServerResponse
): Promise<AuthContext | null> {
  // SECURITY: the switchboard exists only on the dev UI server.
  if (process.env.DEPLOY_ENV !== 'dev') {
    sendError(res, 'Not found', 404);
    return null;
  }
  if (handleCorsPreflightIfNeeded(req, res)) return null;
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60_000, keyPrefix: 'admin-agent-flags' })) {
    return null;
  }
  return requireAdmin(req, res);
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  subPath: string,
  deps: AgentFlagsDeps
): Promise<void> {
  const method = req.method || 'GET';
  if (subPath === '/' && method === 'GET') {
    await sendFlags(res, deps);
  } else if (subPath === '/rooms' && method === 'GET') {
    await sendRooms(res, deps);
  } else {
    sendError(res, 'Not found', 404);
  }
}

/**
 * Handles /api/v1/admin/agent-flags and its sub-paths.
 * @returns true if the request was handled
 */
export async function handleAdminAgentFlagsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL,
  deps: AgentFlagsDeps = LIVE_DEPS
): Promise<boolean> {
  if (pathname !== BASE_PATH && !pathname.startsWith(`${BASE_PATH}/`)) return false;
  if (!(await requireDevAdmin(req, res))) return true;

  const subPath = pathname.slice(BASE_PATH.length) || '/';
  try {
    await route(req, res, subPath, deps);
  } catch (error) {
    log.error({ error, subPath, method: req.method }, 'Admin agent flags API error');
    if (!res.headersSent) sendError(res, 'Internal server error');
  }
  return true;
}
