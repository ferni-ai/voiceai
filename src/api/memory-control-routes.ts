/**
 * User Memory Control API — `/api/memory/me...`
 *
 *   GET    /api/memory/me                      → { facts, people, updatedAt }
 *   DELETE /api/memory/me   { confirm: 'DELETE' } → wipe all memory (keeps account basics)
 *   PATCH  /api/memory/me/facts/:id   { text, category? } → Fact
 *   DELETE /api/memory/me/facts/:id            → { deleted: true }
 *   DELETE /api/memory/me/people/:id           → { deleted: true }
 *   GET    /api/memory/me/conversations?cursor=&limit= → { conversations, nextCursor? }
 *   GET    /api/memory/me/conversations/:id    → { conversation, turns }
 *   DELETE /api/memory/me/conversations/:id    → { deleted: { turns, facts, embeddings } }
 *   GET    /api/memory/me/export?format=json|csv → attachment
 *
 * Identity is always the verified caller (`requestUserId`); every lookup is
 * scoped to `bogle_users/{caller}`, so another user's IDs are simply 404.
 * See docs/architecture/USER-MEMORY-CONTROL.md.
 *
 * @module api/memory-control-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  deleteAllMemories,
  deleteConversation,
  deleteFact,
  deletePerson,
  editFact,
  exportMemories,
  getConversation,
  listConversations,
  listMemories,
  MAX_FACT_TEXT,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  type MemoryControlError,
  type MemoryControlResult,
} from '../services/memory-control/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import {
  handleCorsPreflightIfNeeded,
  parseBody,
  parsePositiveInt,
  sendError,
  sendJSON,
} from './helpers.js';
import { requestUserId } from './identity-guard.js';
import { isImportantDatesRoute } from './important-dates-routes.js';

const log = createLogger({ module: 'MemoryControlRoutes' });

export const MEMORY_ME_PREFIX = '/api/memory/me';

const ID_PATTERN = /^[A-Za-z0-9_.:@-]{1,200}$/;

const EditFactSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_FACT_TEXT),
    category: z.string().trim().min(1).max(60).optional(),
  })
  // Unknown fields (the web client also sends userId) are ignored, never trusted.
  .strip();

const DeleteAllSchema = z.object({ confirm: z.literal('DELETE') });

const LIMITS = {
  read: { maxRequests: 120, windowMs: 60_000 },
  edit: { maxRequests: 60, windowMs: 60_000 },
  delete: { maxRequests: 30, windowMs: 60_000 },
  export: { maxRequests: 10, windowMs: 60 * 60_000 },
  deleteAll: { maxRequests: 3, windowMs: 60 * 60_000 },
} as const;

/** `/api/memory/me...`, except the important-dates paths, which have their own handler. */
export function isMemoryControlPath(pathname: string): boolean {
  if (isImportantDatesRoute(pathname)) return false;
  return pathname === MEMORY_ME_PREFIX || pathname.startsWith(`${MEMORY_ME_PREFIX}/`);
}

function limited(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  kind: keyof typeof LIMITS
): boolean {
  return rateLimit(req, res, {
    ...LIMITS[kind],
    keyPrefix: `memory-me-${kind}`,
    keyGenerator: () => `user:${userId}`,
  });
}

const STATUS: Record<MemoryControlError['code'], number> = {
  not_found: 404,
  invalid: 400,
  unavailable: 503,
};

function sendResult<T>(res: ServerResponse, result: MemoryControlResult<T>): void {
  if (result.ok) sendJSON(res, result.value);
  else
    sendError(
      res,
      result.error.code === 'not_found' ? 'Not found' : result.error.message,
      STATUS[result.error.code]
    );
}

function decodeId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    return ID_PATTERN.test(id) && id !== '.' && id !== '..' ? id : null;
  } catch {
    return null;
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return await parseBody<unknown>(req);
  } catch {
    return undefined;
  }
}

