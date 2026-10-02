/**
 * Money memory API (Money consent; see services/finance-memory).
 *
 *   GET    /api/memory/me/finances        → { enabled, items, updatedAt }
 *   PATCH  /api/memory/me/finances/:id    → { item }   body any of
 *            { text, status: 'active'|'planned'|'done', amount: { value, period?, currency? } | null,
 *              dueDay: 1-31 | null }   (userEdited: true; secrets in text are redacted)
 *   DELETE /api/memory/me/finances/:id    → { deleted: true }   (tombstoned; bill reminder removed)
 *
 * Items are listed whatever the switch says, so the user can always see and
 * delete what is stored; `enabled` tells the page whether Ferni is still
 * learning. Identity comes only from `requestUserId(req)`; ids are looked up
 * in the caller's own collection, so another user's id is a 404.
 *
 * @module api/finance-memory-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  FINANCE_STATUSES,
  MAX_FINANCE_TEXT,
  editFinanceItem,
  forgetFinanceItem,
  isFinanceId,
  listFinanceItems,
} from '../services/finance-memory/index.js';
import { getConsent } from '../services/memory-consent/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { requestUserId } from './identity-guard.js';

const log = createLogger({ module: 'FinanceMemoryRoutes' });

const BASE = '/api/memory/me/finances';

const LIMITS = {
  read: { maxRequests: 120, windowMs: 60_000 },
  edit: { maxRequests: 60, windowMs: 60_000 },
  delete: { maxRequests: 30, windowMs: 60_000 },
} as const;

const FinanceEditBody = z
  .object({
    text: z.string().trim().min(1).max(MAX_FINANCE_TEXT).optional(),
    status: z.enum(FINANCE_STATUSES).optional(),
    amount: z
      .object({
        value: z.number().positive().max(1e10),
        period: z.enum(['week', 'biweekly', 'month', 'year']).optional(),
        currency: z.enum(['USD', 'GBP', 'EUR']).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    dueDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .strip()
  .refine((b) => Object.values(b).some((v) => v !== undefined));

export function isFinanceMemoryRoute(pathname: string): boolean {
  return pathname === BASE || pathname.startsWith(`${BASE}/`);
}

function limited(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  kind: keyof typeof LIMITS
): boolean {
  return rateLimit(req, res, {
    ...LIMITS[kind],
    keyPrefix: `memory-finances-${kind}`,
    keyGenerator: () => `user:${userId}`,
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return await parseBody<unknown>(req);
  } catch {
    return undefined;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse, userId: string, rest: string) {
  const method = req.method ?? 'GET';
  if (!rest) {
    if (method !== 'GET') return sendError(res, 'Method not allowed', 405);
    if (limited(req, res, userId, 'read')) return;
    const [consent, items] = await Promise.all([getConsent(userId), listFinanceItems(userId)]);
    const updatedAt = items.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), '');
    return sendJSON(res, {
      enabled: consent.success && consent.data.categories.finances.enabled,
      items,
      updatedAt: updatedAt || null,
    });
  }
  const id = rest;
  if (!isFinanceId(id)) return sendError(res, 'Not found', 404);
  if (method === 'PATCH') {
    if (limited(req, res, userId, 'edit')) return;
    const parsed = FinanceEditBody.safeParse(await readJson(req));
    if (!parsed.success) {
      return sendError(res, `Send { text } with 1-${MAX_FINANCE_TEXT} characters`, 400);
    }
    const result = await editFinanceItem(userId, id, parsed.data);
    if (!result.success) {
      const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 400 : 503;
      return sendError(res, status === 404 ? 'Not found' : "Couldn't save that", status);
    }
    return sendJSON(res, { item: result.data });
  }
  if (method === 'DELETE') {
    if (limited(req, res, userId, 'delete')) return;
    if (!(await forgetFinanceItem(userId, id, 'user_deleted'))) {
      return sendError(res, 'Not found', 404);
    }
    return sendJSON(res, { deleted: true });
  }
  return sendError(res, 'Method not allowed', 405);
}

export async function handleFinanceMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isFinanceMemoryRoute(pathname)) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your memory settings', 401);
    return true;
  }
  try {
    await handle(req, res, userId, pathname.slice(BASE.length).replace(/^\//, ''));
  } catch (error) {
    log.error({ error: String(error) }, 'Finance memory route failed');
    if (!res.headersSent) sendError(res, 'Something went wrong', 500);
  }
  return true;
}
