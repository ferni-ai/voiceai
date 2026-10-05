/**
 * Wearables OAuth Routes
 *
 * Serves OAuth flows for wearable device integrations from the UI server.
 *
 * Providers: fitbit, oura, garmin, whoop (plus apple_health for unlink)
 *
 * Routes (the user is always the verified caller, never a query parameter):
 *   GET  /wearables/status                    → all provider statuses
 *   GET  /wearables/{provider}/login?state=X  → start OAuth; X from POST /auth/oauth/start
 *   GET  /wearables/{provider}/callback       → OAuth callback
 *   GET  /wearables/{provider}/token          → get valid access token
 *   POST /wearables/{provider}/unlink         → remove tokens
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as wearables from '../../token/oauth/wearables.js';
import type { WearableProvider } from '../../../services/wearable-integration/types.js';
import { consumeOAuthLinkState, peekOAuthLinkState } from '../../token/oauth-link-state.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getVerifiedUserId } from '../request-identity.js';
import { OAUTH_START_PATH } from './oauth-start.js';

const log = createLogger({ module: 'WearablesRoutes' });

/** returnUrl with one more query parameter, e.g. ('/', 'oura_linked', 'true') → '/?oura_linked=true'. */
function withParam(returnUrl: string, key: string, value: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${key}=${encodeURIComponent(value)}`;
}

const OAUTH_PROVIDERS_PATTERN = 'fitbit|oura|garmin|whoop';
const UNLINK_PROVIDERS_PATTERN = 'fitbit|oura|garmin|whoop|apple_health';

/**
 * Handle wearables OAuth routes
 */
export async function handleWearablesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/wearables')) return false;

  // GET /wearables/status — all provider connection statuses
  if (pathname === '/wearables/status') {
    const user_id = getVerifiedUserId(req);

    if (!user_id) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required' }));
      return true;
    }

    const statuses = await wearables.getAllConnectionStatuses(user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ providers: statuses }));
    return true;
  }

  // GET /wearables/{provider}/login?state=X — start OAuth (state from POST /auth/oauth/start)
  const loginMatch = pathname.match(new RegExp(`^/wearables/(${OAUTH_PROVIDERS_PATTERN})/login$`));
  if (loginMatch) {
    const provider = loginMatch[1] as Exclude<WearableProvider, 'apple_health'>;

    if (!wearables.isProviderConfigured(provider)) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `${provider} not configured`,
          message: `Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET in .env`,
        })
      );
      return true;
    }

    const state = parsedUrl.searchParams.get('state');
    const record = await peekOAuthLinkState(state, provider);
    if (!state || !record) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Sign in required',
          connect: { method: 'POST', url: OAUTH_START_PATH, provider },
        })
      );
      return true;
    }

    const authUrl = wearables.buildAuthUrl(provider, state);
    if (!authUrl) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to build auth URL' }));
      return true;
    }

    log.info({ userId: record.uid, provider }, 'Starting wearable OAuth');
    res.writeHead(302, { Location: authUrl });
    res.end();
    return true;
  }

  // GET /wearables/{provider}/callback?code=X&state=X — OAuth callback
  const callbackMatch = pathname.match(
    new RegExp(`^/wearables/(${OAUTH_PROVIDERS_PATTERN})/callback$`)
  );
  if (callbackMatch) {
    const provider = callbackMatch[1] as Exclude<WearableProvider, 'apple_health'>;
    const code = parsedUrl.searchParams.get('code') ?? '';
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.error({ error, provider }, 'Wearable OAuth error');
      res.writeHead(302, { Location: withParam('/', `${provider}_error`, error) });
      res.end();
      return true;
    }

    // The Ferni user comes only from the stored state record, consumed here.
    // It is also bound to the browser that started the flow, which replaces
    // the old origin-IP check.
    const record = await consumeOAuthLinkState(req, state, provider);
    if (!record) {
      log.error({ provider }, 'Invalid wearable OAuth state');
      res.writeHead(302, { Location: withParam('/', `${provider}_error`, 'invalid_state') });
      res.end();
      return true;
    }

    // Pass state for PKCE-enabled providers (e.g., Garmin)
    const tokens = await wearables.exchangeCode(provider, code, state ?? '');
    if (!tokens) {
      res.writeHead(302, {
        Location: withParam(record.returnUrl, `${provider}_error`, 'token_exchange_failed'),
      });
      res.end();
      return true;
    }

    await wearables.saveTokens(provider, record.uid, tokens);
    log.info({ provider, userId: record.uid }, 'Wearable linked successfully');
    res.writeHead(302, { Location: withParam(record.returnUrl, `${provider}_linked`, 'true') });
    res.end();
    return true;
  }

  // GET /wearables/{provider}/token — get valid access token
  const tokenMatch = pathname.match(new RegExp(`^/wearables/(${OAUTH_PROVIDERS_PATTERN})/token$`));
  if (tokenMatch) {
    const provider = tokenMatch[1] as Exclude<WearableProvider, 'apple_health'>;
    const user_id = getVerifiedUserId(req);

    if (!user_id) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required' }));
      return true;
    }

    const accessToken = await wearables.getValidToken(provider, user_id);
    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          linked: false,
          error: `${provider} not linked for this user`,
          connect: { method: 'POST', url: OAUTH_START_PATH, provider },
        })
      );
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ linked: true, access_token: accessToken }));
    return true;
  }

  // POST|GET /wearables/{provider}/unlink — remove tokens
  const unlinkMatch = pathname.match(
    new RegExp(`^/wearables/(${UNLINK_PROVIDERS_PATTERN})/unlink$`)
  );
  if (unlinkMatch) {
    const provider = unlinkMatch[1] as WearableProvider;
    const user_id = getVerifiedUserId(req);

    if (!user_id) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required' }));
      return true;
    }

    await wearables.removeTokens(provider, user_id);
    log.info({ userId: user_id, provider }, 'Wearable unlinked');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: `${provider} unlinked` }));
    return true;
  }

  return false;
}

/**
 * Nothing to clean up on shutdown: OAuth state lives in oauth-link-state.ts.
 * Kept because the server's shutdown sequence calls it.
 */
export function shutdownWearablesRoutes(): void {}
