/**
 * POST /auth/oauth/start { provider, returnUrl? } → { url }
 * POST /auth/oauth/start-from-invite { invite } → { url }
 *
 * The ways into an OAuth connect flow. The web can't put a Bearer token on a
 * full-page navigation, so it calls one of these first, and then navigates to
 * the login URL returned here. That URL carries only an opaque state, bound
 * server-side to one uid and to this browser (oauth-link-state.ts); the login
 * routes refuse anything else.
 *
 * /start takes the uid from the verified caller. /start-from-invite also needs
 * the verified caller, and a connect-moment invite (connect-invites.ts) that
 * names them: a single-use link texted only to the verified owner. Not signed
 * in is 401 before any invite is looked up, so it says nothing about the
 * invite; every refusal after that is the same 404. With every connect moment
 * off the route doesn't exist (the request falls through as before).
 *
 * @module servers/api/routes/oauth-start
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getVerifiedUserId } from '../request-identity.js';
import { createOAuthLinkState } from '../../token/oauth-link-state.js';
import { sanitizeReturnUrl } from '../../token/validation.js';
import { parseBodySafe } from '../../../utils/ddos-protection.js';
import { isLinkedInEnabled, LINKEDIN_OAUTH_PROVIDER } from '../../../config/linkedin-flag.js';
import {
  anyConnectMomentOn,
  CONNECTABLES,
} from '../../../services/connect-moments/connectables.js';
import {
  redeemConnectInvite,
  returnConnectInvite,
} from '../../../services/connect-moments/connect-invites.js';
import { noteConnectMoment } from '../../../services/connect-moments/connect-moment-log.js';
import {
  GMAIL_SEND_OAUTH_PROVIDER,
  isGmailSendAsUserEnabledFor,
} from '../../../config/gmail-send-flag.js';
import {
  LINKEDIN_CONNECT_PATH,
  LINKEDIN_PROVIDER,
  isLinkedInConfigured,
} from '../../../api/linkedin-routes.js';

export const OAUTH_START_PATH = '/auth/oauth/start';
const CONNECT_INVITE_START_PATH = '/auth/oauth/start-from-invite';

/**
 * Oura needs the app credentials, and in production a redirect URI registered on the Oura
 * app: without OURA_REDIRECT_URI the flow falls back to localhost, which Oura rejects.
 * Same credential test as token/oauth/wearables.ts, without loading its token store.
 */
function isOuraConfigured(): boolean {
  if (!process.env.OURA_CLIENT_ID || !process.env.OURA_CLIENT_SECRET) return false;
  return process.env.NODE_ENV !== 'production' || !!process.env.OURA_REDIRECT_URI;
}

/**
 * Provider → the login route that redirects on to the provider. No Spotify: Ferni
 * doesn't link a person's Spotify account (Developer Policy III.3), so it is an
 * unknown provider here (token/oauth/spotify.ts).
 */
const LOGIN_PATHS: ReadonlyMap<string, string> = new Map([
  ['google_calendar', '/auth/google/login'],
  [GMAIL_SEND_OAUTH_PROVIDER, '/auth/google/gmail-send/login'],
  ['microsoft_calendar', '/auth/microsoft/login'],
  ['apple_calendar', '/auth/apple/login'],
  ['oura', '/wearables/oura/login'],
  ['garmin', '/wearables/garmin/login'],
  ['whoop', '/wearables/whoop/login'],
  [LINKEDIN_PROVIDER, LINKEDIN_CONNECT_PATH],
]);

/**
 * Providers that can be switched off by missing app credentials. Refusing here
 * lets the web say so instead of navigating to a page that can't go on. Gmail
 * send is asked for the verified caller: it can be on for one person only.
 */
const AVAILABILITY: ReadonlyMap<
  string,
  { name: string; isConfigured: (uid: string) => boolean | Promise<boolean> }
> = new Map([
  [LINKEDIN_PROVIDER, { name: 'LinkedIn', isConfigured: isLinkedInConfigured }],
  ['oura', { name: 'Oura', isConfigured: isOuraConfigured }],
  [
    GMAIL_SEND_OAUTH_PROVIDER,
    { name: 'Sending from Gmail', isConfigured: isGmailSendAsUserEnabledFor },
  ],
]);

