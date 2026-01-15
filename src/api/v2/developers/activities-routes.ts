/**
 * Developer Platform API v2 - Activities Routes
 *
 * Track custom activities and metrics for developer analytics.
 *
 * Endpoints:
 *   POST   /api/v2/developers/activities          - Log new activity
 *   GET    /api/v2/developers/activities          - Query activities
 *   GET    /api/v2/developers/activities/stats    - Get aggregate stats
 *   GET    /api/v2/developers/activities/:id      - Get activity
 *   PUT    /api/v2/developers/activities/:id      - Update activity
 *   DELETE /api/v2/developers/activities/:id      - Delete activity
 *
 * @module api/v2/developers/activities-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { sendError } from '../../helpers.js';
import {
  requireApiKeyAuth,
  extractIdFromPath,
  parseJsonBody,
  generateId,
  sendItemResponse,
  sendPaginatedResponse,
} from './shared/middleware.js';
import { CreateActivitySchema, UpdateActivitySchema, ActivityQuerySchema } from './shared/validation.js';
import type {
  DeveloperActivity,
  ActivityStats,
} from './shared/types.js';
import { COLLECTIONS, ID_PREFIXES } from './shared/types.js';

const log = getLogger().child({ module: 'activities-routes' });

/** Base path for activities API */
const BASE_PATH = '/api/v2/developers/activities';

// ============================================================================
// HELPERS
// ============================================================================

/** Convert Firestore timestamp to Date */
function convertTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

/** Parse query string parameters */
function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return params;

  const queryString = url.slice(queryStart + 1);
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle all /api/v2/developers/activities/* routes
 */
export async function handleActivitiesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  // POST /activities - Create activity
  if (method === 'POST' && (subPath === '' || subPath === '/')) {
    return handleCreateActivity(req, res);
  }

  // GET /activities/stats - Get stats (must be before :id)
  if (method === 'GET' && subPath === '/stats') {
    return handleGetStats(req, res);
  }

  // GET /activities - List activities
  if (method === 'GET' && (subPath === '' || subPath === '/')) {
    return handleListActivities(req, res);
  }

  // Extract activity ID for other routes
  const activityId = extractIdFromPath(subPath, '/');
  if (!activityId) {
    return false;
  }

  // GET /activities/:id - Get single activity
  if (method === 'GET') {
    return handleGetActivity(req, res, activityId);
  }

  // PUT /activities/:id - Update activity
  if (method === 'PUT') {
    return handleUpdateActivity(req, res, activityId);
  }

  // DELETE /activities/:id - Delete activity
  if (method === 'DELETE') {
    return handleDeleteActivity(req, res, activityId);
  }

  return false;
}

// ============================================================================
// CREATE ACTIVITY
// ============================================================================

/**
 * POST /activities - Log a new activity
 */
async function handleCreateActivity(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = CreateActivitySchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Create activity document
    const activityId = generateId(ID_PREFIXES.ACTIVITY);
    const now = new Date();

    const activity: Omit<DeveloperActivity, 'id'> = {
      publisherId: auth.publisherId,
      personaId: input.personaId,
      userId: input.userId,
      sessionId: input.sessionId,
      type: input.type,
      name: input.name,
      data: input.data || {},
      status: input.status || 'started',
      startedAt: input.status === 'started' ? now : undefined,
      completedAt: input.status === 'completed' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).set(activity);

    log.info(
      { activityId, publisherId: auth.publisherId, type: input.type },
      'Activity created'
    );

    sendItemResponse(res, { ...activity, id: activityId });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to create activity');
    sendError(res, 'Failed to create activity', 500);
    return true;
  }
}

// ============================================================================
// LIST ACTIVITIES
// ============================================================================

/**
 * GET /activities - Query activities with filters
 */
async function handleListActivities(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse query params
  const queryParams = parseQueryParams(req.url || '');
  const parseResult = ActivityQuerySchema.safeParse(queryParams);
  if (!parseResult.success) {
    sendError(res, `Invalid query parameters: ${parseResult.error.message}`, 400);
    return true;
  }

  const { limit = 50, cursor, type, status, userId, sessionId, startDate, endDate } = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Build query with filters
    let query = db
      .collection(COLLECTIONS.ACTIVITIES)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc');

    // Apply optional filters
    if (type) {
      query = query.where('type', '==', type);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    if (sessionId) {
      query = query.where('sessionId', '==', sessionId);
    }

    // Handle cursor pagination
    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.ACTIVITIES).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Execute query
    const snapshot = await query.limit(limit + 1).get();

    const activities: DeveloperActivity[] = [];
    let hasMore = false;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i === limit) {
        hasMore = true;
        break;
      }

      const doc = snapshot.docs[i];
      const data = doc.data() as Record<string, unknown>;

      // Filter by date range client-side (Firestore doesn't support multiple range filters)
      const createdAt = convertTimestamp(data.createdAt);
      if (startDate && createdAt && createdAt < startDate) continue;
      if (endDate && createdAt && createdAt > endDate) continue;

      activities.push({
        id: doc.id,
        publisherId: data.publisherId as string,
        personaId: data.personaId as string | undefined,
        userId: data.userId as string | undefined,
        sessionId: data.sessionId as string | undefined,
        type: data.type as string,
        name: data.name as string,
        data: (data.data as Record<string, unknown>) || {},
        status: data.status as DeveloperActivity['status'],
        startedAt: convertTimestamp(data.startedAt),
        completedAt: convertTimestamp(data.completedAt),
        duration: data.duration as number | undefined,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      });
    }

    sendPaginatedResponse(res, activities, {
      limit,
      cursor: hasMore ? activities[activities.length - 1]?.id : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list activities');
    sendError(res, 'Failed to list activities', 500);
    return true;
  }
}

