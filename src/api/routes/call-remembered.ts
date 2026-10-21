/**
 * GET /api/memories/from-call?since=<epoch ms | ISO>: what Ferni kept from the call
 * that just ended, for the app's "I'll remember" card (docs/api/call-remembered.md).
 *
 * The verified caller's own facts only (the uid comes from the Firebase token, never
 * the query); read-only; never cached. Off (404, like /api/memories/remembered)
 * unless MEMORY_VIEW=on, since the card's "Not quite" / "Forget" are that route's.
 *
 * @module api/routes/call-remembered
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { hadRecentCrisis } from '../../intelligence/pondering/pondering-opener.js';
import { parseSince, rememberedFromCall } from '../../memory/recall/call-remembered.js';
import { listRemembered, type MemoryControlStore } from '../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore } from '../../memory/storage/memory-control-store.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { optionalAuthAsync, type AuthContext } from '../auth-middleware.js';
import { API_ERRORS } from '../error-messages.js';
import { isLightTopic } from '../home/light-topic.js';
import { sendError, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'CallRememberedAPI' });

export interface CallRememberedDeps {
  authenticate?: (req: IncomingMessage) => Promise<AuthContext | null>;
  store?: MemoryControlStore;
  /** True when the caller had a crisis signal lately: the card shows nothing. */
  recentCrisis?: (userId: string, now: Date) => Promise<boolean>;
  now?: () => Date;
}

async function crisisFromFirestore(userId: string, now: Date): Promise<boolean> {
  const db = getFirestoreDb();
  return db ? hadRecentCrisis(db, userId, now) : false;
}

export async function handleCallRememberedRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL,
  deps: CallRememberedDeps = {}
): Promise<boolean> {
  if (pathname !== '/api/memories/from-call' || req.method !== 'GET') return false;
  if (!flagOn('MEMORY_VIEW')) return false;
  const auth = await (deps.authenticate ?? optionalAuthAsync)(req);
  // A verified person only: a service API key names nobody's memories.
  if (!auth?.userId || auth.authMethod === 'api_key') {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }
  const since = parseSince(parsedUrl.searchParams.get('since'));
  if (since === undefined) {
    sendError(res, 'since must be the call start, as epoch milliseconds or an ISO time', 400);
    return true;
  }
  const now = (deps.now ?? (() => new Date()))();
  try {
    const crisis = await (deps.recentCrisis ?? crisisFromFirestore)(auth.userId, now);
    const facts = crisis
      ? []
      : await listRemembered(auth.userId, deps.store ?? firestoreMemoryControlStore);
    sendJSON(res, { items: rememberedFromCall(facts, since, now, isLightTopic) });
  } catch (error) {
    // A failed read is an error, not "nothing remembered": the app shows nothing either way,
    // but the status lets it tell the two apart.
    log.error({ error: String(error) }, 'Could not read what was remembered from the call');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
