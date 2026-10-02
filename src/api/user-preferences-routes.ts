/**
 * User preference profile API (alongside the memory control API).
 *
 *   GET    /api/memory/me/preferences          → { preferences: PreferenceView[], updatedAt }
 *   POST   /api/memory/me/preferences          → 201 { preference }   body { domain, key, value, sentiment?, details? }
 *   PATCH  /api/memory/me/preferences/:id      → { preference }       body { value?, sentiment?, details? }
 *   GET    /api/memory/me/preferences?domain=interests  → only that domain
 *
 * Interests & hobbies use the same routes (domain 'interests', key 'interest:<name>',
 * details { kind, level, relatedPeople, specifics }); so do music & entertainment
 * (domain 'media', key '<artist|genre|song|show|movie|book|podcast|game|team>:<name>',
 * sentiment, details { status, progress, opinion, contexts, memories, relatedPeople }).
 *   DELETE /api/memory/me/preferences/:id      → { deleted: true }    (tombstoned)
 *
 * Identity comes only from `requestUserId(req)` (verified uid or anonymous device id).
 * Ids are looked up inside the caller's own subcollection, so another user's id is a 404.
 *
 * @module api/user-preferences-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  deletePreference,
  editPreference,
  isActive,
  listPreferences,
  upsertPreference,
  validateInput,
  type PreferenceInput,
  type UserPreference,
} from '../services/user-preferences/index.js';
import { mirrorToUserProfile } from '../services/user-preferences/account-sync.js';
import { sanitizeDetails } from '../services/user-preferences/interest-details.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody, sendError, sendJSON } from './helpers.js';
import { requestUserId } from './identity-guard.js';

const log = createLogger({ module: 'UserPreferenceRoutes' });

export const PREFERENCES_PATH = '/api/memory/me/preferences';
const ID_PATTERN = /^pref_[a-f0-9]{24}$/;

export type PreferenceView = UserPreference & { readonly active: boolean };

function view(p: UserPreference): PreferenceView {
  return { ...p, active: isActive(p) };
}

function mirror(userId: string, p: UserPreference | undefined): void {
  if (!p) return;
  if (p.key === 'responseLength' || p.key.startsWith('avoidTopic:')) {
    void mirrorToUserProfile(userId).catch((e: unknown) =>
      log.debug({ error: String(e) }, 'Profile mirror failed')
    );
  }
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

function sentimentOf(value: unknown): 'like' | 'dislike' | undefined | null {
  if (value === undefined) return undefined;
  return value === 'like' || value === 'dislike' ? value : null;
}

export async function handleUserPreferenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== PREFERENCES_PATH && !pathname.startsWith(`${PREFERENCES_PATH}/`)) return false;

  const userId = requestUserId(req);
  if (!userId) {
    sendError(res, 'Sign in to see your preferences', 401);
    return true;
  }
  const method = req.method ?? 'GET';
  const rest = pathname.slice(PREFERENCES_PATH.length).replace(/^\//, '');

  try {
    if (!rest) {
      if (method === 'GET') {
        const domain = new URL(req.url ?? '/', 'http://internal').searchParams.get('domain');
        const all = await listPreferences(userId, { fresh: true });
        const prefs = domain ? all.filter((p) => p.domain === domain) : all;
        const updatedAt = prefs.reduce((max, p) => (p.updatedAt > max ? p.updatedAt : max), '');
        sendJSON(res, { preferences: prefs.map(view), updatedAt: updatedAt || null });
        return true;
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const sentiment = sentimentOf(body?.sentiment);
        if (!body || sentiment === null) {
          sendError(res, 'Invalid preference', 400);
          return true;
        }
        const details = sanitizeDetails(body.details);
        if (details === null) {
          sendError(res, 'Invalid preference (details)', 400);
          return true;
        }
        const input: PreferenceInput = {
          domain: body.domain as PreferenceInput['domain'],
          key: typeof body.key === 'string' ? body.key : '',
          value: typeof body.value === 'string' ? body.value : '',
          ...(sentiment ? { sentiment } : {}),
          ...(body.details !== undefined ? { details } : {}),
          source: 'explicit',
          confidence: 1,
          userEdited: true,
        };
        const checked = validateInput(input);
        if (!checked.ok) {
          sendError(
            res,
            `Invalid preference (${checked.error.field}: ${checked.error.message})`,
            400
          );
          return true;
        }
        const result = await upsertPreference(userId, checked.value);
        if (!result.preference) {
          sendError(res, "Couldn't save that preference", 503);
          return true;
        }
        mirror(userId, result.preference);
        sendJSON(
          res,
          { preference: view(result.preference) },
          result.outcome === 'created' ? 201 : 200
        );
        return true;
      }
      sendError(res, 'Method not allowed', 405);
      return true;
    }

    if (!ID_PATTERN.test(rest)) {
      sendError(res, 'Preference not found', 404);
      return true;
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      const sentiment = sentimentOf(body?.sentiment);
      const details = body ? sanitizeDetails(body.details) : null;
      const hasValue = typeof body?.value === 'string';
      if (
        !body ||
        (!hasValue && body.details === undefined) ||
        (body.value !== undefined && !hasValue) ||
        sentiment === null ||
        details === null
      ) {
        sendError(res, 'Invalid preference', 400);
        return true;
      }
      const result = await editPreference(userId, rest, {
        ...(hasValue ? { value: body.value as string } : {}),
        ...(sentiment ? { sentiment } : {}),
        ...(body.details !== undefined ? { details } : {}),
      });
      if (!result.success) {
        const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 400 : 503;
        sendError(res, status === 404 ? 'Preference not found' : 'Invalid preference', status);
        return true;
      }
      mirror(userId, result.data);
      sendJSON(res, { preference: view(result.data) });
      return true;
    }

    if (method === 'DELETE') {
      const existing = (await listPreferences(userId)).find((p) => p.id === rest);
      const deleted = await deletePreference(userId, rest, 'user_deleted');
      if (!deleted) {
        sendError(res, 'Preference not found', 404);
        return true;
      }
      mirror(userId, existing);
      sendJSON(res, { deleted: true });
      return true;
    }

    sendError(res, 'Method not allowed', 405);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Preference route failed');
    sendError(res, 'Something went wrong', 500);
    return true;
  }
}
