/**
 * Google Calendar OAuth Routes
 *
 * OAuth flow for Google Calendar integration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createOAuthStateManager } from '../../../utils/ddos-protection.js';
import * as googleCalendarService from '../../token/oauth/google-calendar.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createWatchChannel,
  stopAllUserChannels as stopAllUserWatchChannels,
} from '../../../services/calendar/webhooks/google-webhook.js';

const log = createLogger({ module: 'GoogleCalendarRoutes' });

// OAuth state manager (5 minute expiry)
const googleOAuthStates = createOAuthStateManager(5 * 60 * 1000);

// Configuration
const GOOGLE_CALENDAR_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
const GOOGLE_CALENDAR_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const GOOGLE_CALENDAR_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'https://app.ferni.ai/auth/google/callback';
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

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
  if (pathname === '/auth/google/login') {
    const userId = parsedUrl.searchParams.get('user_id');
    const returnUrl = parsedUrl.searchParams.get('return_url');

    if (!GOOGLE_CALENDAR_CLIENT_ID || !GOOGLE_CALENDAR_CLIENT_SECRET) {
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

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CALENDAR_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_CALENDAR_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    log.info({ userId }, 'Google Calendar OAuth: Redirecting user to Google');
    res.writeHead(302, { Location: authUrl.toString() });
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
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code || '',
          client_id: GOOGLE_CALENDAR_CLIENT_ID,
          client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
          redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ error: errorText }, 'Google Calendar token exchange failed');
        res.writeHead(302, { Location: '/?calendar_error=token_exchange_failed' });
        res.end();
        return true;
      }

      const tokens = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      // Save tokens for this user (async - uses Firestore)
      const userId = stateData.user_id ?? '';
      await googleCalendarService.saveTokens(userId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        expires_at: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope,
      });

      // Set up webhook watch channel for real-time sync
      if (userId) {
        try {
          const watchChannel = await createWatchChannel(userId, 'primary');
          if (watchChannel) {
            log.info({ userId, channelId: watchChannel.id }, '📅 Google Calendar webhook watch channel created');
          } else {
            log.warn({ userId }, '📅 Could not create Google webhook watch (webhooks may not be enabled)');
          }
        } catch (watchError) {
          log.warn({ error: String(watchError), userId }, '📅 Google webhook setup failed (non-blocking)');
        }
      }

      log.info({ userId: userId || 'unknown' }, 'Google Calendar linked');

      // Redirect back to app
      const returnUrl = stateData.return_url ?? '/?calendar_linked=true';
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
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
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
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    const userTokens = await googleCalendarService.getTokens(userId);
    const googleConfigured = !!(GOOGLE_CALENDAR_CLIENT_ID && GOOGLE_CALENDAR_CLIENT_SECRET);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        google_calendar_configured: googleConfigured,
        linked: !!userTokens,
        expires_at: userTokens?.expires_at || null,
        login_url: googleConfigured
          ? `/auth/google/login?user_id=${encodeURIComponent(userId)}`
          : null,
      })
    );
    return true;
  }

  // Unlink Google Calendar for a user
  if (pathname === '/auth/google/unlink') {
    const userId = parsedUrl.searchParams.get('user_id');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    // Stop webhook watch channels first
    try {
      await stopAllUserWatchChannels(userId);
      log.info({ userId }, '📅 Google Calendar webhooks stopped');
    } catch (error) {
      log.warn({ error: String(error), userId }, '📅 Error stopping Google webhooks (non-blocking)');
    }

    await googleCalendarService.removeTokens(userId);
    log.info({ userId }, 'Google Calendar unlinked');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Google Calendar unlinked' }));
    return true;
  }

  return false;
}
