/**
 * Integrations Handler (Native HTTP)
 *
 * Handler wrapper for integrations routes that works with the native HTTP server.
 * Converts the Express Router pattern to the native handler pattern.
 *
 * @module api/v1/integrations/handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  syncBiometrics,
  getCurrentBiometrics,
  hasBiometricsConnected,
  hasBiometricsConnectedAsync,
  getConnectedPlatform,
  getConnectedPlatformAsync,
  disconnectBiometrics,
  type BiometricPlatform,
} from '../../../services/biometrics/index.js';

const log = createLogger({ module: 'IntegrationsHandler' });

// Base path for integrations routes
const BASE_PATH = '/api/v1/integrations';

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
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

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send redirect response
 */
function sendRedirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
}

/**
 * Handle all integrations routes
 * @returns true if the request was handled
 */
export async function handleIntegrationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/v1/integrations routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  log.debug({ pathname, method, subPath }, 'Integrations request');

  try {
    // =========================================================================
    // GET /api/v1/integrations/status - All integrations status
    // =========================================================================
    if (subPath === '/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      // Get status from all integration services
      const { hasCalendarConnected } = await import(
        '../../../services/context-awareness/location-calendar.js'
      );
      const { hasLinkedAccounts } = await import('../../../tools/plaid.js');
      const { getImportantPeople } = await import('../../../services/social-graph/index.js');

      // Use async version to check persistence
      const biometricsConnected = await hasBiometricsConnectedAsync(userId);
      const calendarConnected = hasCalendarConnected(userId);
      const bankConnected = hasLinkedAccounts(userId);
      const socialPeople = getImportantPeople(userId);

      sendJson(res, 200, {
        userId,
        integrations: {
          biometrics: {
            connected: biometricsConnected,
            platform: biometricsConnected ? await getConnectedPlatformAsync(userId) : null,
          },
          calendar: { connected: calendarConnected },
          banking: { connected: bankConnected },
          socialGraph: {
            enabled: true,
            peopleTracked: socialPeople.length,
          },
        },
        capabilities: {
          stressAwareness: biometricsConnected,
          sleepAwareness: biometricsConnected,
          eventAnticipation: calendarConnected,
          locationAwareness: calendarConnected,
          financialPrediction: bankConnected,
          relationshipInsights: socialPeople.length > 0,
        },
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/integrations/biometrics/status
    // =========================================================================
    if (subPath === '/biometrics/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      // Use async version to check persistence
      const connected = await hasBiometricsConnectedAsync(userId);
      const platform = await getConnectedPlatformAsync(userId);
      const snapshot = connected ? getCurrentBiometrics(userId) : null;

      sendJson(res, 200, {
        connected,
        platform,
        lastSync: snapshot?.timestamp || null,
        stressLevel: snapshot?.stressLevel || null,
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/integrations/biometrics/connect/:platform
    // =========================================================================
    if (subPath.startsWith('/biometrics/connect/') && method === 'GET') {
      const platform = subPath.replace('/biometrics/connect/', '') as BiometricPlatform;
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      // Note: 'terra' is recommended for web apps - aggregates Apple Health + 300 other wearables
      const validPlatforms: BiometricPlatform[] = ['healthkit', 'googlefit', 'oura', 'whoop', 'fitbit', 'terra'];
      if (!validPlatforms.includes(platform)) {
        sendJson(res, 400, {
          error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        });
        return true;
      }

      const authUrl = getAuthorizationUrl(platform, userId);
      log.info({ userId, platform }, 'Generated biometrics auth URL');

      sendJson(res, 200, { authUrl, platform });
      return true;
    }

    // =========================================================================
    // GET /api/v1/integrations/biometrics/callback/:platform
    // =========================================================================
    if (subPath.startsWith('/biometrics/callback/') && method === 'GET') {
      const platform = subPath.replace('/biometrics/callback/', '') as BiometricPlatform;
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        log.warn({ platform, error }, 'OAuth error from provider');
        sendRedirect(res, `/settings/integrations?error=${encodeURIComponent(error)}`);
        return true;
      }

      if (!code || !state) {
        sendJson(res, 400, { error: 'Missing code or state parameter' });
        return true;
      }

      // Decode state to get userId
      let userId: string;
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = decoded.userId;
      } catch {
        sendJson(res, 400, { error: 'Invalid state parameter' });
        return true;
      }

      // Exchange code for tokens
      const success = await exchangeCodeForTokens(platform, code, userId);

      if (success) {
        // Trigger initial sync
        void syncBiometrics(userId);
        log.info({ userId, platform }, 'Biometrics connected successfully');
        sendRedirect(res, `/settings/integrations?success=biometrics&platform=${platform}`);
      } else {
        sendRedirect(res, '/settings/integrations?error=token_exchange_failed');
      }
      return true;
    }

    // =========================================================================
    // POST /api/v1/integrations/biometrics/sync
    // =========================================================================
    if (subPath === '/biometrics/sync' && method === 'POST') {
      const body = await parseBody(req);
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      if (!(await hasBiometricsConnectedAsync(userId))) {
        sendJson(res, 400, { error: 'No biometrics connected' });
        return true;
      }

      const snapshot = await syncBiometrics(userId);

      if (snapshot) {
        sendJson(res, 200, {
          success: true,
          timestamp: snapshot.timestamp,
          data: {
            stressLevel: snapshot.stressLevel,
            sleep: snapshot.sleep,
            hrv: snapshot.hrv,
            recovery: snapshot.recovery,
            activity: snapshot.activity,
          },
        });
      } else {
        sendJson(res, 500, { error: 'Sync failed' });
      }
      return true;
    }

    // =========================================================================
    // GET /api/v1/integrations/biometrics/data
    // =========================================================================
    if (subPath === '/biometrics/data' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const snapshot = getCurrentBiometrics(userId);

      if (snapshot) {
        sendJson(res, 200, snapshot);
      } else {
        sendJson(res, 404, { error: 'No biometrics data available' });
      }
      return true;
    }

    // =========================================================================
    // DELETE /api/v1/integrations/biometrics/disconnect
    // =========================================================================
    if (subPath === '/biometrics/disconnect' && method === 'DELETE') {
      const body = await parseBody(req);
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      disconnectBiometrics(userId);
      log.info({ userId }, 'Biometrics disconnected');

      sendJson(res, 200, { success: true });
      return true;
    }

    // Route not matched within integrations
    return false;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Integrations handler error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default { handleIntegrationsRoutes };
