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
import { parseBody, sendJSON } from './helpers.js';

import {
  disableAllTrustFlags,
  disableFlag,
  enableAllTrustFlags,
  enableFlag,
  getAllFlags,
  getFlag,
  isEnabled,
  refreshFlags,
  removeUserOverride,
  resetToDefaults,
  setFlag,
  setRolloutPercentage,
  setUserOverride,
  TRUST_FLAGS,
  type TrustFlagId,
} from '../services/deployment/feature-flags.js';

const log = createLogger({ module: 'FeatureFlagsRoutes' });

// ============================================================================
// UTILITIES
// ============================================================================

// parseBody and sendJSON imported from './helpers.js'

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

function isAdmin(req: IncomingMessage): boolean {
  // SECURITY: Admin access ALWAYS requires a configured ADMIN_KEY
  // The hardcoded 'dev-mode' backdoor has been removed for security
  const adminKey = req.headers['x-admin-key'] as string;
  const configuredAdminKey = process.env.ADMIN_KEY;

  // SECURITY: Explicitly check for production - fail closed if NODE_ENV is unset
  const isProduction = process.env.NODE_ENV === 'production';

  if (!configuredAdminKey) {
    // No ADMIN_KEY configured - block admin access entirely
    if (!isProduction) {
      log.warn('ADMIN_KEY not configured - admin access blocked. Set ADMIN_KEY env var.');
    }
    return false;
  }

  // SECURITY: Use timing-safe comparison to prevent timing attacks
  if (!adminKey || adminKey.length !== configuredAdminKey.length) {
    return false;
  }

  // Simple constant-time comparison
  let result = 0;
  for (let i = 0; i < adminKey.length; i++) {
    result |= adminKey.charCodeAt(i) ^ configuredAdminKey.charCodeAt(i);
  }
  return result === 0;
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

      const body = await parseBody<Record<string, unknown>>(req);

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

      const body = await parseBody<Record<string, unknown>>(req);
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