/** The login URL for a provider's flow with this state, or undefined for an unknown provider. */
function oauthLoginUrl(provider: string, state: string): string | undefined {
  const loginPath = LOGIN_PATHS.get(provider);
  return loginPath && `${loginPath}?state=${encodeURIComponent(state)}`;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function parseStartBody(raw: string): {
  provider?: unknown;
  returnUrl?: unknown;
  invite?: unknown;
} {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function handleOAuthStartRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname === CONNECT_INVITE_START_PATH && anyConnectMomentOn()) {
    return handleStartFromInvite(req, res);
  }
  return pathname === OAUTH_START_PATH ? handleStart(req, res) : false;
}

/** /start: begin a flow for the signed-in caller's own account. */
async function handleStart(req: IncomingMessage, res: ServerResponse): Promise<true> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST' });
    return true;
  }

  const uid = getVerifiedUserId(req);
  if (!uid) {
    sendJson(res, 401, { error: 'Sign in required' });
    return true;
  }

  const parsed = await parseBodySafe(req, res, { maxSize: 4096 });
  if (!parsed) return true; // 408/413 already sent
  const { provider, returnUrl } = parseStartBody(parsed.body);
  // LinkedIn switched off (config/linkedin-flag.ts): refuse before any state or URL.
  if (provider === LINKEDIN_OAUTH_PROVIDER && !isLinkedInEnabled()) {
    sendJson(res, 503, { error: "LinkedIn isn't available right now", unavailable: true });
    return true;
  }
  const loginPath = typeof provider === 'string' ? LOGIN_PATHS.get(provider) : undefined;
  if (typeof provider !== 'string' || !loginPath) {
    sendJson(res, 400, { error: 'Unknown provider' });
    return true;
  }
  const availability = AVAILABILITY.get(provider);
  if (availability && !(await availability.isConfigured(uid))) {
    sendJson(res, 503, {
      error: `${availability.name} isn't available right now`,
      unavailable: true,
    });
    return true;
  }

  const state = await createOAuthLinkState(req, res, {
    uid,
    provider,
    returnUrl: sanitizeReturnUrl(typeof returnUrl === 'string' ? returnUrl : null, '/'),
  });
  if (!state) {
    sendJson(res, 503, { error: 'Service temporarily unavailable, try again' });
    return true;
  }

  sendJson(res, 200, { url: oauthLoginUrl(provider, state) });
  return true;
}

/** One answer for an unknown, used, expired or someone else's invite. */
export const INVITE_NOT_FOUND = { error: 'This link has expired or was already used' } as const;

/** /start-from-invite: spend the signed-in owner's invite, then start its integration's flow. */
async function handleStartFromInvite(req: IncomingMessage, res: ServerResponse): Promise<true> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST' });
    return true;
  }
  const signedIn = getVerifiedUserId(req);
  if (!signedIn) {
    sendJson(res, 401, { error: 'Sign in required' });
    return true;
  }
  const parsed = await parseBodySafe(req, res, { maxSize: 1024 });
  if (!parsed) return true; // 408/413 already sent

  const token = parseStartBody(parsed.body).invite;
  const invite = await redeemConnectInvite(token, signedIn);
  if (!invite) {
    sendJson(res, 404, INVITE_NOT_FOUND);
    return true;
  }

  const { provider, returnUrl } = CONNECTABLES[invite.integration];
  const state = await createOAuthLinkState(req, res, { uid: invite.uid, provider, returnUrl });
  const url = state ? oauthLoginUrl(provider, state) : undefined;
  if (!url) {
    noteConnectMoment(invite.integration, 'tap_refused', { reason: 'no_state' });
    await returnConnectInvite(token, invite);
    sendJson(res, 503, { error: 'Service temporarily unavailable, try again' });
    return true;
  }
  noteConnectMoment(invite.integration, 'tapped');
  sendJson(res, 200, { url });
  return true;
}
