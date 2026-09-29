/**
 * Landing page experiment routes (public, used by ferni.ai's experiments.js).
 *
 * - GET  /api/landing/experiments/:id/variant
 *     Web experiments from the variant library (`hero-headline`, `hero-cta`,
 *     `trust-badges`, ...) are assigned via web-experiments, so the site gets a
 *     real variant id it can render. Landing feature flags (`landing-ai-*`)
 *     keep their enabled/control rollout. Anything else is `control`.
 * - POST /api/landing/experiments/track/batch
 *     Persists events exactly like `/api/v1/public/experiments/track` (they
 *     used to be logged and dropped).
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { TRUST_FLAGS, getFlag, isEnabled, type TrustFlagId } from '../services/feature-flags.js';
import { trackExperimentEvents } from '../services/experiments/experiment-event-batch.js';
import { EXPERIMENTS } from '../services/experiments/variant-library.js';
import { assignVariant } from '../services/experiments/web-experiments.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody } from './helpers.js';

const log = createLogger({ module: 'landing-experiments' });

const VARIANT_PATH = /^\/api\/landing\/experiments\/([^/]+)\/variant$/;
const BATCH_PATH = '/api/landing/experiments/track/batch';

/** Multi-variant experiments defined in the variant library. */
const WEB_EXPERIMENT_IDS: ReadonlySet<string> = new Set(EXPERIMENTS.map((e) => e.id));

function isLandingFlag(id: string): id is TrustFlagId {
  return Object.prototype.hasOwnProperty.call(TRUST_FLAGS, id);
}

/** Every id the landing site may report events for. */
const TRACKABLE_IDS: ReadonlySet<string> = new Set([
  ...WEB_EXPERIMENT_IDS,
  ...Object.keys(TRUST_FLAGS).filter((id) => id.startsWith('landing-')),
]);

function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

async function resolveVariant(
  experimentId: string,
  visitorId: string
): Promise<{ variantId: string; reason: string; percentage?: number }> {
  if (WEB_EXPERIMENT_IDS.has(experimentId)) {
    try {
      const assignment = await assignVariant(experimentId, visitorId);
      if (assignment) return { variantId: assignment.variantId, reason: 'assigned' };
    } catch (error) {
      log.warn({ error: String(error), experimentId }, 'Variant assignment failed');
    }
    return { variantId: 'control', reason: 'not_running' };
  }

  if (isLandingFlag(experimentId)) {
    const enabled = isEnabled(experimentId, visitorId);
    return {
      variantId: enabled ? 'enabled' : 'control',
      reason: enabled ? 'enabled_for_user' : 'not_in_rollout',
      percentage: getFlag(experimentId).percentage,
    };
  }

  return { variantId: 'control', reason: 'unknown_experiment' };
}

/**
 * @returns true when the request was handled
 */
export async function handleLandingExperimentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  const variantMatch = VARIANT_PATH.exec(pathname);
  if (variantMatch && method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    // `visitorId` survives the identity guard, which strips non-device `userId` params
    const visitorId =
      url.searchParams.get('visitorId') || url.searchParams.get('userId') || 'anonymous';
    send(res, 200, await resolveVariant(decodeURIComponent(variantMatch[1]), visitorId));
    return true;
  }

  if (pathname === BATCH_PATH && method === 'POST') {
    let body: { events?: unknown };
    try {
      body = await parseBody<{ events?: unknown }>(req);
    } catch {
      send(res, 400, { success: false, error: 'Invalid JSON body' });
      return true;
    }
    if (!Array.isArray(body.events)) {
      send(res, 400, { success: false, error: 'events array is required' });
      return true;
    }

    const result = await trackExperimentEvents(body.events, {
      allowedExperimentIds: TRACKABLE_IDS,
    });
    send(res, result.failed > 0 ? 500 : 200, {
      success: result.failed === 0,
      received: body.events.length,
      ...result,
    });
    return true;
  }

  return false;
}
