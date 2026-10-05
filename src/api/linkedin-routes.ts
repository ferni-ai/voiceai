/**
 * LinkedIn Personal Profile Routes
 *
 * OAuth flow for connecting LinkedIn for personal career insights.
 * This is separate from marketing-routes.ts which handles content posting.
 *
 * Connecting starts at POST /auth/oauth/start (Bearer token), which binds a
 * single-use state to the verified caller and this browser and returns
 * /api/linkedin/connect?state=…. A page navigation can't carry the token, so
 * /connect accepts only that state, and the callback links LinkedIn to the uid
 * in the state record it consumes, never to an id from the URL.
 *
 * @module api/linkedin-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { consumeOAuthLinkState, peekOAuthLinkState } from '../servers/token/oauth-link-state.js';
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
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';
import { requireAuth } from './auth-middleware.js';
import { isLinkedInEnabled } from '../config/linkedin-flag.js';
import { handleLinkedInUnavailable } from './linkedin-unavailable.js';

const log = createLogger({ module: 'api:linkedin' });

export const LINKEDIN_PROVIDER = 'linkedin';
export const LINKEDIN_CONNECT_PATH = '/api/linkedin/connect';

/** Both LinkedIn app credentials are needed to finish a connect. */
export function isLinkedInConfigured(): boolean {
  return !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET;
}

/** Must be identical in the authorize request and the code exchange. */
function callbackUrl(req: IncomingMessage): string {
  const host = req.headers.host || 'app.ferni.ai';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/api/linkedin/callback`;
}

function redirect(res: ServerResponse, location: string): true {
  res.writeHead(302, { Location: location });
  res.end();
  return true;
}

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
    // LinkedIn switched off (config/linkedin-flag.ts): never reach LinkedIn.
    if (!isLinkedInEnabled()) {
      return await handleLinkedInUnavailable(req, res, pathname, method);
    }

    // ========================================================================
    // GET /api/linkedin/connect?state=X - go on to LinkedIn
    // X comes from POST /auth/oauth/start; nothing else starts a connect.
    // ========================================================================
    if (pathname === LINKEDIN_CONNECT_PATH && method === 'GET') {
      if (!isLinkedInConfigured()) {
        log.warn('LinkedIn connect requested but LINKEDIN_CLIENT_ID/SECRET are not set');
        return redirect(res, '/settings?linkedin=unavailable');
      }
      const state = query.get('state');
      const record = await peekOAuthLinkState(state, LINKEDIN_PROVIDER);
      if (!state || !record) {
        const connect = { method: 'POST', url: '/auth/oauth/start', provider: LINKEDIN_PROVIDER };
        sendJSON(res, { error: 'Sign in required', connect }, 401);
        return true;
      }
      log.info({ userId: record.uid }, 'LinkedIn connect: redirecting to LinkedIn');
      return redirect(res, getLinkedInAuthUrl(callbackUrl(req), state));
    }

    // ========================================================================
    // GET /api/linkedin/callback - OAuth callback (from LinkedIn)
    // ========================================================================
    if (pathname === '/api/linkedin/callback' && method === 'GET') {
      const code = query.get('code');
      const error = query.get('error');
      // Consumed first, so a denied or failed return still burns the state.
      const record = await consumeOAuthLinkState(req, query.get('state'), LINKEDIN_PROVIDER);

      if (error) {
        log.warn({ error }, 'LinkedIn OAuth denied by user');
        return redirect(res, '/settings?linkedin=denied');
      }
      if (!code || !record) {
        log.warn({ hasCode: !!code }, 'LinkedIn callback without a code or a valid state');
        return redirect(res, '/settings?linkedin=error');
      }

      // The Ferni user comes only from the consumed state record.
      const userId = record.uid;
      const tokens = await exchangeLinkedInCode(code, callbackUrl(req));
      if (!tokens) {
        log.error({ userId }, 'Failed to exchange LinkedIn code for tokens');
        return redirect(res, '/settings?linkedin=error');
      }

      // connectLinkedIn stores the tokens and runs the first profile sync.
      const connected = await connectLinkedIn(
        userId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        tokens.scope
      );
      if (!connected) {
        log.error({ userId }, 'Failed to store LinkedIn connection');
        return redirect(res, '/settings?linkedin=error');
      }

      log.info({ userId }, 'LinkedIn connected');
      return redirect(res, '/settings?linkedin=connected');
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
