/**
 * Wearable Integration API Routes
 *
 * API endpoints for health and fitness wearable integrations:
 * - GET /api/wearable/status - Get connection status for all providers
 * - POST /api/wearable/connect - Initiate connection to a provider
 * - POST /api/wearable/callback - OAuth callback handler
 * - POST /api/wearable/disconnect - Disconnect a provider
 * - GET /api/wearable/data - Get aggregated health data
 * - GET /api/wearable/stress - Get stress indicators
 * - GET /api/wearable/sleep - Get sleep analysis
 * - GET /api/wearable/activity - Get activity summary
 * - GET /api/wearable/coaching-context - Get context for coaching
 * - POST /api/wearable/sync - Trigger data sync
 *
 * @module WearableRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';

import {
  getWearableIntegration,
  removeWearableIntegration,
} from '../../services/wearable-integration/index.js';
import type {
  WearableConfig,
  WearableProvider,
} from '../../services/wearable-integration/types.js';
import { parseBody, requireUserId, sendError, sendJSON, sendJSONCached } from '../helpers.js';

const VALID_PROVIDERS: WearableProvider[] = ['apple_health', 'fitbit', 'garmin', 'oura', 'whoop'];

/**
 * Handle wearable integration routes
 */
export async function handleWearableRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/wearable/* routes
  if (!pathname.startsWith('/api/wearable')) {
    return false;
  }

  const method = req.method?.toUpperCase();
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;

  try {
    // GET /api/wearable/status
    if (pathname === '/api/wearable/status' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const connectionStatus = service.getConnectionStatus();
      const config = service.getConfig();

      const status: Record<string, string> = {};
      for (const [provider, state] of connectionStatus) {
        status[provider] = state;
      }

      sendJSON(res, {
        success: true,
        status,
        enabledProviders: config.enabledProviders,
        config: {
          syncIntervalMinutes: config.syncIntervalMinutes,
          enableStressDetection: config.enableStressDetection,
          enableSleepAnalysis: config.enableSleepAnalysis,
          enableActivityTracking: config.enableActivityTracking,
          privacyMode: config.privacyMode,
        },
      });
      return true;
    }

    // POST /api/wearable/connect
    if (pathname === '/api/wearable/connect' && method === 'POST') {
      const body = (await parseBody(req)) as { provider: WearableProvider };

      if (!body.provider) {
        sendError(res, 'provider is required', 400);
        return true;
      }

      if (!VALID_PROVIDERS.includes(body.provider)) {
        sendError(res, `Invalid provider. Valid providers: ${VALID_PROVIDERS.join(', ')}`, 400);
        return true;
      }

      const service = getWearableIntegration(userId);
      const result = await service.connectProvider(body.provider);

      sendJSON(res, {
        success: result.success,
        authUrl: result.authUrl,
        error: result.error,
      });
      return true;
    }

    // POST /api/wearable/callback
    if (pathname === '/api/wearable/callback' && method === 'POST') {
      const body = (await parseBody(req)) as { provider: WearableProvider; code: string };

      if (!body.provider || !body.code) {
        sendError(res, 'provider and code are required', 400);
        return true;
      }

      const service = getWearableIntegration(userId);
      const result = await service.completeConnection(body.provider, body.code);

      sendJSON(res, {
        success: result.success,
        error: result.error,
      });
      return true;
    }

    // POST /api/wearable/disconnect
    if (pathname === '/api/wearable/disconnect' && method === 'POST') {
      const body = (await parseBody(req)) as { provider: WearableProvider };

      if (!body.provider) {
        sendError(res, 'provider is required', 400);
        return true;
      }

      const service = getWearableIntegration(userId);
      await service.disconnectProvider(body.provider);

      sendJSON(res, { success: true });
      return true;
    }

    // GET /api/wearable/data
    if (pathname === '/api/wearable/data' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const metrics = service.getAggregatedMetrics();

      sendJSONCached(
        res,
        {
          success: true,
          hasData: metrics !== null,
          metrics,
        },
        60 // Cache for 1 minute
      );
      return true;
    }

    // GET /api/wearable/stress
    if (pathname === '/api/wearable/stress' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const stress = service.detectStressIndicators();

      sendJSON(res, {
        success: true,
        hasData: stress !== null,
        stress,
      });
      return true;
    }

    // GET /api/wearable/sleep
    if (pathname === '/api/wearable/sleep' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const sleep = service.getSleepAnalysis();

      sendJSONCached(
        res,
        {
          success: true,
          hasData: sleep !== null,
          sleep,
        },
        300 // Cache for 5 minutes
      );
      return true;
    }

    // GET /api/wearable/activity
    if (pathname === '/api/wearable/activity' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const activity = service.getActivitySummary();

      sendJSONCached(
        res,
        {
          success: true,
          hasData: activity !== null,
          activity,
        },
        60 // Cache for 1 minute
      );
      return true;
    }

    // GET /api/wearable/coaching-context
    if (pathname === '/api/wearable/coaching-context' && method === 'GET') {
      const service = getWearableIntegration(userId);
      const context = service.getCoachingContext();

      sendJSON(res, {
        success: true,
        context,
      });
      return true;
    }

    // POST /api/wearable/sync
    if (pathname === '/api/wearable/sync' && method === 'POST') {
      const body = (await parseBody(req)) as { provider?: WearableProvider };
      const service = getWearableIntegration(userId);

      if (body.provider) {
        const data = await service.syncProvider(body.provider);
        sendJSON(res, {
          success: data !== null,
          synced: body.provider,
        });
      } else {
        const results = await service.syncAll();
        sendJSON(res, {
          success: true,
          syncedProviders: Array.from(results.keys()),
        });
      }
      return true;
    }

    // POST /api/wearable/config
    if (pathname === '/api/wearable/config' && method === 'POST') {
      const body = (await parseBody(req)) as Partial<WearableConfig>;
      const service = getWearableIntegration(userId);
      service.updateConfig(body);

      sendJSON(res, {
        success: true,
        config: service.getConfig(),
      });
      return true;
    }

    // DELETE /api/wearable
    if (pathname === '/api/wearable' && method === 'DELETE') {
      removeWearableIntegration(userId);

      sendJSON(res, { success: true });
      return true;
    }

    // Route not handled by this module
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, errorMessage, 500);
    return true;
  }
}
