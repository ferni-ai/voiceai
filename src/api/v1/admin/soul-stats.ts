/**
 * GET /api/v1/admin/soul/stats: avatar soul counts people's browsers reported in
 * the last 24 h (src/api/soul-stats/). Admin auth is checked by the admin router
 * (./index.ts) before this runs. When SOUL_STATS is off or Firestore can't be
 * read, it says so ({ measured: false, reason }) instead of answering zeros.
 *
 * @module api/v1/admin/soul-stats
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { errorClass } from '../../../utils/error-class.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';
import {
  readSoulTotals,
  soulStatsOn,
  type SoulStatsTotals,
} from '../../soul-stats/soul-stats-store.js';

const log = createLogger({ module: 'AdminSoulStats' });

const STATS_PATH = '/api/v1/admin/soul/stats';

type AdminSoulStats = SoulStatsTotals | { measured: false; reason: string };

export interface AdminSoulStatsDeps {
  enabled: () => boolean;
  getDb: () => Firestore | null;
  now: () => number;
}

const defaultDeps: AdminSoulStatsDeps = {
  enabled: () => soulStatsOn(),
  getDb: getFirestoreDb,
  now: Date.now,
};

async function readAdminSoulStats(deps: AdminSoulStatsDeps): Promise<AdminSoulStats> {
  if (!deps.enabled()) return { measured: false, reason: 'SOUL_STATS is off' };
  const db = deps.getDb();
  if (!db) return { measured: false, reason: 'Firestore is unavailable' };
  try {
    return await readSoulTotals(db, deps.now());
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    log.error({ error: errorClass(error), code }, 'Could not read soul stats');
    const why =
      code === undefined ? errorClass(error) : `${errorClass(error)}, code ${String(code)}`;
    return { measured: false, reason: `Could not read soul_stats_hourly (${why})` };
  }
}

export async function handleAdminSoulStatsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: AdminSoulStatsDeps = defaultDeps
): Promise<boolean> {
  if (pathname !== STATS_PATH) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (req.method !== 'GET') return (sendError(res, 'Method not allowed', 405), true);
  sendJSON(res, await readAdminSoulStats(deps));
  return true;
}
