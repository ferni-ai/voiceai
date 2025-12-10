/**
 * Unified Feature Flags API Routes (v1)
 *
 * Consolidated API for managing all feature flags.
 * Combines general CRUD operations with trust-specific bulk operations.
 *
 * Routes:
 * - GET    /api/v1/admin/flags              - List all flags
 * - GET    /api/v1/admin/flags/categories   - List categories
 * - GET    /api/v1/admin/flags/:id          - Get specific flag
 * - POST   /api/v1/admin/flags              - Create new flag
 * - PUT    /api/v1/admin/flags/:id          - Update flag
 * - DELETE /api/v1/admin/flags/:id          - Delete flag
 * - POST   /api/v1/admin/flags/:id/toggle   - Quick toggle
 * - POST   /api/v1/admin/flags/:id/enable   - Enable flag
 * - POST   /api/v1/admin/flags/:id/disable  - Disable flag (kill switch)
 * - PUT    /api/v1/admin/flags/:id/rollout  - Set rollout percentage
 * - POST   /api/v1/admin/flags/override     - Set user override
 * - DELETE /api/v1/admin/flags/override     - Remove user override
 * - POST   /api/v1/admin/flags/enable-all   - Enable all trust flags
 * - POST   /api/v1/admin/flags/disable-all  - Disable all (kill switch)
 * - POST   /api/v1/admin/flags/reset        - Reset to defaults
 * - POST   /api/v1/admin/flags/reload       - Force reload from storage
 *
 * @module AdminFlagsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { getFeatureFlags } from '../../../services/feature-flags.js';
import {
  isEnabled,
  getFlag as getTrustFlag,
  getAllFlags as getAllTrustFlags,
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
} from '../../../services/feature-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, handleCorsPreflightIfNeeded } from '../../helpers.js';
import { requireAuth, requireAdmin, rateLimit } from '../../auth-middleware.js';
import {
  validateBody,
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
} from '../../validators.js';

const log = createLogger({ module: 'AdminFlagsAPI' });

// Base path for these routes
const BASE_PATH = '/api/v1/admin/flags';

/**
 * Handle all feature flag admin routes
 * @returns true if the request was handled
 */
