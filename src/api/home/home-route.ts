/**
 * GET /api/home: the Home Screen's line and note (docs/api/home.md).
 *
 * The uid comes only from the verified Firebase token (anonymous users are
 * fine); a ?userId= or an x-user-id header is ignored. Read-only and never
 * cached: a cached answer could show a follow-up the person just forgot.
 *
 * @module api/home/home-route
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { ponderingForOpener } from '../../intelligence/pondering/pondering-opener.js';
import { firestoreFollowUpStore } from '../../services/stores/follow-through-store.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { optionalAuthAsync, type AuthContext } from '../auth-middleware.js';
import { API_ERRORS } from '../error-messages.js';
import { sendError, sendJSON } from '../helpers.js';
import { buildHome, hasCallHistory, type HomeDeps } from './home-service.js';

const log = createLogger({ module: 'HomeAPI' });

/** The app's IANA zone from ?tz=, or undefined when missing or implausible. */
export function zoneParam(raw: string | null): string | undefined {
  return raw && /^[A-Za-z0-9_+\-/]{1,64}$/.test(raw) ? raw : undefined;
}

export interface HomeRouteDeps {
  authenticate?: (req: IncomingMessage) => Promise<AuthContext | null>;
  /** Everything but the caller, the clock and the zone. */
  services?: (now: Date) => Omit<HomeDeps, 'userId' | 'now' | 'zone'>;
  now?: () => Date;
}

function liveServices(): Omit<HomeDeps, 'userId' | 'now' | 'zone'> {
  const db = getFirestoreDb();
  return {
    store: firestoreFollowUpStore(),
    pondered: async (userId) => (db ? ponderingForOpener(db, userId) : undefined),
    hasHistory: async (userId) => (db ? hasCallHistory(db, userId) : true),
  };
}

export async function handleHomeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL,
  deps: HomeRouteDeps = {}
): Promise<boolean> {
  if (pathname !== '/api/home' || req.method !== 'GET') return false;
  const auth = await (deps.authenticate ?? optionalAuthAsync)(req);
  // A verified person only: a service API key names no person's Home Screen.
  if (!auth?.userId || auth.authMethod === 'api_key') {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }
  const now = (deps.now ?? (() => new Date()))();
  try {
    const home = await buildHome({
      ...(deps.services ? deps.services(now) : liveServices()),
      userId: auth.userId,
      now,
      zone: zoneParam(parsedUrl.searchParams.get('tz')),
    });
    sendJSON(res, home);
  } catch (error) {
    log.error({ error: String(error) }, 'Home not built');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
