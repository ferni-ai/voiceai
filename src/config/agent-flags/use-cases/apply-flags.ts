/**
 * One apply request from the dev switchboard (docs/plans/2026-11-16-dev-flag-switchboard.md,
 * "2. Server"): validate, refuse while anyone is on a dev call (an update restarts the agent
 * and drops live calls), update the agent's flag secrets, record what happened.
 *
 * A failed update is never retried. A Twirp error response means LiveKit refused it and
 * nothing changed; a timeout, a network error or an unconfirmed answer means it may have
 * applied and restarted the agent, so a retry could restart it twice. The reply says which,
 * and the admin decides. LiveKit's text never reaches the reply, the audit trail or the log
 * (domain/dev-agent-error.ts).
 *
 * @module config/agent-flags/use-cases/apply-flags
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { validateApply, type ApplyRequest } from '../domain/apply-request.js';
import { loggableError, refusalCode } from '../domain/dev-agent-error.js';
import type { DevAgent } from '../ports/dev-agent.js';
import type { FlagChange, FlagStore } from '../ports/flag-store.js';

type OccupiedRooms = Awaited<ReturnType<DevAgent['occupiedRooms']>>;

export type ApplyResult =
  | { status: 200; appliedAt: string; auditWarning?: string }
  | { status: 400; errors: string[] }
  | { status: 409; rooms: OccupiedRooms }
  | { status: 502; error: string; code?: string };

export interface ApplyDeps {
  agent: DevAgent;
  store: FlagStore;
  now?: () => Date;
}

const log = createLogger({ module: 'apply-agent-flags' });

const ROOMS_UNKNOWN =
  'Could not check the dev rooms for live calls, so nothing was changed. Try again shortly.';
const UPDATE_REFUSED = 'LiveKit refused the update; nothing changed';
const UPDATE_UNCONFIRMED =
  'LiveKit did not confirm; the update may have applied and restarted the agent';
const NOT_RECORDED = 'The flags were updated, but the change could not be added to the history.';

/** Appends the change; true when it was recorded. A failure is logged, never thrown. */
async function record(store: FlagStore, change: FlagChange): Promise<boolean> {
  try {
    await store.appendChange(change);
    return true;
  } catch (error) {
    log.error({ error, result: change.result }, 'Agent flag change not recorded');
    return false;
  }
}

function changeOf(
  request: ApplyRequest,
  actor: string,
  at: Date,
  result: FlagChange['result'],
  detail?: string
): FlagChange {
  const change: FlagChange = {
    at: at.toISOString(),
    actor,
    set: { ...request.set },
    reset: [...request.reset],
    result,
  };
  if (detail) change.detail = detail;
  return change;
}

/**
 * Applies `body` to the dev agent for `actor` (the admin as requireAdmin identified them).
 * 400 for an invalid body (nothing touched), 409 while a room is occupied, 502 when the rooms
 * or LiveKit fail, 200 once LiveKit confirms (with an auditWarning when the record failed).
 */
export async function applyAgentFlags(
  body: unknown,
  actor: string,
  deps: ApplyDeps
): Promise<ApplyResult> {
  const valid = validateApply(body);
  if (!valid.ok) return { status: 400, errors: valid.errors };
  const { request } = valid;
  const now = deps.now ?? ((): Date => new Date());

  // A best-effort check, not a lock: LiveKit has no conditional update, so someone who joins
  // between occupiedRooms and updateFlags is still dropped by the restart.
  let rooms: OccupiedRooms;
  try {
    rooms = await deps.agent.occupiedRooms();
  } catch (error) {
    log.error({ error: loggableError(error) }, 'Dev rooms not listed; agent flag update refused');
    await record(deps.store, changeOf(request, actor, now(), 'failed', 'room check failed'));
    return { status: 502, error: ROOMS_UNKNOWN };
  }
  if (rooms.length > 0) {
    const detail = `${rooms.length} occupied room(s)`;
    await record(deps.store, changeOf(request, actor, now(), 'refused', detail));
    return { status: 409, rooms };
  }

  try {
    await deps.agent.updateFlags(request);
  } catch (error) {
    log.error(
      { error: loggableError(error), set: Object.keys(request.set), reset: request.reset },
      'Dev agent flag update failed; not retried'
    );
    const code = refusalCode(error);
    if (code) {
      const detail = `LiveKit refused the update (${code})`;
      await record(deps.store, changeOf(request, actor, now(), 'failed', detail));
      return { status: 502, error: UPDATE_REFUSED, code };
    }
    const detail = 'LiveKit did not confirm the update';
    await record(deps.store, changeOf(request, actor, now(), 'failed', detail));
    return { status: 502, error: UPDATE_UNCONFIRMED };
  }

  const appliedAt = now();
  const recorded = await record(deps.store, changeOf(request, actor, appliedAt, 'applied'));
  return recorded
    ? { status: 200, appliedAt: appliedAt.toISOString() }
    : { status: 200, appliedAt: appliedAt.toISOString(), auditWarning: NOT_RECORDED };
}