// ============================================================================
// GET ACTIVITY
// ============================================================================

/**
 * GET /activities/:id - Get single activity
 */
async function handleGetActivity(
  req: IncomingMessage,
  res: ServerResponse,
  activityId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).get();

    if (!doc.exists) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    const activity: DeveloperActivity = {
      id: doc.id,
      publisherId: data.publisherId as string,
      personaId: data.personaId as string | undefined,
      userId: data.userId as string | undefined,
      sessionId: data.sessionId as string | undefined,
      type: data.type as string,
      name: data.name as string,
      data: (data.data as Record<string, unknown>) || {},
      status: data.status as DeveloperActivity['status'],
      startedAt: convertTimestamp(data.startedAt),
      completedAt: convertTimestamp(data.completedAt),
      duration: data.duration as number | undefined,
      createdAt: convertTimestamp(data.createdAt) || new Date(),
      updatedAt: convertTimestamp(data.updatedAt) || new Date(),
    };

    sendItemResponse(res, activity);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, activityId }, 'Failed to get activity');
    sendError(res, 'Failed to get activity', 500);
    return true;
  }
}

// ============================================================================
// UPDATE ACTIVITY
// ============================================================================

/**
 * PUT /activities/:id - Update activity
 */
async function handleUpdateActivity(
  req: IncomingMessage,
  res: ServerResponse,
  activityId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = UpdateActivitySchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).get();

    if (!doc.exists) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    // Calculate duration if completing
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    if (input.status === 'completed' && !input.completedAt) {
      updates.completedAt = new Date();
    }

    // Calculate duration if we now have both start and end times
    if (updates.completedAt || input.status === 'completed') {
      const startedAt = convertTimestamp(data.startedAt);
      const completedAt = convertTimestamp(updates.completedAt) || new Date();
      if (startedAt) {
        updates.duration = completedAt.getTime() - startedAt.getTime();
      }
    }

    await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).update(updates);

    log.info(
      { activityId, publisherId: auth.publisherId, status: input.status },
      'Activity updated'
    );

    // Return updated activity
    const updatedDoc = await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).get();
    const updatedData = updatedDoc.data() as Record<string, unknown>;

    const activity: DeveloperActivity = {
      id: updatedDoc.id,
      publisherId: updatedData.publisherId as string,
      personaId: updatedData.personaId as string | undefined,
      userId: updatedData.userId as string | undefined,
      sessionId: updatedData.sessionId as string | undefined,
      type: updatedData.type as string,
      name: updatedData.name as string,
      data: (updatedData.data as Record<string, unknown>) || {},
      status: updatedData.status as DeveloperActivity['status'],
      startedAt: convertTimestamp(updatedData.startedAt),
      completedAt: convertTimestamp(updatedData.completedAt),
      duration: updatedData.duration as number | undefined,
      createdAt: convertTimestamp(updatedData.createdAt) || new Date(),
      updatedAt: convertTimestamp(updatedData.updatedAt) || new Date(),
    };

    sendItemResponse(res, activity);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, activityId }, 'Failed to update activity');
    sendError(res, 'Failed to update activity', 500);
    return true;
  }
}

// ============================================================================
// DELETE ACTIVITY
// ============================================================================

/**
 * DELETE /activities/:id - Delete activity
 */
async function handleDeleteActivity(
  req: IncomingMessage,
  res: ServerResponse,
  activityId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).get();

    if (!doc.exists) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Activity not found', 404);
      return true;
    }

    await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).delete();

    log.info({ activityId, publisherId: auth.publisherId }, 'Activity deleted');

    sendItemResponse(res, { deleted: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, activityId }, 'Failed to delete activity');
    sendError(res, 'Failed to delete activity', 500);
    return true;
  }
}

// ============================================================================
// GET STATS
// ============================================================================

/**
 * GET /activities/stats - Get aggregate statistics
 */
async function handleGetStats(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse optional query params for filtering
  const queryParams = parseQueryParams(req.url || '');

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Build base query
    let query = db
      .collection(COLLECTIONS.ACTIVITIES)
      .where('publisherId', '==', auth.publisherId);

    // Apply optional filters
    if (queryParams.type) {
      query = query.where('type', '==', queryParams.type);
    }
    if (queryParams.userId) {
      query = query.where('userId', '==', queryParams.userId);
    }
    if (queryParams.sessionId) {
      query = query.where('sessionId', '==', queryParams.sessionId);
    }

    const snapshot = await query.get();

    // Calculate stats
    const stats: ActivityStats = {
      totalCount: 0,
      byType: {},
      byStatus: {
        started: 0,
        completed: 0,
        failed: 0,
      },
      averageDurationMs: undefined,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data) continue;

      stats.totalCount++;

      // Count by type
      const type = data.type as string;
      if (type) {
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }

      // Count by status
      const status = data.status as DeveloperActivity['status'];
      if (status && stats.byStatus[status] !== undefined) {
        stats.byStatus[status]++;
      }

      // Calculate average duration
      const duration = data.duration as number | undefined;
      if (typeof duration === 'number') {
        totalDuration += duration;
        durationCount++;
      }
    }

    if (durationCount > 0) {
      stats.averageDurationMs = Math.round(totalDuration / durationCount);
    }

    sendItemResponse(res, stats);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to get activity stats');
    sendError(res, 'Failed to get activity stats', 500);
    return true;
  }
}

export default { handleActivitiesRoutes };
