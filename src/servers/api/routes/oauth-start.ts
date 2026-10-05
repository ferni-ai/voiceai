/**
 * POST /auth/oauth/start { provider, returnUrl? } → { url }
 *
 * The one way into an OAuth connect flow. The web can't put a Bearer token on a
 * full-page navigation, so it calls this first (with the token), and then
 * navigates to the login URL returned here. That URL carries only an opaque
 * state, bound server-side to the verified caller (oauth-link-state.ts); the
 * login routes refuse anything else.
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
  LINKEDIN_CONNECT_PATH,
  LINKEDIN_PROVIDER,
  isLinkedInConfigured,
} from '../../../api/linkedin-routes.js';

export const OAUTH_START_PATH = '/auth/oauth/start';

/** Provider → the login route that redirects on to the provider. */
const LOGIN_PATHS: ReadonlyMap<string, string> = new Map([
  ['google_calendar', '/auth/google/login'],
  ['microsoft_calendar', '/auth/microsoft/login'],
  ['apple_calendar', '/auth/apple/login'],
  ['fitbit', '/wearables/fitbit/login'],
  ['oura', '/wearables/oura/login'],
  ['garmin', '/wearables/garmin/login'],
  ['whoop', '/wearables/whoop/login'],
  [LINKEDIN_PROVIDER, LINKEDIN_CONNECT_PATH],
]);

/**
 * Providers that can be switched off by missing app credentials. Refusing here
 * lets the web say so instead of navigating to a page that can't go on.
 */
const AVAILABILITY: ReadonlyMap<string, { name: string; isConfigured: () => boolean }> = new Map([
  [LINKEDIN_PROVIDER, { name: 'LinkedIn', isConfigured: isLinkedInConfigured }],
]);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function parseStartBody(raw: string): { provider?: unknown; returnUrl?: unknown } {
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
  if (pathname !== OAUTH_START_PATH) return false;
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
  if (availability && !availability.isConfigured()) {
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

  sendJson(res, 200, { url: `${loginPath}?state=${encodeURIComponent(state)}` });
  return true;
}
