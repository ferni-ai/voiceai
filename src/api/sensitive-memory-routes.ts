/**
 * Sensitive memory API: consent switches, health memory and the mood timeline.
 *
 *   GET    /api/memory/me/consent                   → ConsentView
 *   PUT    /api/memory/me/consent  { agreeAll? , categories?: { health?, finances?, beliefs? } } → ConsentView
 *   DELETE /api/memory/me/consent/:category/data    → { deleted, byStore }  (delete what's stored for it)
 *   GET    /api/memory/me/health                    → { enabled, items, safety, updatedAt }
 *   PATCH  /api/memory/me/health/:id  { text?, status?, when? } → { item }
 *   DELETE /api/memory/me/health/:id                → { deleted: true }   (tombstoned)
 *   GET    /api/memory/me/mood                      → { enabled, timeline, insight }
 *   DELETE /api/memory/me/mood/:id                  → { deleted: true }   (tombstoned)
 *
 * ConsentView = { consent: MemoryConsent, stored: { health, finances, beliefs }, safetyExceptions }
 *
 * Identity is always the verified caller (`requestUserId`); ids are looked up
 * inside the caller's own collections, so another user's id is a 404.
 *
 * @module api/sensitive-memory-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  CONSENT_COPY,
  SENSITIVE_CATEGORIES,
  deleteCategoryData,
  getConsent,
  isSensitiveCategory,
  summarizeCategoryData,
  updateConsent,
  type MemoryConsent,
  type SensitiveCategory,
} from '../services/memory-consent/index.js';
import {
  MAX_HEALTH_TEXT,
  buildMoodInsight,
  deleteHealthItem,
  deleteMoodFor,
  editHealthItem,
  listHealthItems,
  listMoodTimeline,
} from '../services/health-memory/index.js';
import { getDietaryConstraints } from '../services/user-preferences/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { requestUserId } from './identity-guard.js';

const log = createLogger({ module: 'SensitiveMemoryRoutes' });

const CONSENT = '/api/memory/me/consent';
const HEALTH = '/api/memory/me/health';
const MOOD = '/api/memory/me/mood';

const LIMITS = {
  read: { maxRequests: 120, windowMs: 60_000 },
  edit: { maxRequests: 60, windowMs: 60_000 },
  delete: { maxRequests: 30, windowMs: 60_000 },
} as const;

const ConsentBody = z
  .object({
    agreeAll: z.boolean().optional(),
    categories: z
      .object({
        health: z.boolean().optional(),
        finances: z.boolean().optional(),
        beliefs: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strip()
  .refine(
    (b) => b.agreeAll !== undefined || (b.categories && Object.keys(b.categories).length > 0)
  );

const HealthEdit = z
  .object({
    text: z.string().trim().min(1).max(MAX_HEALTH_TEXT).optional(),
    status: z.enum(['current', 'past', 'upcoming']).optional(),
    when: z.string().trim().max(120).optional(),
  })
  .strip()
  .refine((b) => b.text !== undefined || b.status !== undefined || b.when !== undefined);

const MOOD_ID = /^[A-Za-z0-9_.:@-]{1,300}$/;

export function isSensitiveMemoryRoute(pathname: string): boolean {
  return [CONSENT, HEALTH, MOOD].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function limited(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  kind: keyof typeof LIMITS
): boolean {
  return rateLimit(req, res, {
    ...LIMITS[kind],
    keyPrefix: `memory-sensitive-${kind}`,
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

async function consentView(userId: string, consent: MemoryConsent) {
  const stored: Record<SensitiveCategory, number> = { health: 0, finances: 0, beliefs: 0 };
  for (const c of SENSITIVE_CATEGORIES) stored[c] = (await summarizeCategoryData(userId, c)).total;
  return {
    consent,
    stored,
    safetyExceptions: [
      { category: 'health' as const, kind: 'allergies', description: CONSENT_COPY.safetyException },
    ],
  };
}

async function handleConsent(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  rest: string
) {
  const method = req.method ?? 'GET';
  if (!rest) {
    if (method === 'GET') {
      if (limited(req, res, userId, 'read')) return;
      const consent = await getConsent(userId, { fresh: true });
      if (!consent.success) return sendError(res, 'Memory settings are unavailable', 503);
      return sendJSON(res, await consentView(userId, consent.data));
    }
    if (method === 'PUT' || method === 'PATCH') {
      if (limited(req, res, userId, 'edit')) return;
      const parsed = ConsentBody.safeParse(await readJson(req));
      if (!parsed.success) return sendError(res, 'Send { agreeAll } or { categories }', 400);
      const all = parsed.data.agreeAll;
      const categories =
        all === undefined
          ? (parsed.data.categories ?? {})
          : { health: all, finances: all, beliefs: all, ...parsed.data.categories };
      const result = await updateConsent(userId, { categories, source: 'page', answered: true });
      if (!result.success) return sendError(res, "Couldn't save that", 503);
      return sendJSON(res, await consentView(userId, result.data));
    }
    return sendError(res, 'Method not allowed', 405);
  }
  const m = rest.match(/^([a-z]+)\/data$/);
  if (!m || !isSensitiveCategory(m[1])) return sendError(res, 'Not found', 404);
  if (method !== 'DELETE') return sendError(res, 'Method not allowed', 405);
  if (limited(req, res, userId, 'delete')) return;
  const report = await deleteCategoryData(userId, m[1]);
  return sendJSON(res, { deleted: report.total, byStore: report.byStore });
}

async function handleHealth(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  rest: string
) {
  const method = req.method ?? 'GET';
  if (!rest) {
    if (method !== 'GET') return sendError(res, 'Method not allowed', 405);
    if (limited(req, res, userId, 'read')) return;
    const [consent, items, diet] = await Promise.all([
      getConsent(userId),
      listHealthItems(userId),
      getDietaryConstraints(userId),
    ]);
    const updatedAt = items.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), '');
    return sendJSON(res, {
      enabled: consent.success && consent.data.categories.health.enabled,
      items,
      // Safety exception: kept and honoured whatever the Health switch says.
      safety: {
        allergies: diet.allergies,
        intolerances: diet.intolerances,
        note: CONSENT_COPY.safetyException,
      },
      updatedAt: updatedAt || null,
    });
  }
  const id = rest;
  if (method === 'PATCH') {
    if (limited(req, res, userId, 'edit')) return;
    const parsed = HealthEdit.safeParse(await readJson(req));
    if (!parsed.success)
      return sendError(res, `Send { text } with 1-${MAX_HEALTH_TEXT} characters`, 400);
    const result = await editHealthItem(userId, id, parsed.data);
    if (!result.success) {
      const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 400 : 503;
      return sendError(res, status === 404 ? 'Not found' : "Couldn't save that", status);
    }
    return sendJSON(res, { item: result.data });
  }
  if (method === 'DELETE') {
    if (limited(req, res, userId, 'delete')) return;
    if (!(await deleteHealthItem(userId, id, 'user_deleted')))
      return sendError(res, 'Not found', 404);
    return sendJSON(res, { deleted: true });
  }
  return sendError(res, 'Method not allowed', 405);
}

async function handleMood(req: IncomingMessage, res: ServerResponse, userId: string, rest: string) {
  const method = req.method ?? 'GET';
  if (!rest) {
    if (method !== 'GET') return sendError(res, 'Method not allowed', 405);
    if (limited(req, res, userId, 'read')) return;
    const [consent, timeline] = await Promise.all([getConsent(userId), listMoodTimeline(userId)]);
    return sendJSON(res, {
      enabled: consent.success && consent.data.categories.health.enabled,
      timeline,
      insight: buildMoodInsight(timeline),
    });
  }
  if (method !== 'DELETE') return sendError(res, 'Method not allowed', 405);
  let id: string;
  try {
    id = decodeURIComponent(rest);
  } catch {
    return sendError(res, 'Not found', 404);
  }
  if (!MOOD_ID.test(id)) return sendError(res, 'Not found', 404);
  if (limited(req, res, userId, 'delete')) return;
  if ((await deleteMoodFor(userId, id, 'user_deleted')) === 0)
    return sendError(res, 'Not found', 404);
  return sendJSON(res, { deleted: true });
}

export async function handleSensitiveMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isSensitiveMemoryRoute(pathname)) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your memory settings', 401);
    return true;
  }
  try {
    if (pathname.startsWith(CONSENT)) {
      await handleConsent(req, res, userId, pathname.slice(CONSENT.length).replace(/^\//, ''));
    } else if (pathname.startsWith(HEALTH)) {
      await handleHealth(req, res, userId, pathname.slice(HEALTH.length).replace(/^\//, ''));
    } else {
      await handleMood(req, res, userId, pathname.slice(MOOD.length).replace(/^\//, ''));
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Sensitive memory route failed');
    if (!res.headersSent) sendError(res, 'Something went wrong', 500);
  }
  return true;
}
