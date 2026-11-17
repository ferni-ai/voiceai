/**
 * The agent flags section's requests to the dev server's /api/v1/admin/agent-flags routes,
 * and how their answers are folded into the section's View. AgentFlagsSection.ts owns when
 * they run (render, poll, apply).
 *
 * @module AgentFlagsApi
 */

import { createLogger } from '../../utils/logger.js';
import { adminFetch } from '../admin-fetch.js';
import {
  trackUnconfirmed,
  type AgentFlagsBody,
  type OccupiedRoom,
  type Staged,
} from './agent-flags-state.js';
import { describeSuperseded, type View } from './agent-flags-view.js';

const log = createLogger('AgentFlagsApi');

const BASE = '/api/v1/admin/agent-flags';

/** POST …/apply replies: 200, 400, 409 and 502 bodies in one shape. */
interface ApplyReply {
  appliedAt?: string;
  auditWarning?: string;
  errors?: string[];
  rooms?: OccupiedRoom[];
  error?: string;
  /** On a 502: LiveKit refused, so nothing changed. Without it the apply may have landed. */
  code?: string;
}

export type Loaded = { ok: true; body: AgentFlagsBody } | { ok: false; status: number };

export async function loadFlags(): Promise<Loaded> {
  const res = await adminFetch(BASE);
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: (await res.json()) as AgentFlagsBody };
}

/** Folds a GET into the unconfirmed marks, noting names a newer worker overrode. */
export function track(v: View, body: AgentFlagsBody): void {
  const { unconfirmed, superseded } = trackUnconfirmed(v.unconfirmed, body);
  v.unconfirmed = unconfirmed;
  v.superseded.push(...describeSuperseded(superseded, body.snapshot));
}

/** Re-reads the flags into `v`; false (logged) when that failed. */
export async function reload(v: View): Promise<boolean> {
  try {
    const loaded = await loadFlags();
    if (loaded.ok) {
      v.body = loaded.body;
      track(v, loaded.body);
      return true;
    }
    log.warn('Agent flags not reloaded', { status: loaded.status });
  } catch (error) {
    log.warn('Agent flags not reloaded', error);
  }
  return false;
}

/** Lists the occupied dev rooms; on failure keeps the last list (e.g. a 409's) and says so. */
export async function refreshRooms(v: View): Promise<boolean> {
  try {
    const res = await adminFetch(`${BASE}/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    v.rooms = ((await res.json()) as { rooms: OccupiedRoom[] }).rooms;
    v.roomsUnknown = false;
    return true;
  } catch (error) {
    log.warn('Dev rooms not listed', error);
    v.roomsUnknown = true;
    return false;
  }
}

export function postApply(applied: Staged): Promise<Response> {
  return adminFetch(`${BASE}/apply`, { method: 'POST', body: JSON.stringify(applied) });
}

export async function readReply(res: Response): Promise<ApplyReply> {
  try {
    return (await res.json()) as ApplyReply;
  } catch (error) {
    log.warn('Agent flags apply reply was not JSON', { status: res.status, error });
    return {};
  }
}
