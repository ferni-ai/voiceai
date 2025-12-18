/**
 * Public Experiments API Routes (v1)
 *
 * Public endpoints for web A/B testing (no auth required).
 * Used by frontend to get variant assignments and track events.
 *
 * Routes:
 *   GET  /api/v1/public/experiments/:id/variant  - Get variant for user
 *   POST /api/v1/public/experiments/track        - Track exposure/conversion
 *   POST /api/v1/public/experiments/track/batch  - Batch track events
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

const log = createLogger({ module: 'PublicExperimentsAPI' });

const BASE_PATH = '/api/v1/public/experiments';

// parseBody imported from '../../helpers.js'

/**
 * Send JSON response with CORS headers for public experiments API (cross-origin for landing pages)
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // Allow cross-origin for landing pages
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
      'Access-Control-Allow-Headers': 'Content-Type',
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
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, {
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
        return true;
      }

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

      if (body.eventType === 'exposure') {
        await trackExposure(body.experimentId, body.variantId, body.userId, body.metadata);
      } else if (body.eventType === 'conversion') {
        if (!body.goalId) {
          sendJson(res, 400, { error: 'goalId is required for conversion events' });
          return true;
        }
        await trackConversion(
          body.experimentId,
          body.variantId,
          body.userId,
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
      const body = (await parseBody(req)) as {
        events: Array<{
          experimentId: string;
          variantId: string;
          userId: string;
          eventType: 'exposure' | 'conversion';
          goalId?: string;
          value?: number;
          metadata?: Record<string, unknown>;
        }>;
      };

      if (!Array.isArray(body.events) || body.events.length === 0) {
        sendJson(res, 400, { error: 'events array is required' });
        return true;
      }

      const results = await Promise.allSettled(
        body.events.map(async (event) => {
          if (event.eventType === 'exposure') {
            await trackExposure(event.experimentId, event.variantId, event.userId, event.metadata);
          } else if (event.eventType === 'conversion' && event.goalId) {
            await trackConversion(
              event.experimentId,
              event.variantId,
              event.userId,
              event.goalId,
              event.value,
              event.metadata
            );
          }
        })
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      sendJson(res, 200, {
        success: true,
        tracked: succeeded,
        failed,
      });
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Error in public experiments API');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default { handlePublicExperimentsRoutes };
