/**
 * Calendar Conflict Handlers
 *
 * Handles conflict detection, resolution, and preferences.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendError } from '../helpers.js';
import { sendJson, checkRateLimitAndApply } from './helpers.js';
import {
  getPendingConflicts,
  getConflictSummary,
  resolveConflict,
  dismissConflict,
  autoResolveConflicts,
  getResolutionPreference,
  setResolutionPreference,
} from '../../services/calendar/conflict-resolver.js';
import type { ConflictResolution } from '../../services/calendar/types.js';

const log = getLogger();

/**
 * GET /calendar/conflicts - Get pending conflicts
 */
export async function handleGetConflicts(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const [conflicts, summary, preference] = await Promise.all([
      getPendingConflicts(userId),
      getConflictSummary(userId),
      getResolutionPreference(userId),
    ]);

    sendJson(res, { success: true, conflicts, summary, preference });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get conflicts');
    sendError(res, 'Failed to get conflicts', 500);
  }
}

/**
 * POST /calendar/conflicts/:id/resolve - Resolve a specific conflict
 */
export async function handleResolveConflict(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  conflictId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'sync')) return;

  try {
    const body = await parseBody<{ resolution?: ConflictResolution }>(req);
    const resolution = body.resolution || 'newest-wins';

    const result = await resolveConflict(userId, conflictId, resolution, 'user');

    if (result.success) {
      sendJson(res, { success: true, message: 'Conflict resolved', resolution });
    } else {
      sendJson(res, { success: false, error: 'Failed to resolve conflict' });
    }
  } catch (error) {
    log.error({ error, userId, conflictId }, 'Failed to resolve conflict');
    sendError(res, 'Failed to resolve conflict', 500);
  }
}

/**
 * DELETE /calendar/conflicts/:id - Dismiss a conflict
 */
export async function handleDismissConflict(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  conflictId: string
): Promise<void> {
  try {
    const success = await dismissConflict(userId, conflictId);

    sendJson(res, {
      success,
      message: success ? 'Conflict dismissed' : 'Failed to dismiss conflict',
    });
  } catch (error) {
    log.error({ error, userId, conflictId }, 'Failed to dismiss conflict');
    sendError(res, 'Failed to dismiss conflict', 500);
  }
}

/**
 * POST /calendar/conflicts/auto-resolve - Auto-resolve all conflicts
 */
export async function handleAutoResolve(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'sync')) return;

  try {
    const body = await parseBody<{ strategy?: ConflictResolution }>(req);
    const strategy = body.strategy || 'newest-wins';
    const result = await autoResolveConflicts(userId, strategy);

    sendJson(res, {
      success: true,
      ...result,
      message: `Auto-resolved ${result.resolved} conflicts`,
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to auto-resolve conflicts');
    sendError(res, 'Failed to auto-resolve conflicts', 500);
  }
}

/**
 * PUT /calendar/conflicts/preference - Update resolution preference
 */
export async function handleSetPreference(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<{ strategy?: ConflictResolution }>(req);

    if (!body.strategy) {
      sendError(res, 'strategy is required', 400);
      return;
    }

    const valid: ConflictResolution[] = ['ferni-wins', 'provider-wins', 'newest-wins', 'manual'];
    if (!valid.includes(body.strategy)) {
      sendError(res, `Invalid strategy. Must be one of: ${valid.join(', ')}`, 400);
      return;
    }

    const success = await setResolutionPreference(userId, body.strategy);

    sendJson(res, {
      success,
      preference: body.strategy,
      message: success ? 'Preference updated' : 'Failed to update preference',
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to set preference');
    sendError(res, 'Failed to set preference', 500);
  }
}
