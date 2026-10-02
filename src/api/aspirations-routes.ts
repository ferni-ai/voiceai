/**
 * Goals, habits and dreams for the signed-in user (web memory page).
 *
 *   GET    /api/memory/me/aspirations                → { aspirations: AspirationView[], timeZone }
 *   POST   /api/memory/me/aspirations                → 201 { aspiration }
 *   PATCH  /api/memory/me/aspirations/:id            → { aspiration }
 *   DELETE /api/memory/me/aspirations/:id            → { deleted: true }
 *   POST   /api/memory/me/aspirations/:id/check-ins  → { aspiration }
 *
 * Identity is the verified caller (`requestUserId`); items are only ever read
 * from that user's own collection, so another user's id is simply 404.
 *
 * @module api/aspirations-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requestUserId } from './identity-guard.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';
import {
  ASPIRATION_ID_PATTERN,
  createUserAspiration,
  deleteAspiration,
  editAspiration,
  isConfirmed,
  isDueOn,
  listAspirations,
  parseCreate,
  parsePatch,
  recordCheckIn,
  validateCheckIn,
  type AspirationError,
  type AspirationRecord,
  type CheckIn,
  type Milestone,
} from '../services/aspirations/index.js';
import { localToday } from '../services/important-dates/date-math.js';
import { resolveTimeZone } from '../services/important-dates/settings.js';

const log = createLogger({ module: 'AspirationsRoutes' });

const BASE = '/api/memory/me/aspirations';
const RECENT_CHECK_INS = 14;

export function isAspirationsRoute(pathname: string): boolean {
  return pathname === BASE || pathname.startsWith(`${BASE}/`);
}

export interface AspirationView {
  id: string;
  level: AspirationRecord['level'];
  title: string;
  why?: string;
  status: AspirationRecord['status'];
  parentId: string | null;
  category?: string;
  targetDate?: string;
  progress?: number;
  milestones: Milestone[];
  source: AspirationRecord['source'];
  /** False for inferred items Ferni isn't treating as commitments yet. */
  confirmed: boolean;
  userEdited: boolean;
  createdAt: string;
  updatedAt: string;
  habit?: {
    frequency: string;
    days?: number[];
    timesPerDay: number;
    reminderTime?: string;
    glidepathLevel?: number;
    cue?: string;
    routine?: string;
    reward?: string;
    stackAnchor?: string;
    streak: number;
    longestStreak: number;
    dueToday: boolean;
    recentCheckIns: Array<Pick<CheckIn, 'date' | 'status' | 'note'>>;
  };
}

export function toView(r: AspirationRecord, timeZone: string, now = new Date()): AspirationView {
  const h = r.habit;
  const today = localToday(now, timeZone);
  return {
    id: r.id,
    level: r.level,
    title: r.title,
    ...(r.why ? { why: r.why } : {}),
    status: r.status,
    parentId: r.parentId,
    ...(r.category ? { category: r.category } : {}),
    ...(r.targetDate ? { targetDate: r.targetDate } : {}),
    ...(r.progress !== undefined ? { progress: r.progress } : {}),
    milestones: r.milestones,
    source: r.source,
    confirmed: isConfirmed(r),
    userEdited: r.userEdited,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(h
      ? {
          habit: {
            frequency: h.schedule.frequency,
            ...(h.schedule.days ? { days: h.schedule.days } : {}),
            timesPerDay: h.schedule.timesPerDay,
            ...(h.schedule.reminderTime ? { reminderTime: h.schedule.reminderTime } : {}),
            ...(h.glidepathLevel ? { glidepathLevel: h.glidepathLevel } : {}),
            ...(h.loop?.cue ? { cue: h.loop.cue } : {}),
            ...(h.loop?.routine ? { routine: h.loop.routine } : {}),
            ...(h.loop?.reward ? { reward: h.loop.reward } : {}),
            ...(h.stackAnchor ? { stackAnchor: h.stackAnchor } : {}),
            streak: h.streak,
            longestStreak: h.longestStreak,
            dueToday: r.status === 'active' && isDueOn(h, today),
            recentCheckIns: h.checkIns.slice(-RECENT_CHECK_INS).map((c) => ({
              date: c.date,
              status: c.status,
              ...(c.note ? { note: c.note } : {}),
            })),
          },
        }
      : {}),
  };
}

function sendServiceError(res: ServerResponse, error: AspirationError): void {
  if (error.code === 'not_found') sendError(res, 'Not found', 404);
  else if (error.code === 'invalid_input') sendError(res, error.message, 400);
  else sendError(res, "Couldn't reach your goals. Try again?", 503);
}

async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> {
  try {
    return await parseBody<unknown>(req);
  } catch {
    sendError(res, 'Invalid JSON body', 400);
    return undefined;
  }
}

async function handleCollection(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  const method = req.method ?? 'GET';
  if (method === 'GET') {
    const listed = await listAspirations(userId);
    if (!listed.success) return sendServiceError(res, listed.error);
    const tz = await resolveTimeZone(userId);
    return sendJSON(res, { aspirations: listed.data.map((r) => toView(r, tz)), timeZone: tz });
  }
  if (method !== 'POST') return sendError(res, 'Method not allowed', 405);
  const body = await readBody(req, res);
  if (body === undefined) return;
  const parsed = parseCreate(body);
  if (!parsed.success) return sendError(res, parsed.error, 400);
  const created = await createUserAspiration(userId, parsed.data);
  if (!created.success) return sendServiceError(res, created.error);
  sendJSON(res, { aspiration: toView(created.data, await resolveTimeZone(userId)) }, 201);
}

async function handleItem(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  id: string,
  sub: string | undefined
): Promise<void> {
  const method = req.method ?? 'GET';
  if (sub === 'check-ins') {
    if (method !== 'POST') return sendError(res, 'Method not allowed', 405);
    const body = await readBody(req, res);
    if (body === undefined) return;
    const input = validateCheckIn(body);
    if (typeof input === 'string') return sendError(res, input, 400);
    const saved = await recordCheckIn(userId, id, input);
    if (!saved.success) return sendServiceError(res, saved.error);
    return sendJSON(res, { aspiration: toView(saved.data, await resolveTimeZone(userId)) });
  }
  if (sub !== undefined) return sendError(res, 'Not found', 404);
  if (method === 'PATCH') {
    const body = await readBody(req, res);
    if (body === undefined) return;
    const patch = parsePatch(body);
    if (!patch.success) return sendError(res, patch.error, 400);
    const edited = await editAspiration(userId, id, patch.data);
    if (!edited.success) return sendServiceError(res, edited.error);
    return sendJSON(res, { aspiration: toView(edited.data, await resolveTimeZone(userId)) });
  }
  if (method === 'DELETE') {
    const deleted = await deleteAspiration(userId, id, 'user_deleted');
    if (!deleted.success) return sendServiceError(res, deleted.error);
    return sendJSON(res, { deleted: true });
  }
  sendError(res, 'Method not allowed', 405);
}

/** Returns true when the request was handled. */
export async function handleAspirationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isAspirationsRoute(pathname)) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your goals', 401);
    return true;
  }
  try {
    if (pathname === BASE) {
      await handleCollection(req, res, userId);
      return true;
    }
    const [id, sub, ...rest] = pathname.slice(BASE.length + 1).split('/');
    if (!ASPIRATION_ID_PATTERN.test(id) || rest.length > 0) {
      sendError(res, 'Not found', 404);
      return true;
    }
    await handleItem(req, res, userId, id, sub);
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Aspirations route failed');
    if (!res.headersSent) sendError(res, "Couldn't do that. Try again?", 500);
    return true;
  }
}
