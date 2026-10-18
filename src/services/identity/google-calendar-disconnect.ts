/**
 * Disconnect Google Calendar: revoke the grant at Google, then delete our copy.
 *
 * Disconnect used to delete only the stored tokens. The grant stayed live at
 * Google (Ferni kept showing under the user's third-party access) and anyone
 * holding an old copy of the refresh token could still use it. Revoking the
 * refresh token ends the whole grant.
 *
 * Revoke is best effort: when Google is unreachable or refuses (an already
 * revoked token answers 400), the local tokens are still deleted. Disconnect
 * must never leave a user connected because Google was slow.
 *
 * @module services/identity/google-calendar-disconnect
 */

import { getTokens, removeTokens } from './google-calendar-token-store.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GoogleCalendarDisconnect' });

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REVOKE_TIMEOUT_MS = 5_000;

/** Revoke the user's Google grant (best effort) and delete the stored tokens. */
export async function disconnectGoogleCalendar(userId: string): Promise<{ revoked: boolean }> {
  const short = userId.substring(0, 8);
  const tokens = await getTokens(userId);
  // The refresh token ends the whole grant; an access token only itself.
  const token = tokens?.refresh_token || tokens?.access_token;
  let revoked = false;

  if (token) {
    try {
      const response = await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
      revoked = response.ok;
      if (!response.ok) {
        log.warn(
          { status: response.status, userId: short },
          'Google token revoke refused; removing local tokens anyway'
        );
      }
    } catch (err) {
      log.warn(
        { error: (err as Error).name, userId: short },
        'Google token revoke failed; removing local tokens anyway'
      );
    }
  }

  await removeTokens(userId);
  return { revoked };
}
