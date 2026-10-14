/**
 * What Ferni remembers, as the caller sees and changes it
 * (memory/recall/memory-control.ts):
 *
 * GET    /api/memories/remembered       - the facts live recall reads
 * DELETE /api/memories/remembered/:id   - forget one
 * PATCH  /api/memories/remembered/:id   - correct one ({ value })
 *
 * Always the verified caller's own facts (requireUserId); a fact id is only
 * ever looked up under their path. Off (no such routes, 404) unless
 * MEMORY_VIEW=on.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { API_ERRORS } from '../error-messages.js';
import { parseRawBody, requireUserId, sendError, sendJSON } from '../helpers.js';
import {
  correctRemembered,
  forgetRemembered,
  listRemembered,
} from '../../memory/recall/memory-control.js';
import { firestoreMemoryControlStore as store } from '../../memory/storage/memory-control-store.js';

const log = createLogger({ module: 'RememberedAPI' });
const FACT_ID = /^[A-Za-z0-9_-]{1,200}$/;
/** A correction is at most MAX_CORRECTION_CHARS; its body never needs more than this. */
const MAX_BODY_BYTES = 4096;

/** The PATCH body, or null when it is too large or not JSON. */
async function correctionBody(req: IncomingMessage): Promise<{ value?: unknown } | null> {
  try {
    const raw = await parseRawBody(req, { maxBytes: MAX_BODY_BYTES });
    const body: unknown = JSON.parse(raw || '{}');
    return typeof body === 'object' && body !== null ? (body as { value?: unknown }) : {};
  } catch {
    return null;
  }
}

export async function handleRememberedRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!flagOn('MEMORY_VIEW')) return false;
  if (pathname === '/api/memories/remembered' && req.method === 'GET') {
    const userId = requireUserId(req, res, parsedUrl);
    if (!userId) return true;
    try {
      // Never cached: a cached list would still show a fact the caller just forgot.
      sendJSON(res, { facts: await listRemembered(userId, store) });
    } catch (err) {
      log.error({ error: String(err) }, 'Failed to list remembered facts');
      sendError(res, API_ERRORS.OPERATION_FAILED, 500);
    }
    return true;
  }

  const match = pathname.match(/^\/api\/memories\/remembered\/([^/]+)$/);
  if (!match || (req.method !== 'DELETE' && req.method !== 'PATCH')) return false;
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;
  // Fact ids never need decoding; a raw check also refuses malformed escapes.
  const id = match[1]!;
  if (!FACT_ID.test(id)) {
    sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
    return true;
  }
  try {
    if (req.method === 'DELETE') {
      if (await forgetRemembered(userId, id, store)) sendJSON(res, { success: true, id });
      else sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
      return true;
    }
    const body = await correctionBody(req);
    if (!body) {
      sendError(res, API_ERRORS.INVALID_REQUEST, 400);
      return true;
    }
    const result = await correctRemembered(userId, id, body.value, store);
    if (result.kind === 'corrected') sendJSON(res, { success: true, fact: result.fact });
    else if (result.kind === 'not-found') sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
    else sendError(res, result.reason, 400);
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to change a remembered fact');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
  return true;
}
