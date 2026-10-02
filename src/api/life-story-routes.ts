/**
 * Life story, values and beliefs API (alongside the memory control API).
 *
 *   GET    /api/memory/me/story           → { items: StoryItem[], values: ValueItem[], updatedAt }
 *   POST   /api/memory/me/story           → 201 { item }   body { kind, title, detail?, period?, date? }
 *                                                           (kind 'value': { kind, title, detail? })
 *   PATCH  /api/memory/me/story/:id       → { item }       body any of { title, detail, period, date }
 *                                                           (null clears detail/period/date)
 *   DELETE /api/memory/me/story/:id       → { deleted: true }   (tombstoned; its date goes too)
 *
 *   GET    /api/memory/me/beliefs         → { enabled, items: BeliefItem[], updatedAt }
 *   POST   /api/memory/me/beliefs         → 201 { item }   body { kind, title, detail? }  (409 when Beliefs is off)
 *   PATCH  /api/memory/me/beliefs/:id     → { item }       body any of { title, detail }
 *   DELETE /api/memory/me/beliefs/:id     → { deleted: true }   (tombstoned)
 *
 * Story ids are `story_…` (life story) or `value_…` (values); belief ids are
 * `belief_…`. Identity comes only from `requestUserId(req)`; ids are looked up
 * inside the caller's own collections, so another user's id is a 404.
 *
 * @module api/life-story-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  BELIEF_KINDS,
  ITEM_ID_PATTERN,
  STORY_KINDS,
  createUserItem,
  createUserValue,
  editUserItem,
  editUserValue,
  forgetItem,
  getBeliefsView,
  getStoryView,
  isValidStoryDate,
  type ItemArea,
} from '../services/life-story/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';
import { requestUserId } from './identity-guard.js';

const log = createLogger({ module: 'LifeStoryRoutes' });

const PATHS: Readonly<Record<ItemArea, string>> = {
  story: '/api/memory/me/story',
  beliefs: '/api/memory/me/beliefs',
};

const LIMITS = {
  read: { maxRequests: 120, windowMs: 60_000 },
  edit: { maxRequests: 60, windowMs: 60_000 },
} as const;

export function isLifeStoryRoute(pathname: string): boolean {
  return Object.values(PATHS).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const text = (max: number) => z.string().trim().min(2).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const storyDate = z
  .string()
  .refine((v) => isValidStoryDate(v), 'invalid date')
  .nullable()
  .optional();

const StoryCreate = z
  .object({
    kind: z.enum(['value', ...STORY_KINDS] as [string, ...string[]]),
    title: text(140),
    detail: z.string().trim().max(400).optional(),
    period: z.string().trim().max(40).optional(),
    date: z
      .string()
      .refine((v) => isValidStoryDate(v), 'invalid date')
      .optional(),
  })
  .strip();

const BeliefCreate = z
  .object({
    kind: z.enum(BELIEF_KINDS as unknown as [string, ...string[]]),
    title: text(140),
    detail: z.string().trim().max(400).optional(),
  })
  .strip();

const ItemEdit = z
  .object({
    title: text(140).optional(),
    detail: optionalText(400),
    period: optionalText(40),
    date: storyDate,
  })
  .strip()
  .refine((b) => Object.values(b).some((v) => v !== undefined));

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return await parseBody<unknown>(req);
  } catch {
    return undefined;
  }
}

function limited(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  kind: keyof typeof LIMITS
): boolean {
  return rateLimit(req, res, {
    ...LIMITS[kind],
    keyPrefix: `memory-story-${kind}`,
    keyGenerator: () => `user:${userId}`,
  });
}

async function create(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  area: ItemArea
): Promise<void> {
  const body = await readJson(req);
  if (area === 'story') {
    const parsed = StoryCreate.safeParse(body);
    if (!parsed.success) return sendError(res, 'Invalid item', 400);
    const b = parsed.data;
    if (b.kind === 'value') {
      const r = await createUserValue(userId, b.title, b.detail);
      if (!r.success) return sendError(res, 'Invalid item', 400);
      return sendJSON(res, { item: r.data }, 201);
    }
    const r = await createUserItem(userId, {
      area: 'story',
      kind: b.kind as (typeof STORY_KINDS)[number],
      title: b.title,
      detail: b.detail,
      period: b.period,
      date: b.date,
    });
    if (!r.success)
      return sendError(
        res,
        r.error === 'storage' ? "Couldn't save that" : 'Invalid item',
        r.error === 'storage' ? 503 : 400
      );
    return sendJSON(res, { item: r.data }, 201);
  }
  const parsed = BeliefCreate.safeParse(body);
  if (!parsed.success) return sendError(res, 'Invalid item', 400);
  const r = await createUserItem(userId, {
    area: 'beliefs',
    kind: parsed.data.kind as (typeof BELIEF_KINDS)[number],
    title: parsed.data.title,
    detail: parsed.data.detail,
  });
  if (!r.success) {
    if (r.error === 'consent_off') return sendError(res, 'Faith & beliefs memory is off', 409);
    return sendError(
      res,
      r.error === 'storage' ? "Couldn't save that" : 'Invalid item',
      r.error === 'storage' ? 503 : 400
    );
  }
  return sendJSON(res, { item: r.data }, 201);
}

async function edit(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  area: ItemArea,
  id: string
): Promise<void> {
  const parsed = ItemEdit.safeParse(await readJson(req));
  if (!parsed.success) return sendError(res, 'Invalid item', 400);
  const b = parsed.data;
  const result = id.startsWith('value_')
    ? await editUserValue(userId, id, {
        ...(b.title !== undefined ? { label: b.title } : {}),
        ...(b.detail !== undefined && b.detail !== null ? { statement: b.detail } : {}),
      })
    : await editUserItem(userId, area, id, {
        title: b.title,
        detail: b.detail,
        ...(area === 'story' ? { period: b.period, date: b.date } : {}),
      });
  if (!result.success) {
    const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 400 : 503;
    return sendError(
      res,
      status === 404 ? 'Not found' : status === 400 ? 'Invalid item' : "Couldn't save that",
      status
    );
  }
  return sendJSON(res, { item: result.data });
}

export async function handleLifeStoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const area = (Object.keys(PATHS) as ItemArea[]).find(
    (a) => pathname === PATHS[a] || pathname.startsWith(`${PATHS[a]}/`)
  );
  if (!area) return false;

  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see what I remember', 401);
    return true;
  }
  const method = req.method ?? 'GET';
  const rest = pathname.slice(PATHS[area].length).replace(/^\//, '');

  try {
    if (!rest) {
      if (method === 'GET') {
        if (limited(req, res, userId, 'read')) return true;
        sendJSON(res, area === 'story' ? await getStoryView(userId) : await getBeliefsView(userId));
      } else if (method === 'POST') {
        if (limited(req, res, userId, 'edit')) return true;
        await create(req, res, userId, area);
      } else {
        sendError(res, 'Method not allowed', 405);
      }
      return true;
    }

    const prefixes = area === 'story' ? ['story_', 'value_'] : ['belief_'];
    if (!ITEM_ID_PATTERN.test(rest) || !prefixes.some((p) => rest.startsWith(p))) {
      sendError(res, 'Not found', 404);
      return true;
    }
    if (method === 'PATCH') {
      if (limited(req, res, userId, 'edit')) return true;
      await edit(req, res, userId, area, rest);
    } else if (method === 'DELETE') {
      if (limited(req, res, userId, 'edit')) return true;
      const result = await forgetItem(userId, rest, 'user_deleted');
      if (result.success) sendJSON(res, { deleted: true });
      else
        sendError(
          res,
          result.error === 'not_found' ? 'Not found' : "Couldn't delete that",
          result.error === 'not_found' ? 404 : 503
        );
    } else {
      sendError(res, 'Method not allowed', 405);
    }
    return true;
  } catch (error) {
    log.error({ error: String(error), area }, 'Life story route failed');
    sendError(res, 'Something went wrong', 500);
    return true;
  }
}
