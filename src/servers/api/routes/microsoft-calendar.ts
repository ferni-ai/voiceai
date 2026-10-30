/**
 * Microsoft Calendar (Outlook) OAuth Routes
 *
 * OAuth flow for Microsoft 365 / Outlook Calendar integration.
 * Uses Microsoft Graph API.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  consumeOAuthLinkState,
  peekOAuthLinkState,
  pkceVerifierFor,
} from '../../token/oauth-link-state.js';
import * as outlookLink from '../../../services/calendar/providers/outlook-link.js';
import { outlookConnectOn } from '../../../services/calendar/providers/outlook-state.js';
import { outlookCalendarProvider } from '../../../services/calendar/providers/outlook-provider.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getVerifiedUserId } from '../request-identity.js';
import { OAUTH_START_PATH } from './oauth-start.js';

const log = createLogger({ module: 'MicrosoftCalendarRoutes' });

const PROVIDER = 'microsoft_calendar';
const CONNECT = { method: 'POST', url: OAUTH_START_PATH, provider: PROVIDER } as const;

// Configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MICROSOFT_REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI || 'https://app.ferni.ai/auth/microsoft/callback';
const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
].join(' ');

/** OUTLOOK_CONNECT authorize params: PKCE S256 and the calendar scopes; null without our cookie. */
function outlookAuthorizeParams(
  req: IncomingMessage,
  state: string
): Record<string, string> | null {
  const verifier = pkceVerifierFor(req, state);
  if (!verifier) return null;
  const challenge = outlookLink.pkceChallenge(verifier);
  return {
    scope: outlookLink.OUTLOOK_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  };
}

/** OUTLOOK_CONNECT callback: trade the code with its verifier, seal the grant; where to send the browser. */
async function finishOutlookConnect(
  req: IncomingMessage,
  link: { uid: string; returnUrl: string },
  code: string | null,
  state: string | null
): Promise<string> {
  const verifier = state ? pkceVerifierFor(req, state) : null;
  const saved =
    code && verifier
      ? await outlookLink.connectOutlook(link.uid, code, MICROSOFT_REDIRECT_URI, verifier)
      : 'failed';
  log.info({ provider: PROVIDER, outcome: saved }, 'Microsoft OAuth callback');
  if (saved === 'no_key') return '/?calendar_error=storage_unavailable';
  if (saved !== 'saved') return '/?calendar_error=token_exchange_failed';
  return `${link.returnUrl}${link.returnUrl.includes('?') ? '&' : '?'}calendar=outlook&status=connected`;
}

/**
 * Handle Microsoft Calendar OAuth routes
 */
export async function handleMicrosoftCalendarRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Microsoft OAuth login: only with a state from POST /auth/oauth/start,
  // never a user id from the URL.
  if (pathname === '/auth/microsoft/login') {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Microsoft OAuth not configured',
          message: 'Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET',
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

    // OUTLOOK_CONNECT: PKCE from the browser binding, and only the scopes the calendar needs.
    const outlook = outlookConnectOn() ? outlookAuthorizeParams(req, state) : {};
    if (!outlook) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required', connect: CONNECT }));
      return true;
    }

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', MICROSOFT_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', MICROSOFT_SCOPES);
    for (const [key, value] of Object.entries(outlook)) authUrl.searchParams.set(key, value);
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    log.info({ userId: record.uid }, 'Microsoft OAuth: Redirecting user to Microsoft');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return true;
  }

  // Microsoft Calendar OAuth callback
  if (pathname === '/auth/microsoft/callback') {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');
    const errorDescription = parsedUrl.searchParams.get('error_description');

    if (error) {
      log.error({ error, errorDescription }, 'Microsoft OAuth error');
      res.writeHead(302, { Location: '/?calendar_error=' + encodeURIComponent(error) });
      res.end();
      return true;
    }

    // The Ferni user comes only from the stored state record, consumed here.
    const stateData = await consumeOAuthLinkState(req, state, PROVIDER);
    if (!stateData) {
      log.error('Microsoft OAuth: Invalid or expired state');
      res.writeHead(302, { Location: '/?calendar_error=invalid_state' });
      res.end();
      return true;
    }

    try {
      const userId = stateData.uid;

      if (outlookConnectOn()) {
        res.writeHead(302, { Location: await finishOutlookConnect(req, stateData, code, state) });
        res.end();
        return true;
      }

      // Use the provider to handle the callback
      const success = await outlookCalendarProvider.handleAuthCallback(
        userId,
        code || '',
        MICROSOFT_REDIRECT_URI
      );

      if (success) {
        log.info({ userId }, 'Microsoft Calendar linked');
        const sep = stateData.returnUrl.includes('?') ? '&' : '?';
        const returnUrl = `${stateData.returnUrl}${sep}calendar=outlook&status=connected`;
        res.writeHead(302, { Location: returnUrl });
        res.end();
      } else {
        log.error({ userId }, 'Microsoft token exchange failed');
        res.writeHead(302, { Location: '/?calendar_error=token_exchange_failed' });
        res.end();
      }
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Microsoft OAuth callback error');
      res.writeHead(302, { Location: '/?calendar_error=callback_failed' });
      res.end();
    }
    return true;
  }

  // Check Microsoft Calendar link status
  if (pathname === '/auth/microsoft/status') {
    const userId = getVerifiedUserId(req);

    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required' }));
      return true;
    }

    const configured = outlookCalendarProvider.isConfigured();
    const connected = await outlookCalendarProvider.isConnected(userId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        microsoft_calendar_configured: configured,
        linked: connected,
        ...(outlookConnectOn() ? { link_state: await outlookLink.outlookLinkState(userId) } : {}),
        connect: configured ? CONNECT : null,
      })
    );
    return true;
  }

  // Unlink Microsoft Calendar for a user
  if (pathname === '/auth/microsoft/unlink') {
    const userId = getVerifiedUserId(req);

    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required' }));
      return true;
    }

    await outlookCalendarProvider.disconnect(userId);
    log.info({ userId }, 'Microsoft Calendar unlinked');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Microsoft Calendar unlinked' }));
    return true;
  }

  return false;
}
