/**
 * Start an OAuth "connect account" flow (Google/Outlook/Apple calendar, wearables,
 * LinkedIn).
 *
 * A full-page navigation can't carry the Firebase token, so the server never
 * learns who is connecting from the login URL. We first POST /auth/oauth/start
 * (apiPost sends the Bearer token); the server binds a one-time state to the
 * signed-in user and this browser, and returns the login URL to navigate to.
 * The login URL never carries a user id.
 *
 * @module services/oauth-connect
 */
import { failure, success, type OperationResult } from '../types/results.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OAuthConnect');

export const OAUTH_START_PATH = '/auth/oauth/start';

export type OAuthConnectProvider =
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'apple_calendar'
  | 'fitbit'
  | 'oura'
  | 'garmin'
  | 'whoop'
  | 'linkedin';

const PROVIDER_NAMES: Record<OAuthConnectProvider, string> = {
  google_calendar: 'Google Calendar',
  microsoft_calendar: 'Outlook',
  apple_calendar: 'Apple Calendar',
  fitbit: 'Fitbit',
  oura: 'Oura',
  garmin: 'Garmin',
  whoop: 'WHOOP',
  linkedin: 'LinkedIn',
};

/** Only same-origin paths: the server returns e.g. /auth/google/login?state=… */
function isSameOriginPath(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

/** What to tell the user when the server won't start the flow. */
function refusalMessage(provider: OAuthConnectProvider, status: number): string {
  if (status === 401) return 'Sign in first, then connect';
  // 503: the provider isn't set up on the server (or can't start a flow now).
  if (status === 503) return `${PROVIDER_NAMES[provider]} isn't available right now`;
  return "Couldn't connect. Try again?";
}

/**
 * Ask the server for a login URL bound to the signed-in user, then go there.
 * On failure nothing navigates and the caller gets a short message to show.
 */
export async function startOAuthConnect(
  provider: OAuthConnectProvider,
  returnUrl = '/'
): Promise<OperationResult> {
  const response = await apiPost<{ url?: string }>(
    OAUTH_START_PATH,
    { provider, returnUrl },
    { maxRetries: 0 }
  );
  const url = response.ok ? response.data?.url : undefined;
  if (!isSameOriginPath(url)) {
    log.warn('OAuth start refused', { provider, status: response.status });
    return failure(refusalMessage(provider, response.status));
  }
  window.location.href = url;
  return success();
}
