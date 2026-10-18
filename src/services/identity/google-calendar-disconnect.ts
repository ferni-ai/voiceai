/**
 * Disconnect Google Calendar: revoke the grant at Google, then delete our copy.
 * Every disconnect path goes through here (the settings and v1 routes,
 * /auth/google/unlink, the Google provider, account erasure).
 *
 * Disconnect used to delete only the stored tokens. The grant stayed live at
 * Google (Ferni kept showing under the user's third-party access) and anyone
 * holding an old copy of the refresh token could still use it. Revoking the
 * refresh token ends the whole grant.
 *
 * - The tokens are read fresh from Firestore (not the 60 s cache), so a miss
 *   cached on this instance can't skip the revoke. If that read fails, this
 *   throws and the caller reports an error instead of a disconnect that
 *   didn't happen.
 * - Revoking drops every scope on the OAuth client, Gmail send-as-user
 *   included. While the user has a Gmail send grant, the revoke is skipped and
 *   only our calendar copy is deleted.
 * - Revoke is best effort: when Google refuses (an already revoked token
 *   answers 400) or is unreachable, the local tokens are still deleted.
 *
 * @module services/identity/google-calendar-disconnect
 */

import { readTokensFresh, removeTokens } from './google-calendar-token-store.js';
import { hasGmailSendGrant } from './gmail-send-as-user.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GoogleCalendarDisconnect' });

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REVOKE_TIMEOUT_MS = 5_000;

export interface DisconnectResult {
  revoked: boolean;
  /** The revoke was skipped to keep the user's Gmail send grant. */
  keptGmailGrant: boolean;
}

async function revoke(token: string, short: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn(
        { status: response.status, userId: short },
        'Google token revoke refused; removing local tokens anyway'
      );
    }
    return response.ok;
  } catch (err) {
    log.warn(
      { error: (err as Error).name, userId: short },
      'Google token revoke failed; removing local tokens anyway'
    );
    return false;
  }
}

/** Revoke the user's Google grant (best effort) and delete the stored tokens. */
export async function disconnectGoogleCalendar(userId: string): Promise<DisconnectResult> {
  const short = userId.substring(0, 8);
  const tokens = await readTokensFresh(userId);
  // The refresh token ends the whole grant; an access token only itself.
  const token = tokens?.refresh_token || tokens?.access_token;
  const keptGmailGrant = !!token && (await hasGmailSendGrant(userId));
  if (keptGmailGrant) {
    log.info({ userId: short }, 'Gmail send grant exists; calendar disconnected without revoke');
  }
  const revoked = !!token && !keptGmailGrant && (await revoke(token, short));

  await removeTokens(userId);
  return { revoked, keptGmailGrant };
}
