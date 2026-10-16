/**
 * What Ferni knows about you, in one view (intelligence/memory-view/known.ts):
 *
 * GET /api/memories/known - people, life now, dates, preferences, how Ferni
 *                           reads you, and (own flag) what he's thinking about
 *
 * Always the verified caller's own record (requireUserId); there is no way to
 * name another uid. Unanswered (left to other routes, so a 404) unless
 * MEMORY_VIEW=on.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { API_ERRORS } from '../error-messages.js';
import { requireUserId, sendError, sendJSON } from '../helpers.js';
import { isMemoryViewOn, loadKnownView } from '../../intelligence/memory-view/known.js';
import { firestoreKnownStore } from './known-store.js';

const log = createLogger({ module: 'KnownAPI' });

export async function handleKnownRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname !== '/api/memories/known' || req.method !== 'GET' || !isMemoryViewOn()) {
    return false;
  }
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;
  try {
    // Never cached (sendJSON sends no-store): a cached view would still show what was just forgotten.
    sendJSON(res, await loadKnownView(userId, firestoreKnownStore));
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to load what Ferni knows');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
