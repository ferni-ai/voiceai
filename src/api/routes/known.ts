/**
 * What Ferni knows about you, in one view (intelligence/memory-view/known.ts):
 *
 * GET  /api/memories/known           - people, life now, dates, preferences, how
 *                                      Ferni reads you, and (own flag) what he's
 *                                      thinking about
 * POST /api/memories/known/:kind/:id  - { action: forget | wrong | correct, value? }
 *                                      (memory-view/actions.ts)
 *
 * Always the verified caller's own record (requireUserId); there is no way to
 * name another uid. Unanswered (left to other routes, so a 404) unless
 * MEMORY_VIEW=on.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { API_ERRORS } from '../error-messages.js';
import { parseBody, requireUserId, sendError, sendJSON } from '../helpers.js';
import {
  ForgottenTopicsUnreadable,
  isMemoryViewOn,
  isMemoryViewPonderingOn,
  loadKnownView,
  type KnownKind,
} from '../../intelligence/memory-view/known.js';
import { applyKnownAction, type KnownAction } from '../../intelligence/memory-view/actions.js';
import { firestoreActionStore } from './known-action-store.js';
import { firestoreKnownStore } from './known-store.js';

const log = createLogger({ module: 'KnownAPI' });

export async function handleKnownRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!isMemoryViewOn()) return false;
  if (pathname === '/api/memories/known' && req.method === 'GET') return view(req, res, parsedUrl);
  const match = /^\/api\/memories\/known\/([a-z]+)\/([^/]+)$/.exec(pathname);
  const [, kind, id] = match ?? [];
  if (kind === undefined || id === undefined || req.method !== 'POST') return false;
  return act(req, res, parsedUrl, kind, id);
}

const KINDS: ReadonlySet<string> = new Set(['fact', 'world', 'pattern', 'sensitivity', 'ponder']);
const ACTIONS: ReadonlySet<string> = new Set(['forget', 'wrong', 'correct']);
/** Ids never need decoding; a raw check also refuses malformed escapes. */
const ITEM_ID = /^[A-Za-z0-9_-]{1,200}$/;

async function act(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  kind: string,
  id: string
): Promise<boolean> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;
  const hidden = kind === 'ponder' && !isMemoryViewPonderingOn();
  if (!KINDS.has(kind) || hidden || !ITEM_ID.test(id)) {
    sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
    return true;
  }
  try {
    const body = await parseBody<{ action?: unknown; value?: unknown }>(req);
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) {
      sendError(res, 'action must be forget, wrong or correct', 400);
      return true;
    }
    const result = await applyKnownAction(
      userId,
      { kind: kind as KnownKind, id },
      { action: action as KnownAction, value: body?.value },
      { store: firestoreActionStore }
    );
    if (result.kind === 'done') sendJSON(res, { success: true, ...result });
    // 200 as /remembered answers it: the fact is gone, as asked
    else if (result.kind === 'not-kept')
      sendJSON(res, { success: true, status: 'not-kept', reason: result.reason });
    else if (result.kind === 'not-found') sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
    else sendError(res, result.reason, 400);
  } catch (err) {
    log.error({ error: String(err), kind }, 'Failed to change what Ferni knows');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}

async function view(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): Promise<boolean> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;
  try {
    // Never cached (sendJSON sends no-store): a cached view would still show what was just forgotten.
    sendJSON(res, await loadKnownView(userId, firestoreKnownStore));
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to load what Ferni knows');
    // Can't tell what was forgotten: refuse (retryable), never a view that might show it.
    if (err instanceof ForgottenTopicsUnreadable) sendError(res, API_ERRORS.OPERATION_FAILED, 503);
    else sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