export async function handleAdminFlagsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';
  const query = parsedUrl.searchParams;

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/v1/admin/flags routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All admin routes require admin access (read operations allow dev mode)
  if (method === 'GET') {
    const auth = requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  } else {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
  }

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // BULK OPERATIONS (must come before single flag routes)
    // ========================================================================

    // GET /api/v1/admin/flags - List all flags
    if (subPath === '/' && method === 'GET') {
      const flagsService = getFeatureFlags();
      const allFlags = flagsService.getAllFlags();
      const categories = flagsService.getCategories();
      const trustFlags = getAllTrustFlags();

      sendJSON(res, {
        flags: allFlags,
        trustFlags,
        categories,
        count: allFlags.length,
      });
      return true;
    }

    // GET /api/v1/admin/flags/categories - List categories
    if (subPath === '/categories' && method === 'GET') {
      const flagsService = getFeatureFlags();
      sendJSON(res, { categories: flagsService.getCategories() });
      return true;
    }

    // POST /api/v1/admin/flags - Create new flag
    if (subPath === '/' && method === 'POST') {
      const body = await validateBody(req, res, CreateFeatureFlagSchema);
      if (!body) return true;

      try {
        const flagsService = getFeatureFlags();
        const newFlag = await flagsService.createFlag({
          id: body.id,
          name: body.name,
          description: body.description || '',
          enabled: body.enabled,
          rolloutPercentage: body.percentage,
        });

        sendJSON(res, { success: true, flag: newFlag }, 201);
      } catch (e) {
        sendError(res, (e as Error).message, 400);
      }
      return true;
    }

    // POST /api/v1/admin/flags/reload - Force reload
    if (subPath === '/reload' && method === 'POST') {
      const flagsService = getFeatureFlags();
      void flagsService.reload();
      await refreshFlags();
      sendJSON(res, { success: true, message: 'Flags reloaded' });
      return true;
    }

    // POST /api/v1/admin/flags/enable-all - Enable all trust flags
    if (subPath === '/enable-all' && method === 'POST') {
      await enableAllTrustFlags();
      log.info('All trust flags enabled via API');
      sendJSON(res, { success: true, allEnabled: true });
      return true;
    }

    // POST /api/v1/admin/flags/disable-all - Disable all trust flags (KILL SWITCH)
    if (subPath === '/disable-all' && method === 'POST') {
      await disableAllTrustFlags();
      log.warn('⚠️ ALL TRUST FLAGS DISABLED via API - Kill switch activated');
      sendJSON(res, {
        success: true,
        allDisabled: true,
        warning: 'All kill switches activated',
      });
      return true;
    }

    // POST /api/v1/admin/flags/reset - Reset to defaults
    if (subPath === '/reset' && method === 'POST') {
      await resetToDefaults();
      log.info('Feature flags reset to defaults via API');
      sendJSON(res, { success: true, reset: true });
      return true;
    }

    // POST /api/v1/admin/flags/override - Set user override
    if (subPath === '/override' && method === 'POST') {
      const body = (await parseBody(req)) as {
        flagId: TrustFlagId;
        userId: string;
        enabled: boolean;
      };

      const { flagId, userId, enabled } = body;

      if (!flagId || !userId || enabled === undefined) {
        sendError(res, 'flagId, userId, and enabled are required', 400);
        return true;
      }

      if (!TRUST_FLAGS[flagId]) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      await setUserOverride(flagId, userId, enabled);
      sendJSON(res, { success: true, flagId, userId, enabled, overrideSet: true });
      return true;
    }

    // DELETE /api/v1/admin/flags/override - Remove user override
    if (subPath === '/override' && method === 'DELETE') {
      const body = (await parseBody(req)) as { flagId: TrustFlagId; userId: string };
      const { flagId, userId } = body;

      if (!flagId || !userId) {
        sendError(res, 'flagId and userId are required', 400);
        return true;
      }

      await removeUserOverride(flagId, userId);
      sendJSON(res, { success: true, flagId, userId, overrideRemoved: true });
      return true;
    }

    // ========================================================================
    // SINGLE FLAG OPERATIONS
    // ========================================================================

    // Parse flag ID from path: /api/v1/admin/flags/:flagId[/action]
    const flagIdMatch = subPath.match(/^\/([^/]+)$/);
    const toggleMatch = subPath.match(/^\/([^/]+)\/toggle$/);
    const enableMatch = subPath.match(/^\/([^/]+)\/enable$/);
    const disableMatch = subPath.match(/^\/([^/]+)\/disable$/);
    const rolloutMatch = subPath.match(/^\/([^/]+)\/rollout$/);

    // POST /api/v1/admin/flags/:id/toggle - Quick toggle
    if (toggleMatch && method === 'POST') {
      const flagId = decodeURIComponent(toggleMatch[1]);
      const flagsService = getFeatureFlags();
      const flag = flagsService.getFlag(flagId);

      if (!flag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      const updatedFlag = flagsService.updateFlag(flagId, { enabled: !flag.enabled });
      log.info({ flagId, enabled: !flag.enabled }, 'Flag toggled via API');
      sendJSON(res, { success: true, flag: updatedFlag });
      return true;
    }

    // POST /api/v1/admin/flags/:id/enable - Enable flag
    if (enableMatch && method === 'POST') {
      const flagId = decodeURIComponent(enableMatch[1]) as TrustFlagId;

      // Try trust flags first, then general flags
      if (TRUST_FLAGS[flagId]) {
        await enableFlag(flagId);
      } else {
        const flagsService = getFeatureFlags();
        flagsService.updateFlag(flagId, { enabled: true });
      }

      log.info({ flagId }, 'Flag enabled via API');
      sendJSON(res, { success: true, flagId, enabled: true });
      return true;
    }

    // POST /api/v1/admin/flags/:id/disable - Disable flag (kill switch)
    if (disableMatch && method === 'POST') {
      const flagId = decodeURIComponent(disableMatch[1]) as TrustFlagId;

      // Try trust flags first, then general flags
      if (TRUST_FLAGS[flagId]) {
        await disableFlag(flagId);
      } else {
        const flagsService = getFeatureFlags();
        flagsService.updateFlag(flagId, { enabled: false });
      }

      log.warn({ flagId }, '⚠️ Flag disabled via API - Kill switch activated');
      sendJSON(res, {
        success: true,
        flagId,
        disabled: true,
        warning: 'Kill switch activated',
      });
      return true;
    }

    // PUT /api/v1/admin/flags/:id/rollout - Set rollout percentage
    if (rolloutMatch && method === 'PUT') {
      const flagId = decodeURIComponent(rolloutMatch[1]) as TrustFlagId;
      const body = (await parseBody(req)) as { percentage: number };
      const { percentage } = body;

      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        sendError(res, 'percentage must be a number between 0 and 100', 400);
        return true;
      }

      if (TRUST_FLAGS[flagId]) {
        await setRolloutPercentage(flagId, percentage);
      } else {
        const flagsService = getFeatureFlags();
        flagsService.updateFlag(flagId, { rolloutPercentage: percentage });
      }

      log.info({ flagId, percentage }, 'Flag rollout percentage updated via API');
      sendJSON(res, { success: true, flagId, percentage });
      return true;
    }

    // GET /api/v1/admin/flags/:id - Get specific flag
    if (flagIdMatch && method === 'GET') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const userId = query.get('userId') || undefined;

      // Check trust flags first
      if (TRUST_FLAGS[flagId as TrustFlagId]) {
        const config = getTrustFlag(flagId as TrustFlagId);
        const enabled = isEnabled(flagId as TrustFlagId, userId);

        sendJSON(res, {
          flagId,
          ...config,
          enabledForUser: enabled,
          description: TRUST_FLAGS[flagId as TrustFlagId],
          type: 'trust',
        });
        return true;
      }

      // Try general flags
      const flagsService = getFeatureFlags();
      const flag = flagsService.getFlag(flagId);

      if (!flag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      sendJSON(res, { flag, type: 'general' });
      return true;
    }

    // PUT /api/v1/admin/flags/:id - Update flag
    if (flagIdMatch && method === 'PUT') {
      const flagId = decodeURIComponent(flagIdMatch[1]);

      // Check trust flags first
      if (TRUST_FLAGS[flagId as TrustFlagId]) {
        const body = (await parseBody(req)) as { enabled?: boolean; percentage?: number };
        await setFlag(flagId as TrustFlagId, body);
        const updated = getTrustFlag(flagId as TrustFlagId);
        log.info({ flagId, body }, 'Trust flag updated via API');
        sendJSON(res, { success: true, flagId, ...updated });
        return true;
      }

      // Try general flags
      const body = await validateBody(req, res, UpdateFeatureFlagSchema);
      if (!body) return true;

      const flagsService = getFeatureFlags();
      const existingFlag = flagsService.getFlag(flagId);

      if (!existingFlag) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      await flagsService.updateFlag(flagId, body);
      const updatedFlag = flagsService.getFlag(flagId);
      log.info({ flagId, body }, 'General flag updated via API');
      sendJSON(res, { success: true, flag: updatedFlag });
      return true;
    }

    // DELETE /api/v1/admin/flags/:id - Delete flag
    if (flagIdMatch && method === 'DELETE') {
      const flagId = decodeURIComponent(flagIdMatch[1]);
      const flagsService = getFeatureFlags();
      const deleted = await flagsService.deleteFlag(flagId);

      if (!deleted) {
        sendError(res, `Flag "${flagId}" not found`, 404);
        return true;
      }

      log.info({ flagId }, 'Flag deleted via API');
      sendJSON(res, { success: true, message: `Flag "${flagId}" deleted` });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Admin flags API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

export default { handleAdminFlagsRoutes };
