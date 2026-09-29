/**
 * POST /api/health/sync — daily health summary from the iOS/Android apps.
 *
 * The apps send a computed summary ({ deviceType, summary, timestamp }), which
 * services/health/health-data-store.ts handleHealthSync stores and feeds into
 * health context. (Raw HealthKit samples go to /api/apple-health/sync.)
 * Identity is the verified user; body.userId is never trusted.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { requestUserId } from '../../../api/identity-guard.js';
import { parseRawBody } from '../../../api/helpers.js';
import { handleHealthSync } from '../../../services/health/health-data-store.js';
import type { HealthSyncRequest } from '../../../services/health/types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'HealthSyncRoutes' });

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleHealthSyncRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== '/api/health/sync') return false;
  if (req.method !== 'POST') {
    send(res, 405, { success: false, error: 'Method not allowed' });
    return true;
  }

  const userId = requestUserId(req);
  if (!userId) {
    send(res, 401, { success: false, error: 'Sign in to sync health data' });
    return true;
  }

  let body: Partial<HealthSyncRequest>;
  try {
    body = JSON.parse((await parseRawBody(req, { timeoutMs: 10000, maxBytes: 64 * 1024 })) || '{}');
  } catch {
    send(res, 400, { success: false, error: 'Invalid JSON' });
    return true;
  }
  if (!body.summary || typeof body.summary !== 'object') {
    send(res, 400, { success: false, error: 'summary is required' });
    return true;
  }

  const result = await handleHealthSync({
    userId,
    deviceType: body.deviceType === 'android' ? 'android' : 'ios',
    summary: body.summary,
    timestamp: body.timestamp ?? new Date().toISOString(),
    appVersion: body.appVersion,
  } as HealthSyncRequest);

  if (!result.success) log.warn({ userId, error: result.error }, 'Health sync rejected');
  send(res, result.success ? 200 : 422, result);
  return true;
}
