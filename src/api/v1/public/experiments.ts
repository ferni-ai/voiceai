/**
 * Public Experiments API Routes (v1)
 *
 * Public endpoints for web A/B testing (no auth required).
 * Used by frontend to get variant assignments and track events.
 *
 * Routes:
 *   GET  /api/v1/public/experiments/:id/variant  - Get variant for user
 *   POST /api/v1/public/experiments/track        - Track exposure/conversion
 *   POST /api/v1/public/experiments/track/batch  - Batch track events (handleTrackBatch)
 *
 * @module PublicExperimentsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import {
  assignVariant,
  trackConversion,
  trackExposure,
} from '../../../services/experiments/web-experiments.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody } from '../../helpers.js';
import { experimentSubject } from './experiment-subject.js';

const log = createLogger({ module: 'PublicExperimentsAPI' });

const BASE_PATH = '/api/v1/public/experiments';
const MAX_BATCH_EVENTS = 50;

// parseBody imported from '../../helpers.js'

/**
 * Send JSON response with CORS headers for public experiments API (cross-origin for landing pages)
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // Allow cross-origin for landing pages
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle public experiments API routes
 */
export async function handlePublicExperimentsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  try {
    // GET /api/v1/public/experiments/:id/variant
    const variantMatch = pathname.match(/\/experiments\/([^\/]+)\/variant$/);
    if (variantMatch && method === 'GET') {
      const experimentId = variantMatch[1];
      // Only an anonymous visitor id, or the verified caller (experiment-subject.ts)
      const userId = await experimentSubject(req, res, parsedUrl.searchParams.get('userId') ?? '');
      if (userId === null) return true;

      const assignment = await assignVariant(experimentId, userId, {
        isNewUser: parsedUrl.searchParams.get('isNewUser') === 'true',
        device: parsedUrl.searchParams.get('device') as 'mobile' | 'tablet' | 'desktop' | undefined,
        source: parsedUrl.searchParams.get('source') || undefined,
        country: parsedUrl.searchParams.get('country') || undefined,
      });

      if (!assignment) {
        sendJson(res, 200, {
          experimentId,
          variantId: null,
          reason: 'not_assigned',
        });
        return true;
      }

      sendJson(res, 200, {
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
        isNewAssignment: assignment.isNewAssignment,
      });
      return true;
    }

    // POST /api/v1/public/experiments/track
    if (pathname === `${BASE_PATH}/track` && method === 'POST') {
      const body = (await parseBody(req)) as {
        experimentId: string;
        variantId: string;
        userId: string;
        eventType: 'exposure' | 'conversion';
        goalId?: string;
        value?: number;
        metadata?: Record<string, unknown>;
      };

      if (!body.experimentId || !body.variantId || !body.userId || !body.eventType) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['experimentId', 'variantId', 'userId', 'eventType'],
        });
        return true;
      }
      const userId = await experimentSubject(req, res, body.userId);
      if (userId === null) return true;

      if (body.eventType === 'exposure') {
        await trackExposure(body.experimentId, body.variantId, userId, body.metadata);
      } else if (body.eventType === 'conversion') {
        if (!body.goalId) {
          sendJson(res, 400, { error: 'goalId is required for conversion events' });
          return true;
        }
        await trackConversion(
          body.experimentId,
          body.variantId,
          userId,
          body.goalId,
          body.value,
          body.metadata
        );
      } else {
        sendJson(res, 400, {
          error: 'Invalid eventType',
          allowed: ['exposure', 'conversion'],
        });
        return true;
      }

      sendJson(res, 200, { success: true });
      return true;
    }

    // POST /api/v1/public/experiments/track/batch
    if (pathname === `${BASE_PATH}/track/batch` && method === 'POST') {
      await handleTrackBatch(req, res);
      return true;
    }

    // Catch-all for unknown routes under /api/v1/public/experiments
    // Return 200 with error info instead of 404 to reduce noisy console errors
    log.debug({ pathname, method }, 'Unmatched experiments route');
    sendJson(res, 200, {
      error: 'Unknown experiments endpoint',
      code: 'UNKNOWN_ROUTE',
      path: pathname,
    });
    return true;
  } catch (error) {
    log.error({ error, pathname, method }, 'Error in public experiments API');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

/** Event types a batch records. Anything else is reported back, never counted as tracked. */
const BATCH_EVENT_TYPES: ReadonlySet<string> = new Set(['exposure', 'conversion']);

interface BatchEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  eventType: string;
  goalId?: string;
  value?: number;
}

/** Why an event of a batch is not recorded, or null. */
function batchRefusal(event: BatchEvent): string | null {
  if (!BATCH_EVENT_TYPES.has(event.eventType)) return 'Invalid eventType';
  if (event.eventType === 'conversion' && !event.goalId) return 'goalId is required for conversion events'; // prettier-ignore
  return null;
}

/**
 * One browser's batch of experiment events, recorded under one subject
 * (experiment-subject.ts: an anonymous visitor id, or the verified caller, each
 * rate-limited). At most MAX_BATCH_EVENTS; unknown types and conversions with no
 * goal come back in `skipped`. Only ids, the goal and its value are stored:
 * client `metadata` is not passed on. Serves app.ferni.ai's route and ferni.ai's
 * /api/landing/experiments/track/batch (landing-intelligence.routes.ts).
 */
export async function handleTrackBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await parseBody(req)) as { events?: BatchEvent[] } | undefined;
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    sendJson(res, 400, { error: 'events array is required' });
    return;
  }
  // One browser, one subject: every event must name the same id
  const ids = new Set(events.map((e) => e.userId));
  if (ids.size !== 1 || events.length > MAX_BATCH_EVENTS) {
    sendJson(res, 400, { error: `1-${MAX_BATCH_EVENTS} events for a single userId` });
    return;
  }
  const userId = await experimentSubject(req, res, [...ids][0]);
  if (userId === null) return;

  const skipped: string[] = [];
  const recordable = events.filter((event) => {
    const refused = batchRefusal(event);
    if (refused) skipped.push(`${event.eventType}: ${refused}`);
    return refused === null;
  });
  const results = await Promise.allSettled(
    recordable.map(async (event) => {
      const { experimentId, variantId, goalId = '', value } = event;
      if (event.eventType === 'exposure') await trackExposure(experimentId, variantId, userId);
      else await trackConversion(experimentId, variantId, userId, goalId, value);
    })
  );
  const tracked = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - tracked;
  sendJson(res, 200, { success: true, tracked, failed, ...(skipped.length > 0 && { skipped }) });
}

export default { handlePublicExperimentsRoutes };