async function handleEditFact(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  id: string
): Promise<void> {
  if (limited(req, res, userId, 'edit')) return;
  const parsed = EditFactSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    sendError(res, `Send { text } with 1-${MAX_FACT_TEXT} characters`, 400);
    return;
  }
  sendResult(res, await editFact(userId, id, parsed.data));
}

async function handleDeleteAll(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (limited(req, res, userId, 'deleteAll')) return;
  if (!DeleteAllSchema.safeParse(await readJson(req)).success) {
    sendError(res, "Send { confirm: 'DELETE' } to erase all memories", 400);
    return;
  }
  const result = await deleteAllMemories(userId);
  if (!result.ok) {
    sendResult(res, result);
    return;
  }
  log.warn({ collections: result.value.collections }, 'User erased all memories');
  sendJSON(res, { deleted: true, ...result.value });
}

async function handleExport(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  url: URL
): Promise<void> {
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    sendError(res, 'format must be json or csv', 400);
    return;
  }
  if (limited(req, res, userId, 'export')) return;
  const result = await exportMemories(userId, format);
  if (!result.ok) {
    sendResult(res, result);
    return;
  }
  res.writeHead(200, {
    'Content-Type': result.value.contentType,
    'Content-Disposition': `attachment; filename="${result.value.filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(result.value.body);
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
  userId: string
): Promise<void> {
  const method = req.method ?? 'GET';
  const rest = pathname.slice(MEMORY_ME_PREFIX.length).split('/').filter(Boolean);
  const notAllowed = (): void => sendError(res, 'Method not allowed', 405);

  if (rest.length === 0) {
    if (method === 'GET') {
      if (!limited(req, res, userId, 'read')) sendResult(res, await listMemories(userId));
    } else if (method === 'DELETE') await handleDeleteAll(req, res, userId);
    else notAllowed();
    return;
  }

  const [resource, rawId, ...extra] = rest;
  if (extra.length > 0) {
    sendError(res, 'Not found', 404);
    return;
  }

  if (resource === 'export' && rawId === undefined) {
    if (method === 'GET') await handleExport(req, res, userId, url);
    else notAllowed();
    return;
  }

  if (resource === 'conversations' && rawId === undefined) {
    if (method !== 'GET') return notAllowed();
    if (limited(req, res, userId, 'read')) return;
    const limit = parsePositiveInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor !== undefined && !decodeId(cursor)) {
      sendError(res, 'Invalid cursor', 400);
      return;
    }
    sendResult(res, await listConversations(userId, { cursor, limit }));
    return;
  }

  if (!['facts', 'people', 'conversations'].includes(resource) || rawId === undefined) {
    sendError(res, 'Not found', 404);
    return;
  }
  const id = decodeId(rawId);
  if (!id) {
    sendError(res, 'Invalid id', 400);
    return;
  }

  if (resource === 'facts') {
    if (method === 'PATCH') await handleEditFact(req, res, userId, id);
    else if (method === 'DELETE') {
      if (!limited(req, res, userId, 'delete')) sendResult(res, await deleteFact(userId, id));
    } else notAllowed();
    return;
  }

  if (resource === 'people') {
    if (method !== 'DELETE') return notAllowed();
    if (!limited(req, res, userId, 'delete')) sendResult(res, await deletePerson(userId, id));
    return;
  }

  if (method === 'GET') {
    if (!limited(req, res, userId, 'read')) sendResult(res, await getConversation(userId, id));
  } else if (method === 'DELETE') {
    if (!limited(req, res, userId, 'delete')) sendResult(res, await deleteConversation(userId, id));
  } else notAllowed();
}

/** Returns true when the request was handled (every `/api/memory/me...` path is). */
export async function handleMemoryControlRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!isMemoryControlPath(pathname)) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;

  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your memories', 401);
    return true;
  }

  try {
    await route(req, res, pathname, parsedUrl, userId);
  } catch (error) {
    log.error(
      { error: String(error), pathname, method: req.method },
      'Memory control route failed'
    );
    if (!res.headersSent) sendError(res, "Couldn't reach your memories. Try again?", 500);
  }
  return true;
}
