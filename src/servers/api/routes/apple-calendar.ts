/**
 * Apple Calendar OAuth Routes
 *
 * OAuth flow for Apple Calendar integration using Sign in with Apple.
 *
 * Note: Apple OAuth uses form_post response mode, so the callback
 * receives data in the POST body rather than query params.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { consumeOAuthLinkState, peekOAuthLinkState } from '../../token/oauth-link-state.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { OAUTH_START_PATH } from './oauth-start.js';

const log = createLogger({ module: 'AppleCalendarRoutes' });

const PROVIDER = 'apple_calendar';
const CONNECT = { method: 'POST', url: OAUTH_START_PATH, provider: PROVIDER } as const;

/**
 * Handle Apple Calendar OAuth routes
 */
export async function handleAppleCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Apple Sign In login: only with a state from POST /auth/oauth/start, never a
  // user id from the URL. /auth/apple/calendar is an older alias.
  if (pathname === '/auth/apple/login' || pathname === '/auth/apple/calendar') {
    try {
      const { isAppleSignInConfigured, getAppleAuthorizationUrl } =
        await import('../../../services/identity/apple-signin-oauth.js');

      if (!isAppleSignInConfigured()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Apple Sign In not configured',
            message: 'Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY',
          })
        );
        return true;
      }

      const state = parsedUrl.searchParams.get('state');
      const record = await peekOAuthLinkState(state, PROVIDER);
      if (!state || !record) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Sign in required', connect: CONNECT }));
        return true;
      }

      log.info({ userId: record.uid }, 'Redirecting to Apple Sign In');
      res.writeHead(302, { Location: getAppleAuthorizationUrl(state) });
      res.end();
      return true;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initiate Apple OAuth');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to initiate Apple Sign In' }));
      return true;
    }
  }

  // Handle Apple OAuth callback
  // Apple uses form_post, so this is a POST request with data in body
  if (pathname === '/auth/apple/callback') {
    if (req.method === 'POST') {
      try {
        // Parse form data from POST body
        const body = await parseFormBody(req);
        const { code } = body;
        const { state } = body;
        const { error } = body;

        // Handle error from Apple
        if (error) {
          log.error({ error }, 'Apple Sign In error');
          res.writeHead(302, { Location: '/settings?calendar_error=apple_denied' });
          res.end();
          return true;
        }

        if (!code || !state) {
          log.error('Apple callback missing code or state');
          res.writeHead(302, { Location: '/settings?calendar_error=missing_params' });
          res.end();
          return true;
        }

        // The Ferni user comes only from the stored state record, consumed here.
        const record = await consumeOAuthLinkState(req, state, PROVIDER);
        if (!record) {
          res.writeHead(302, { Location: '/settings?calendar_error=invalid_state' });
          res.end();
          return true;
        }

        // Exchange code for tokens
        const { handleAppleCallback } =
          await import('../../../services/identity/apple-signin-oauth.js');

        const result = await handleAppleCallback(code, record.uid);

        if (result.success && result.userId) {
          log.info({ userId: result.userId }, 'Apple Calendar connected successfully');

          // Redirect to settings with success
          res.writeHead(302, { Location: '/settings?calendar=apple&status=connected' });
          res.end();
        } else {
          log.error({ error: result.error }, 'Apple OAuth callback failed');
          res.writeHead(302, {
            Location: `/settings?calendar_error=${encodeURIComponent(result.error || 'unknown')}`,
          });
          res.end();
        }
        return true;
      } catch (error) {
        log.error({ error: String(error) }, 'Apple callback error');
        res.writeHead(302, { Location: '/settings?calendar_error=callback_failed' });
        res.end();
        return true;
      }
    }

    // Also handle GET for error redirects from Apple
    if (req.method === 'GET') {
      const error = parsedUrl.searchParams.get('error');
      if (error) {
        res.writeHead(302, { Location: `/settings?calendar_error=${encodeURIComponent(error)}` });
        res.end();
        return true;
      }
    }
  }

  return false;
}

/**
 * Parse application/x-www-form-urlencoded body
 */
async function parseFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const params = new URLSearchParams(body);
        const result: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export default handleAppleCalendarRoutes;
