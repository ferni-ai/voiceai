/**
 * Wearables OAuth Routes
 *
 * Serves OAuth flows for wearable device integrations from the UI server.
 * Ported 1:1 from the former standalone token server.
 *
 * Providers: fitbit, oura, garmin, whoop (plus apple_health for unlink)
 *
 * Routes:
 *   GET  /wearables/status?user_id=X          → all provider statuses
 *   GET  /wearables/{provider}/login?user_id=X → start OAuth
 *   GET  /wearables/{provider}/callback       → OAuth callback
 *   GET  /wearables/{provider}/token?user_id=X → get valid access token
 *   POST /wearables/{provider}/unlink?user_id=X → remove tokens
 */

import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import * as wearables from '../../token/oauth/wearables.js';
import type { WearableProvider } from '../../../services/wearable-integration/types.js';
import { isValidId, sendInvalidIdError, getClientIp, sanitizeReturnUrl } from '../../token/validation.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'WearablesRoutes' });

// SECURITY: OAuth state bound to originating IP
interface WearablesOAuthState {
  user_id: string;
  provider: WearableProvider;
  return_url: string;
  created_at: number;
  client_ip: string;
}

const wearablesOAuthStates = new Map<string, WearablesOAuthState>();
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function cleanExpiredOAuthStates(): void {
  const cutoff = Date.now() - OAUTH_STATE_MAX_AGE_MS;
  for (const [key, value] of wearablesOAuthStates) {
    if (value.created_at < cutoff) {
      wearablesOAuthStates.delete(key);
    }
  }
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

  // GET /wearables/status?user_id=X — all provider connection statuses
  if (pathname === '/wearables/status') {
    const user_id = parsedUrl.searchParams.get('user_id');

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    const statuses = await wearables.getAllConnectionStatuses(user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ providers: statuses }));
    return true;
  }

  // GET /wearables/{provider}/login?user_id=X&return_url=X — start OAuth
  const loginMatch = pathname.match(new RegExp(`^/wearables/(${OAUTH_PROVIDERS_PATTERN})/login$`));
  if (loginMatch) {
    const provider = loginMatch[1] as Exclude<WearableProvider, 'apple_health'>;
    const user_id = parsedUrl.searchParams.get('user_id') ?? undefined;
    const return_url = parsedUrl.searchParams.get('return_url') ?? undefined;

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

    if (!user_id || !isValidId(user_id)) {
      sendInvalidIdError(res, 'user_id');
      return true;
    }

    cleanExpiredOAuthStates();

    const clientIp = getClientIp(req);
    const state = crypto.randomUUID();
    wearablesOAuthStates.set(state, {
      user_id,
      provider,
      return_url: sanitizeReturnUrl(return_url, `/?${provider}_linked=true`),
      created_at: Date.now(),
      client_ip: clientIp,
    });

    const authUrl = wearables.buildAuthUrl(provider, state);
    if (!authUrl) {
      wearablesOAuthStates.delete(state);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to build auth URL' }));
      return true;
    }

    log.info({ userId: user_id, provider }, 'Starting wearable OAuth');
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
    const state = parsedUrl.searchParams.get('state') ?? '';
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      log.error({ error, provider }, 'Wearable OAuth error');
      res.writeHead(302, { Location: `/?${provider}_error=` + encodeURIComponent(error) });
      res.end();
      return true;
    }

    const stateData = wearablesOAuthStates.get(state);
    if (!stateData || stateData.provider !== provider) {
      log.error({ provider }, 'Invalid wearable OAuth state');
      res.writeHead(302, { Location: `/?${provider}_error=invalid_state` });
      res.end();
      return true;
    }

    wearablesOAuthStates.delete(state);

    // SECURITY: Validate callback IP matches originating IP (prevent state theft)
    const callbackIp = getClientIp(req);
    if (stateData.client_ip && stateData.client_ip !== callbackIp) {
      log.warn(
        { originIp: stateData.client_ip, callbackIp, userId: stateData.user_id, provider },
        'SECURITY: Wearable OAuth callback IP mismatch - possible state theft attempt'
      );
      res.writeHead(302, { Location: `/?${provider}_error=security_validation_failed` });
      res.end();
      return true;
    }

    // Pass state for PKCE-enabled providers (e.g., Garmin)
    const tokens = await wearables.exchangeCode(provider, code, state);
    if (!tokens) {
      res.writeHead(302, {
        Location: stateData.return_url + `?${provider}_error=token_exchange_failed`,
      });
      res.end();
      return true;
    }

    await wearables.saveTokens(provider, stateData.user_id, tokens);
    log.info({ provider, userId: stateData.user_id }, 'Wearable linked successfully');
    res.writeHead(302, { Location: stateData.return_url + `?${provider}_linked=true` });
    res.end();
    return true;
  }

  // GET /wearables/{provider}/token?user_id=X — get valid access token
  const tokenMatch = pathname.match(
    new RegExp(`^/wearables/(${OAUTH_PROVIDERS_PATTERN})/token$`)
  );
  if (tokenMatch) {
    const provider = tokenMatch[1] as Exclude<WearableProvider, 'apple_health'>;
    const user_id = parsedUrl.searchParams.get('user_id');

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
      return true;
    }

    const accessToken = await wearables.getValidToken(provider, user_id);
    if (!accessToken) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          linked: false,
          error: `${provider} not linked for this user`,
          login_url: `/wearables/${provider}/login?user_id=${encodeURIComponent(user_id)}`,
        })
      );
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ linked: true, access_token: accessToken }));
    return true;
  }

  // POST|GET /wearables/{provider}/unlink?user_id=X — remove tokens
  const unlinkMatch = pathname.match(
    new RegExp(`^/wearables/(${UNLINK_PROVIDERS_PATTERN})/unlink$`)
  );
  if (unlinkMatch) {
    const provider = unlinkMatch[1] as WearableProvider;
    const user_id = parsedUrl.searchParams.get('user_id');

    if (!user_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'user_id is required' }));
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
 * Clean up OAuth state on shutdown
 */
export function shutdownWearablesRoutes(): void {
  wearablesOAuthStates.clear();
}
