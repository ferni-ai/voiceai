/**
 * Work & career and travel & places API (alongside the memory control API).
 *
 *   GET    /api/memory/me/work           → { items: LifeItemView[], colleagues, updatedAt }
 *   GET    /api/memory/me/places         → { items: LifeItemView[], updatedAt }
 *   POST   /api/memory/me/work|places    → 201 { item }   body { kind, title, status?, employer?, role?,
 *                                                                team?, place?, category?, meaning?,
 *                                                                startDate?, endDate?, notes? }
 *   PATCH  /api/memory/me/work|places/:id → { item }      body any of { title, status, employer, role,
 *                                                                team, place, meaning, startDate,
 *                                                                endDate, notes } (null clears dates/notes)
 *   DELETE /api/memory/me/work|places/:id → { deleted: true }   (tombstoned; its reminder goes too)
 *
 * Identity comes only from `requestUserId(req)`. Ids are looked up inside the
 * caller's own subcollection, so another user's id is a 404.
 *
 * @module api/work-places-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  areaOfKind,
  createUserLifeItem,
  editUserLifeItem,
  forgetLifeItem,
  getPlacesView,
  getWorkView,
  isValidLifeDate,
  ITEM_ID_PATTERN,
  toView,
  type LifeArea,
  type LifeInput,
  type LifeKind,
  type LifePatch,
} from '../services/work-and-places/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody, sendError, sendJSON } from './helpers.js';
import { requestUserId } from './identity-guard.js';

const log = createLogger({ module: 'WorkPlacesRoutes' });

const PATHS: Readonly<Record<LifeArea, string>> = {
  work: '/api/memory/me/work',
  places: '/api/memory/me/places',
};

export function isWorkPlacesRoute(pathname: string): boolean {
  return Object.values(PATHS).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const body = await parseBody<unknown>(req);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Body → page input. Null when it isn't a valid item for this area. */
export function inputFromBody(
  area: LifeArea,
  body: Record<string, unknown>
): Omit<LifeInput, 'source' | 'confidence'> | null {
  const kind = str(body.kind);
  if (!kind || areaOfKind(kind) !== area) return null;
  const title = str(body.title)?.trim();
  const subject = (area === 'work' ? str(body.employer) : str(body.place))?.trim() || title || '';
  if (!subject) return null;
  for (const field of ['startDate', 'endDate']) {
    if (body[field] !== undefined && !isValidLifeDate(body[field])) return null;
  }
  return {
    area,
    kind: kind as LifeKind,
    subject:
      kind === 'project' || kind === 'goal' || kind === 'win' || kind === 'stress'
        ? title || subject
        : subject,
    title,
    status: str(body.status) as LifeInput['status'],
    employer: str(body.employer),
    role: str(body.role),
    team: str(body.team),
    place: area === 'places' ? str(body.place) || title : undefined,
    category: str(body.category) as LifeInput['category'],
    meaning: str(body.meaning),
    startDate: str(body.startDate),
    endDate: str(body.endDate),
    notes: str(body.notes),
    additional: true, // adding an old job on the page must not end the current one
  };
}

const PATCH_TEXT = ['title', 'employer', 'role', 'team', 'place', 'meaning'] as const;

/** Body → patch. Null when any field has the wrong type. */
export function patchFromBody(body: Record<string, unknown>): LifePatch | null {
  const patch: Record<string, unknown> = {};
  for (const field of PATCH_TEXT) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') return null;
    patch[field] = body[field];
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string') return null;
    patch.status = body.status;
  }
  for (const field of ['startDate', 'endDate', 'notes'] as const) {
    const v = body[field];
    if (v === undefined) continue;
    if (v !== null && typeof v !== 'string') return null;
    if (v !== null && field !== 'notes' && !isValidLifeDate(v)) return null;
    patch[field] = v;
  }
  return Object.keys(patch).length ? (patch as LifePatch) : null;
}

export async function handleWorkPlacesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const area = (Object.keys(PATHS) as LifeArea[]).find(
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
  const today = new Date().toISOString().slice(0, 10);

  try {
    if (!rest) {
      if (method === 'GET') {
        sendJSON(res, area === 'work' ? await getWorkView(userId) : await getPlacesView(userId));
        return true;
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const input = body ? inputFromBody(area, body) : null;
        if (!input) {
          sendError(res, 'Invalid item', 400);
          return true;
        }
        const result = await createUserLifeItem(userId, input);
        if (!result.item) {
          const status = result.reason === 'storage unavailable' ? 503 : 400;
          sendError(res, status === 503 ? "Couldn't save that" : 'Invalid item', status);
          return true;
        }
        sendJSON(
          res,
          { item: toView(result.item, [], today) },
          result.outcome === 'created' ? 201 : 200
        );
        return true;
      }
      sendError(res, 'Method not allowed', 405);
      return true;
    }

    const expectedPrefix = area === 'work' ? 'work_' : 'place_';
    if (!ITEM_ID_PATTERN.test(rest) || !rest.startsWith(expectedPrefix)) {
      sendError(res, 'Not found', 404);
      return true;
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      const patch = body ? patchFromBody(body) : null;
      if (!patch) {
        sendError(res, 'Invalid item', 400);
        return true;
      }
      const result = await editUserLifeItem(userId, area, rest, patch);
      if (!result.success) {
        const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 400 : 503;
        sendError(
          res,
          status === 404 ? 'Not found' : status === 400 ? 'Invalid item' : "Couldn't save that",
          status
        );
        return true;
      }
      sendJSON(res, { item: toView(result.data, [], today) });
      return true;
    }

    if (method === 'DELETE') {
      const result = await forgetLifeItem(userId, area, rest, 'user_deleted');
      if (!result.success) {
        sendError(
          res,
          result.error === 'not_found' ? 'Not found' : "Couldn't delete that",
          result.error === 'not_found' ? 404 : 503
        );
        return true;
      }
      sendJSON(res, { deleted: true });
      return true;
    }

    sendError(res, 'Method not allowed', 405);
    return true;
  } catch (error) {
    log.error({ error: String(error), area }, 'Work/places route failed');
    sendError(res, 'Something went wrong', 500);
    return true;
  }
}
