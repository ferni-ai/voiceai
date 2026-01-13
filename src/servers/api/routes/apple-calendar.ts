/**
 * Apple Calendar OAuth Routes
 *
 * OAuth flow for Apple Calendar integration using Sign in with Apple.
 *
 * Note: Apple OAuth uses form_post response mode, so the callback
 * receives data in the POST body rather than query params.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createOAuthStateManager } from '../../../utils/ddos-protection.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'AppleCalendarRoutes' });

// OAuth state manager (5 minute expiry)
const appleOAuthStates = createOAuthStateManager(5 * 60 * 1000);

/**
 * Handle Apple Calendar OAuth routes
 */
export async function handleAppleCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Start Apple Sign In OAuth flow
  if (pathname === '/auth/apple/login' || pathname === '/auth/apple/calendar') {
    const userId = parsedUrl.searchParams.get('user_id') || parsedUrl.searchParams.get('userId');
    const returnUrl =
      parsedUrl.searchParams.get('return_url') || parsedUrl.searchParams.get('redirect');

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

      // Generate state for CSRF protection (embedded in the auth URL by the service)
      const state = appleOAuthStates.create({
        user_id: userId || 'anonymous',
        return_url: returnUrl || '/settings?calendar=apple',
      });

      if (!state) {
        log.error('Apple Calendar OAuth: State limit reached (possible attack)');
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service temporarily unavailable, try again' }));
        return true;
      }

      // Get the authorization URL with userId embedded in state
      const authUrl = getAppleAuthorizationUrl(
        userId || 'anonymous',
        returnUrl || '/settings?calendar=apple'
      );

      log.info(
        { userId, authUrl: `${authUrl.substring(0, 100)}...` },
        'Redirecting to Apple Sign In'
      );

      res.writeHead(302, { Location: authUrl });
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

        // Exchange code for tokens
        const { handleAppleCallback } =
          await import('../../../services/identity/apple-signin-oauth.js');

        const result = await handleAppleCallback(code, state);

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
