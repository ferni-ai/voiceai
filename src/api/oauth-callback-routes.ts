/**
 * OAuth Callback Routes
 *
 * API endpoints for OAuth authentication flows:
 * - GET /api/oauth/:provider/authorize - Start OAuth flow
 * - GET /api/oauth/:provider/callback - Handle callback
 * - GET /api/oauth/:provider/status - Check connection status
 * - POST /api/oauth/:provider/disconnect - Revoke connection
 * - GET /api/oauth/connections - List all connections
 * - GET /api/oauth/available - List available integrations
 *
 * @module api/oauth-callback-routes
 */

import type { Request, Response, Router } from 'express';
import { createLogger } from '../utils/safe-logger.js';
import { getOAuthManager } from '../services/integrations/oauth-manager.js';

const log = createLogger({ module: 'oauth-routes' });

/**
 * Register OAuth routes on an Express router
 */
export function registerOAuthRoutes(router: Router): void {
  const oauthManager = getOAuthManager();

  // ==========================================================================
  // GET /api/oauth/:provider/authorize - Start OAuth flow
  // ==========================================================================
  router.get('/api/oauth/:provider/authorize', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const userId = req.query.userId as string;
      const redirectPath = req.query.redirect as string | undefined;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId query parameter' });
        return;
      }

      const authUrl = oauthManager.getAuthorizationUrl(userId, provider, redirectPath);
      log.info({ provider, userId }, 'OAuth authorization started');

      // Redirect user to provider's authorization page
      res.redirect(authUrl);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to start OAuth flow');
      res.status(500).json({ error: 'Failed to start OAuth flow', details: String(error) });
    }
  });

  // ==========================================================================
  // GET /api/oauth/:provider/callback - Handle OAuth callback
  // ==========================================================================
  router.get('/api/oauth/:provider/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError, error_description } = req.query;

      // Handle OAuth errors from provider
      if (oauthError) {
        log.warn({ error: oauthError, description: error_description }, 'OAuth provider error');
        res.redirect(
          `/settings/integrations?error=${encodeURIComponent(String(error_description || oauthError))}`
        );
        return;
      }

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameter' });
        return;
      }

      const result = await oauthManager.handleCallback(String(code), String(state));

      if (!result.success) {
        log.warn({ error: result.error }, 'OAuth callback failed');
        res.redirect(
          `/settings/integrations?error=${encodeURIComponent(result.error || 'Unknown error')}`
        );
        return;
      }

      log.info(
        { provider: result.integrationId, userId: result.userId },
        'OAuth callback successful'
      );

      // Redirect to success page or custom redirect path
      const redirectTo =
        result.redirectPath || `/settings/integrations?connected=${result.integrationId}`;
      res.redirect(redirectTo);
    } catch (error) {
      log.error({ error: String(error) }, 'OAuth callback error');
      res.redirect(`/settings/integrations?error=${encodeURIComponent('Connection failed')}`);
    }
  });

  // ==========================================================================
  // GET /api/oauth/:provider/status - Check connection status
  // ==========================================================================
  router.get('/api/oauth/:provider/status', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId query parameter' });
        return;
      }

      const status = await oauthManager.getStatus(userId, provider);
      res.json(status);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get connection status');
      res.status(500).json({ error: 'Failed to get connection status' });
    }
  });

  // ==========================================================================
  // POST /api/oauth/:provider/disconnect - Revoke connection
  // ==========================================================================
  router.post('/api/oauth/:provider/disconnect', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId in request body' });
        return;
      }

      const success = await oauthManager.disconnect(userId, provider);

      if (success) {
        log.info({ provider, userId }, 'Integration disconnected');
        res.json({ success: true, message: `${provider} disconnected` });
      } else {
        res.status(500).json({ success: false, error: 'Failed to disconnect' });
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to disconnect integration');
      res.status(500).json({ error: 'Failed to disconnect integration' });
    }
  });

  // ==========================================================================
  // GET /api/oauth/connections - List all connections for a user
  // ==========================================================================
  router.get('/api/oauth/connections', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId query parameter' });
        return;
      }

      const connections = await oauthManager.getConnections(userId);
      res.json({ connections });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get connections');
      res.status(500).json({ error: 'Failed to get connections' });
    }
  });

  // ==========================================================================
  // GET /api/oauth/available - List available integrations
  // ==========================================================================
  router.get('/api/oauth/available', async (_req: Request, res: Response) => {
    try {
      const integrations = oauthManager.getAvailableIntegrations();
      res.json({ integrations });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get available integrations');
      res.status(500).json({ error: 'Failed to get available integrations' });
    }
  });

  // ==========================================================================
  // POST /api/oauth/:provider/refresh - Force token refresh
  // ==========================================================================
  router.post('/api/oauth/:provider/refresh', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId in request body' });
        return;
      }

      // This will automatically refresh if needed
      const tokens = await oauthManager.getValidTokens(userId, provider);

      if (tokens) {
        res.json({
          success: true,
          expiresAt: tokens.expiresAt.toISOString(),
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Token refresh failed. User may need to reconnect.',
        });
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to refresh tokens');
      res.status(500).json({ error: 'Failed to refresh tokens' });
    }
  });

  log.info('OAuth routes registered');
}

/**
 * Middleware to get valid OAuth tokens for an integration
 * Attaches tokens to req.oauthTokens if available
 */
export function requireOAuthTokens(integrationId: string) {
  return async (req: Request, res: Response, next: () => void) => {
    const userId = (req.query.userId as string) || (req.body as { userId?: string })?.userId;

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const oauthManager = getOAuthManager();
    const tokens = await oauthManager.getValidTokens(userId, integrationId);

    if (!tokens) {
      res.status(401).json({
        error: 'Integration not connected',
        integrationId,
        connectUrl: `/api/oauth/${integrationId}/authorize?userId=${userId}`,
      });
      return;
    }

    // Attach tokens to request for downstream handlers
    (req as Request & { oauthTokens?: { accessToken: string; expiresAt: Date } }).oauthTokens = {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };

    next();
  };
}
