/**
 * "Send email as me" connect routes (gmail.send), behind GMAIL_SEND_AS_USER.
 *
 * The flow starts like every connect: POST /auth/oauth/start
 * { provider: 'gmail_send' } → /auth/google/gmail-send/login → Google. Google
 * returns to the calendar connect's redirect, /auth/google/callback, so no new
 * redirect URI has to be registered on the OAuth client: this handler runs
 * first and takes the callback only when its state was started for gmail_send.
 *
 * @module servers/api/routes/gmail-send
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { consumeOAuthLinkState, peekOAuthLinkState } from '../../token/oauth-link-state.js';
import { getVerifiedUserId } from '../request-identity.js';
import {
  GMAIL_SEND_OAUTH_PROVIDER,
  isGmailSendAsUserEnabled,
} from '../../../config/gmail-send-flag.js';
import {
  buildGmailSendAuthUrl,
  completeGmailSendConnect,
  disconnectGmailSend,
  getGmailSendAddress,
} from '../../../services/identity/gmail-send-as-user.js';
import { OAUTH_START_PATH } from './oauth-start.js';

export const GMAIL_SEND_LOGIN_PATH = '/auth/google/gmail-send/login';
const CONNECT = { method: 'POST', url: OAUTH_START_PATH, provider: GMAIL_SEND_OAUTH_PROVIDER };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function withParam(url: string, param: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${param}`;
}

export async function handleGmailSendRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/auth/google/callback') {
    if (!isGmailSendAsUserEnabled()) return false;
    const state = parsedUrl.searchParams.get('state');
    if (!(await peekOAuthLinkState(state, GMAIL_SEND_OAUTH_PROVIDER))) return false;
    const record = await consumeOAuthLinkState(req, state, GMAIL_SEND_OAUTH_PROVIDER);
    const code = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');
    if (!record) {
      redirect(res, '/?gmail_send_error=invalid_state');
    } else if (error || !code) {
      redirect(
        res,
        withParam(record.returnUrl, `gmail_send_error=${encodeURIComponent(error ?? 'no_code')}`)
      );
    } else {
      const result = await completeGmailSendConnect(record.uid, code);
      const outcome = result.ok ? 'gmail_send=connected' : `gmail_send_error=${result.reason}`;
      redirect(res, withParam(record.returnUrl, outcome));
    }
    return true;
  }

  if (!pathname.startsWith('/auth/google/gmail-send/')) return false;

  if (!isGmailSendAsUserEnabled()) {
    sendJson(res, 503, {
      error: "Sending from your Gmail isn't available right now",
      unavailable: true,
    });
    return true;
  }

  if (pathname === GMAIL_SEND_LOGIN_PATH) {
    const state = parsedUrl.searchParams.get('state');
    if (!state || !(await peekOAuthLinkState(state, GMAIL_SEND_OAUTH_PROVIDER))) {
      sendJson(res, 401, { error: 'Sign in required', connect: CONNECT });
      return true;
    }
    redirect(res, buildGmailSendAuthUrl(state));
    return true;
  }

  const userId = getVerifiedUserId(req);
  if (!userId) {
    sendJson(res, 401, { error: 'Sign in required' });
    return true;
  }

  if (pathname === '/auth/google/gmail-send/status' && req.method === 'GET') {
    const email = await getGmailSendAddress(userId);
    sendJson(res, 200, { connected: !!email, email, connect: CONNECT });
    return true;
  }

  if (pathname === '/auth/google/gmail-send/disconnect' && req.method === 'POST') {
    await disconnectGmailSend(userId);
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}
