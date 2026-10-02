/**
 * Important dates & reminder settings for the signed-in user (web memory page).
 *
 *   GET    /api/memory/me/dates                → { dates: DateView[] }
 *   POST   /api/memory/me/dates                → 201 { date: DateView }
 *   PATCH  /api/memory/me/dates/:id            → { date: DateView }
 *   DELETE /api/memory/me/dates/:id            → { deleted: true }
 *   GET    /api/memory/me/reminder-settings    → { settings, timeZone }
 *   PUT    /api/memory/me/reminder-settings    → { settings, timeZone }
 *
 * Identity is the verified caller (`requestUserId`); dates are only ever read
 * from that user's own collection, so another user's id is simply 404.
 *
 * @module api/important-dates-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requestUserId } from './identity-guard.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';
import {
  createUserDate,
  deleteImportantDate,
  editImportantDate,
  getReminderSettings,
  listImportantDates,
  parsePatch,
  resolveTimeZone,
  rescheduleAllDates,
  updateReminderSettings,
  validateSettingsPatch,
  type ImportantDateError,
  type ImportantDateRecord,
  type ImportantDateKind,
} from '../services/important-dates/index.js';
import { localToday } from '../services/important-dates/date-math.js';
import { upcomingFor } from '../services/important-dates/upcoming.js';

const log = createLogger({ module: 'ImportantDatesRoutes' });

const DATES_PATH = '/api/memory/me/dates';
const SETTINGS_PATH = '/api/memory/me/reminder-settings';
const ID_PATTERN = /^date_[a-f0-9]{24}$/;

export function isImportantDatesRoute(pathname: string): boolean {
  return (
    pathname === DATES_PATH || pathname.startsWith(`${DATES_PATH}/`) || pathname === SETTINGS_PATH
  );
}

export interface DateView {
  id: string;
  title: string;
  date: string;
  recurring: boolean;
  kind: ImportantDateKind;
  source: 'detected' | 'user';
  personId?: string;
  remindersEnabled: boolean;
  reminderOffsets: number[];
  channels: string[] | null;
  nextOccurrence: string | null;
  daysUntil: number | null;
  nextReminderAt: string | null;
  updatedAt: string;
}

function toView(record: ImportantDateRecord, timeZone: string): DateView {
  const next = upcomingFor(record, localToday(new Date(), timeZone), 400);
  return {
    id: record.id,
    title: record.title,
    date: record.date,
    recurring: record.recurring,
    kind: record.kind,
    source: record.source,
    ...(record.personId ? { personId: record.personId } : {}),
    remindersEnabled: record.reminders.enabled,
    reminderOffsets: record.reminders.offsets,
    channels: record.channels ?? null,
    nextOccurrence: next?.occursOn ?? null,
    daysUntil: next?.daysUntil ?? null,
    nextReminderAt: record.nextReminderAt,
    updatedAt: record.updatedAt,
  };
}

function sendServiceError(res: ServerResponse, error: ImportantDateError): void {
  if (error.code === 'not_found') sendError(res, 'Not found', 404);
  else if (error.code === 'invalid_input') sendError(res, error.message, 400);
  else sendError(res, "Couldn't reach your dates. Try again?", 503);
}

async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> {
  try {
    return await parseBody<unknown>(req);
  } catch {
    sendError(res, 'Invalid JSON body', 400);
    return undefined;
  }
}

async function handleCreate(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  const body = await readBody(req, res);
  if (body === undefined) return;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const patch = parsePatch({ ...b, kind: b.kind ?? 'other' });
  if (!patch.success) return sendError(res, patch.error, 400);
  const p = patch.data;
  if (!p.title || !p.date) return sendError(res, 'title and date are required', 400);
  const recurring = p.recurring ?? (p.kind === 'birthday' || p.kind === 'anniversary');
  const person =
    typeof b.person === 'string' && b.person.trim() ? b.person.trim().slice(0, 100) : undefined;
  const created = await createUserDate(userId, {
    title: p.title,
    date: p.date,
    recurring,
    kind: p.kind ?? 'other',
    ...(person ? { person } : {}),
    ...(p.reminderOffsets ? { reminderOffsets: p.reminderOffsets } : {}),
    ...(p.remindersEnabled !== undefined ? { remindersEnabled: p.remindersEnabled } : {}),
    ...(p.channels ? { channels: p.channels } : {}),
  });
  if (!created.success) return sendServiceError(res, created.error);
  sendJSON(res, { date: toView(created.data, await resolveTimeZone(userId)) }, 201);
}

async function handleDates(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  userId: string
): Promise<boolean> {
  const method = req.method ?? 'GET';
  if (pathname === DATES_PATH) {
    if (method === 'GET') {
      const listed = await listImportantDates(userId);
      if (!listed.success) {
        sendServiceError(res, listed.error);
        return true;
      }
      const tz = await resolveTimeZone(userId);
      sendJSON(res, { dates: listed.data.map((r) => toView(r, tz)) });
      return true;
    }
    if (method === 'POST') {
      await handleCreate(req, res, userId);
      return true;
    }
    sendError(res, 'Method not allowed', 405);
    return true;
  }

  const id = pathname.slice(DATES_PATH.length + 1);
  if (!ID_PATTERN.test(id)) {
    sendError(res, 'Not found', 404);
    return true;
  }
  if (method === 'PATCH') {
    const body = await readBody(req, res);
    if (body === undefined) return true;
    const patch = parsePatch(body);
    if (!patch.success) {
      sendError(res, patch.error, 400);
      return true;
    }
    const edited = await editImportantDate(userId, id, patch.data);
    if (!edited.success) sendServiceError(res, edited.error);
    else sendJSON(res, { date: toView(edited.data, await resolveTimeZone(userId)) });
    return true;
  }
  if (method === 'DELETE') {
    const deleted = await deleteImportantDate(userId, id, 'user_deleted');
    if (!deleted.success) sendServiceError(res, deleted.error);
    else sendJSON(res, { deleted: true });
    return true;
  }
  sendError(res, 'Method not allowed', 405);
  return true;
}

async function handleSettings(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  const method = req.method ?? 'GET';
  if (method === 'GET') {
    const settings = await getReminderSettings(userId);
    sendJSON(res, { settings, timeZone: await resolveTimeZone(userId, settings) });
    return;
  }
  if (method !== 'PUT') return sendError(res, 'Method not allowed', 405);
  const body = await readBody(req, res);
  if (body === undefined) return;
  const patch = validateSettingsPatch(body);
  if (!patch.success) return sendError(res, patch.error, 400);
  const saved = await updateReminderSettings(userId, patch.data);
  if (!saved.success) return sendServiceError(res, saved.error);
  await rescheduleAllDates(userId);
  sendJSON(res, { settings: saved.data, timeZone: await resolveTimeZone(userId, saved.data) });
}

/** Returns true when the request was handled. */
export async function handleImportantDatesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isImportantDatesRoute(pathname)) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your dates', 401);
    return true;
  }
  try {
    if (pathname === SETTINGS_PATH) {
      await handleSettings(req, res, userId);
      return true;
    }
    return await handleDates(req, res, pathname, userId);
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Important dates route failed');
    if (!res.headersSent) sendError(res, "Couldn't do that. Try again?", 500);
    return true;
  }
}
