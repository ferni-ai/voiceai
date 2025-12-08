/**
 * Feature Flags API Routes
 *
 * Admin API for managing feature flags.
 * Requires admin authentication.
 *
 * @module FeatureFlagsRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';

import {
  isEnabled,
  getFlag,
  getAllFlags,
  setFlag,
  setUserOverride,
  removeUserOverride,
  enableFlag,
  disableFlag,
  setRolloutPercentage,
  enableAllTrustFlags,
  disableAllTrustFlags,
  resetToDefaults,
  refreshFlags,
  TRUST_FLAGS,
  type TrustFlagId,
} from '../services/feature-flags.js';

const log = createLogger({ module: 'FeatureFlagsRoutes' });

// ============================================================================
// UTILITIES
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isAdmin(req: IncomingMessage): boolean {
  // Check for admin key or dev mode
  const adminKey = req.headers['x-admin-key'] as string;
  return adminKey === process.env.ADMIN_KEY || adminKey === 'dev-mode';
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleFeatureFlagsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;

  // Admin check for write operations
  if (method !== 'GET' && !isAdmin(req)) {
    sendJson(res, 403, { error: 'Admin access required' });
    return true;
  }

  try {
    // ========================================================================
    // LIST ALL FLAGS
    // ========================================================================

    if (pathname === '/api/flags' && method === 'GET') {
      const flags = getAllFlags();
      sendJson(res, 200, { flags });
      return true;
    }

    // ========================================================================
    // CHECK SPECIFIC FLAG
    // ========================================================================

    if (pathname.match(/^\/api\/flags\/[^/]+$/) && method === 'GET') {
      const flagId = pathname.split('/').pop() as TrustFlagId;

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      const userId = query.get('userId') || undefined;
      const config = getFlag(flagId);
      const enabled = isEnabled(flagId, userId);

      sendJson(res, 200, {
        flagId,
        ...config,
        enabledForUser: enabled,
        description: TRUST_FLAGS[flagId],
      });
      return true;
    }

    // ========================================================================
    // UPDATE FLAG
    // ========================================================================

    if (pathname.match(/^\/api\/flags\/[^/]+$/) && method === 'PUT') {
      const flagId = pathname.split('/').pop() as TrustFlagId;

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      const body = await parseBody(req);

      await setFlag(flagId, {
        enabled: body.enabled as boolean | undefined,
        percentage: body.percentage as number | undefined,
      });

      const updated = getFlag(flagId);
      sendJson(res, 200, { flagId, ...updated, updated: true });
      return true;
    }

    // ========================================================================
    // SET USER OVERRIDE
    // ========================================================================

    if (pathname === '/api/flags/override' && method === 'POST') {
      const body = await parseBody(req);
      const { flagId, userId, enabled } = body as {
        flagId: TrustFlagId;
        userId: string;
        enabled: boolean;
      };

      if (!flagId || !userId || enabled === undefined) {
        sendJson(res, 400, { error: 'flagId, userId, and enabled required' });
        return true;
      }

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      await setUserOverride(flagId, userId, enabled);
      sendJson(res, 200, { flagId, userId, enabled, overrideSet: true });
      return true;
    }

    // ========================================================================
    // REMOVE USER OVERRIDE
    // ========================================================================

    if (pathname === '/api/flags/override' && method === 'DELETE') {
      const body = await parseBody(req);
      const { flagId, userId } = body as { flagId: TrustFlagId; userId: string };

      if (!flagId || !userId) {
        sendJson(res, 400, { error: 'flagId and userId required' });
        return true;
      }

      await removeUserOverride(flagId, userId);
      sendJson(res, 200, { flagId, userId, overrideRemoved: true });
      return true;
    }

    // ========================================================================
    // SET ROLLOUT PERCENTAGE
    // ========================================================================

    if (pathname.match(/^\/api\/flags\/[^/]+\/rollout$/) && method === 'PUT') {
      const parts = pathname.split('/');
      const flagId = parts[parts.length - 2] as TrustFlagId;

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      const body = await parseBody(req);
      const percentage = body.percentage as number;

      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        sendJson(res, 400, { error: 'percentage must be 0-100' });
        return true;
      }

      await setRolloutPercentage(flagId, percentage);
      sendJson(res, 200, { flagId, percentage, updated: true });
      return true;
    }

    // ========================================================================
    // ENABLE FLAG
    // ========================================================================

    if (pathname.match(/^\/api\/flags\/[^/]+\/enable$/) && method === 'POST') {
      const parts = pathname.split('/');
      const flagId = parts[parts.length - 2] as TrustFlagId;

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      await enableFlag(flagId);
      sendJson(res, 200, { flagId, enabled: true });
      return true;
    }

    // ========================================================================
    // DISABLE FLAG (KILL SWITCH)
    // ========================================================================

    if (pathname.match(/^\/api\/flags\/[^/]+\/disable$/) && method === 'POST') {
      const parts = pathname.split('/');
      const flagId = parts[parts.length - 2] as TrustFlagId;

      if (!TRUST_FLAGS[flagId]) {
        sendJson(res, 404, { error: 'Flag not found' });
        return true;
      }

      await disableFlag(flagId);
      log.warn({ flagId }, '⚠️ Flag disabled via API');
      sendJson(res, 200, { flagId, disabled: true, warning: 'Kill switch activated' });
      return true;
    }

    // ========================================================================
    // BULK OPERATIONS
    // ========================================================================

    if (pathname === '/api/flags/enable-all' && method === 'POST') {
      await enableAllTrustFlags();
      sendJson(res, 200, { allEnabled: true });
      return true;
    }

    if (pathname === '/api/flags/disable-all' && method === 'POST') {
      await disableAllTrustFlags();
      log.warn('⚠️ ALL FLAGS DISABLED via API');
      sendJson(res, 200, { allDisabled: true, warning: 'All kill switches activated' });
      return true;
    }

    if (pathname === '/api/flags/reset' && method === 'POST') {
      await resetToDefaults();
      sendJson(res, 200, { reset: true });
      return true;
    }

    if (pathname === '/api/flags/refresh' && method === 'POST') {
      await refreshFlags();
      sendJson(res, 200, { refreshed: true });
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Feature flags route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleFeatureFlagsRoutes,
};
