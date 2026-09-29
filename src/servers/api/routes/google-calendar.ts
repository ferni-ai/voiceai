/**
 * Google Calendar OAuth Routes
 *
 * OAuth flow for Google Calendar integration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createOAuthStateManager } from '../../../utils/ddos-protection.js';
import * as googleCalendarService from '../../token/oauth/google-calendar.js';
import { isAnonymousIdentity, requestUserId } from '../../../api/identity-guard.js';
import {
  deleteUserTokens,
  getUserTokens,
} from '../../../services/identity/google-calendar-oauth.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import {
  createWatchChannel,
  stopAllUserChannels as stopAllUserWatchChannels,
} from '../../../services/calendar/webhooks/google-webhook.js';

const log = createLogger({ module: 'GoogleCalendarRoutes' });

// OAuth state manager (5 minute expiry)
const googleOAuthStates = createOAuthStateManager(5 * 60 * 1000);

/**
 * The account a token/status/unlink request may act on: the caller, or the
 * `user_id` they name when it is theirs or an anonymous device identity.
 * Null when the named account belongs to someone else.
 */
function ownerId(req: IncomingMessage, parsedUrl: URL): string | null {
  const caller = requestUserId(req);
  const claimed = parsedUrl.searchParams.get('user_id');
  if (!claimed) return caller;
  return claimed === caller || isAnonymousIdentity(claimed) ? claimed : null;
}

function sendForbidden(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not allowed for this user' }));
}

/**
 * Handle Google Calendar OAuth routes
 */
export async function handleGoogleCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Start Google Calendar OAuth flow
  // Support both /auth/google/login and /auth/google/calendar for flexibility
  if (pathname === '/auth/google/login' || pathname === '/auth/google/calendar') {
    // Prefer the verified caller; plain navigation (no auth header) falls back
    // to the user_id / userId query param
    const userId =
      requestUserId(req) ||
      parsedUrl.searchParams.get('user_id') ||
      parsedUrl.searchParams.get('userId');
    const returnUrl =
      parsedUrl.searchParams.get('return_url') || parsedUrl.searchParams.get('redirect');

    if (!googleCalendarService.isConfigured()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Google Calendar OAuth not configured',
          message: 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET',
        })
      );
      return true;
    }

    // Generate state for CSRF protection
    const state = googleOAuthStates.create({
      user_id: userId || 'anonymous',
      return_url: returnUrl || '/',
    });

    if (!state) {
      log.error('Google Calendar OAuth: State limit reached (possible attack)');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service temporarily unavailable, try again' }));
      return true;
    }

    // Same client, redirect URI (publicUrl) and scopes the token store uses
    const authUrl = googleCalendarService.buildAuthUrl(state);

    log.info({ userId }, 'Google Calendar OAuth: Redirecting user to Google');
    // Clients fetch with auth headers + ?format=json so the link is bound to
    // the verified account, then navigate to the returned URL.
    if (parsedUrl.searchParams.get('format') === 'json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: authUrl }));
      return true;
    }
    res.writeHead(302, { Location: authUrl });
    res.end();
    return true;
  }

  // Google Calendar OAuth callback
  if (pathname === '/auth/google/callback') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.error({ error }, 'Google Calendar OAuth error');
      res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
      res.end();
      return true;
    }

    // Verify state
    const stateData = googleOAuthStates.consume(state ?? '') as {
      user_id?: string;
      return_url?: string;
    } | null;
    if (!stateData) {
      log.error('Google Calendar OAuth: Invalid or expired state');
      res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
      res.end();
      return true;
    }

    try {
      // Exchange code for tokens
      const tokens = await googleCalendarService.exchangeCode(code || '');
      if (!tokens) {
        res.writeHead(302, { Location: '/?calendar_error=token_exchange_failed' });
        res.end();
        return true;
      }

      // Save tokens for this user (encrypted, bogle_users/{uid}/google_calendar_tokens)
      // — the same store voice calendar/Gmail tools read
      const userId = stateData.user_id ?? '';
      await googleCalendarService.saveTokens(userId, tokens);

      // Set up webhook watch channel for real-time sync
      if (userId) {
        try {
          const watchChannel = await createWatchChannel(userId, 'primary');
          if (watchChannel) {
            log.info(
              { userId, channelId: watchChannel.id },
              '📅 Google Calendar webhook watch channel created'
            );
          } else {
            log.warn(
              { userId },
              '📅 Could not create Google webhook watch (webhooks may not be enabled)'
            );
          }
        } catch (watchError) {
          log.warn(
            { error: String(watchError), userId },
            '📅 Google webhook setup failed (non-blocking)'
          );
        }
      }

      log.info({ userId: userId || 'unknown' }, 'Google Calendar linked');

      // Redirect back to app with success indicator
      // Default to settings page with calendar=google&status=connected
      let returnUrl = stateData.return_url ?? '/settings?calendar=google&status=connected';
      // Ensure success indicator is added if not present
      if (!returnUrl.includes('status=') && !returnUrl.includes('calendar_linked')) {
        const separator = returnUrl.includes('?') ? '&' : '?';
        returnUrl = `${returnUrl}${separator}calendar=google&status=connected`;
      }
      res.writeHead(302, { Location: returnUrl });
      res.end();
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Google Calendar OAuth callback error');
      res.writeHead(302, { Location: '/?calendar_error=callback_failed' });
      res.end();
    }
    return true;
  }

  // Get Google Calendar access token for a user
  if (pathname === '/auth/google/token') {
    const userId = ownerId(req, parsedUrl);

    if (!userId) {
      if (parsedUrl.searchParams.get('user_id')) {
        sendForbidden(res);
        return true;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    const accessToken = await googleCalendarService.getValidToken(userId);
    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          linked: false,
          error: 'Google Calendar not linked for this user',
          login_url: `/auth/google/login?user_id=${encodeURIComponent(userId)}`,
        })
      );
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        linked: true,
        access_token: accessToken,
      })
    );
    return true;
  }

  // Check Google Calendar link status
  if (pathname === '/auth/google/status') {
    const userId = ownerId(req, parsedUrl);

    if (!userId) {
      if (parsedUrl.searchParams.get('user_id')) {
        sendForbidden(res);
        return true;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    // Encrypted per-user store, else a legacy root-collection link
    const userTokens = await getUserTokens(userId);
    const googleConfigured = googleCalendarService.isConfigured();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        google_calendar_configured: googleConfigured,
        linked: !!userTokens,
        expires_at: userTokens?.expiry_date || null,
        login_url: googleConfigured
          ? `/auth/google/login?user_id=${encodeURIComponent(userId)}`
          : null,
      })
    );
    return true;
  }

  // Unlink Google Calendar for a user
  if (pathname === '/auth/google/unlink') {
    const userId = ownerId(req, parsedUrl);

    if (!userId) {
      if (parsedUrl.searchParams.get('user_id')) {
        sendForbidden(res);
        return true;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    // Stop webhook watch channels first
    try {
      await stopAllUserWatchChannels(userId);
      log.info({ userId }, '📅 Google Calendar webhooks stopped');
    } catch (error) {
      log.warn(
        { error: String(error), userId },
        '📅 Error stopping Google webhooks (non-blocking)'
      );
    }

    // Both the encrypted store and any legacy root-collection doc
    await deleteUserTokens(userId);
    log.info({ userId }, 'Google Calendar unlinked');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
    return true;
  }

  return false;
}
