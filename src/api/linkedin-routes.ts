/**
 * LinkedIn Personal Profile Routes
 *
 * OAuth flow for connecting LinkedIn for personal career insights.
 * This is separate from marketing-routes.ts which handles content posting.
 *
 * "Better than Human" - remember work anniversaries and career transitions.
 *
 * @module api/linkedin-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  getLinkedInAuthUrl,
  exchangeLinkedInCode,
  connectLinkedIn,
  disconnectLinkedIn,
  hasLinkedInConnected,
  getLinkedInProfile,
  getUpcomingMilestones,
  syncLinkedInData,
} from '../services/linkedin/index.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from './helpers.js';
import { requireAuth } from './auth-middleware.js';

const log = createLogger({ module: 'api:linkedin' });

// OAuth state storage (in production, use Redis with TTL)
const oauthStates = new Map<string, { userId: string; timestamp: number }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

/**
 * Handle LinkedIn personal profile routes
 */
export async function handleLinkedInRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/linkedin')) {
    return false;
  }

  const query = parsedUrl.searchParams;

  // Handle CORS
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';

  try {
    // ========================================================================
    // GET /api/linkedin/connect - Start OAuth flow
    // ========================================================================
    if (pathname === '/api/linkedin/connect' && method === 'GET') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      // Generate state token for CSRF protection
      const state = `lkdn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      oauthStates.set(state, { userId: auth.userId, timestamp: Date.now() });

      // Build callback URL
      const host = req.headers.host || 'app.ferni.ai';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${host}/api/linkedin/callback`;

      const authUrl = getLinkedInAuthUrl(redirectUri, state);

      // Redirect to LinkedIn authorization page
      res.writeHead(302, { Location: authUrl });
      res.end();
      return true;
    }

    // ========================================================================
    // GET /api/linkedin/callback - OAuth callback (from LinkedIn)
    // ========================================================================
    if (pathname === '/api/linkedin/callback' && method === 'GET') {
      const code = query.get('code');
      const state = query.get('state');
      const error = query.get('error');

      // Handle user denial or errors
      if (error) {
        log.warn({ error }, 'LinkedIn OAuth denied by user');
        res.writeHead(302, { Location: '/settings?linkedin=denied' });
        res.end();
        return true;
      }

      if (!code || !state) {
        log.warn('Missing code or state in LinkedIn callback');
        res.writeHead(302, { Location: '/settings?linkedin=error' });
        res.end();
        return true;
      }

      // Validate state token
      const savedState = oauthStates.get(state);
      if (!savedState) {
        log.warn({ state }, 'Invalid or expired state token');
        res.writeHead(302, { Location: '/settings?linkedin=error' });
        res.end();
        return true;
      }

      oauthStates.delete(state);
      const { userId } = savedState;

      // Build redirect URI (must match what was used in /connect)
      const host = req.headers.host || 'app.ferni.ai';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${host}/api/linkedin/callback`;

      // Exchange code for tokens
      const tokens = await exchangeLinkedInCode(code, redirectUri);
      if (!tokens) {
        log.error({ userId }, 'Failed to exchange LinkedIn code for tokens');
        res.writeHead(302, { Location: '/settings?linkedin=error' });
        res.end();
        return true;
      }

      // Store connection
      const connected = await connectLinkedIn(
        userId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        tokens.scope
      );

      if (!connected) {
        log.error({ userId }, 'Failed to store LinkedIn connection');
        res.writeHead(302, { Location: '/settings?linkedin=error' });
        res.end();
        return true;
      }

      log.info({ userId }, '✅ LinkedIn connected successfully');

      // Trigger background sync of profile data
      void syncLinkedInData(userId);

      // Redirect back to settings with success
      res.writeHead(302, { Location: '/settings?linkedin=connected' });
      res.end();
      return true;
    }

    // ========================================================================
    // POST /api/linkedin/disconnect - Disconnect LinkedIn
    // ========================================================================
    if (pathname === '/api/linkedin/disconnect' && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      void disconnectLinkedIn(auth.userId);

      log.info({ userId: auth.userId }, 'LinkedIn disconnected');
      sendJSON(res, { success: true, message: 'LinkedIn disconnected' });
      return true;
    }

    // ========================================================================
    // GET /api/linkedin/status - Get connection status
    // ========================================================================
    if (pathname === '/api/linkedin/status' && method === 'GET') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const connected = hasLinkedInConnected(auth.userId);
      const profile = connected ? getLinkedInProfile(auth.userId) : null;
      const milestones = connected ? getUpcomingMilestones(auth.userId) : [];

      sendJSON(res, {
        connected,
        profile: profile
          ? {
              firstName: profile.firstName,
              lastName: profile.lastName,
              headline: profile.headline,
              profilePicture: profile.profilePicture,
            }
          : null,
        upcomingMilestones: milestones.slice(0, 3).map((m) => ({
          type: m.type,
          title: m.title,
          description: m.description,
          date: m.date.toISOString(),
        })),
      });
      return true;
    }

    // ========================================================================
    // POST /api/linkedin/sync - Force sync LinkedIn data
    // ========================================================================
    if (pathname === '/api/linkedin/sync' && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      if (!hasLinkedInConnected(auth.userId)) {
        sendError(res, 'LinkedIn not connected', 400);
        return true;
      }

      // Trigger sync in background
      void syncLinkedInData(auth.userId);

      sendJSON(res, { success: true, message: 'Sync started' });
      return true;
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err), pathname }, 'LinkedIn route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
