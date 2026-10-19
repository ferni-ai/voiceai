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
 *   Account erasure passes queueIfUnreachable, so a revoke Google couldn't
 *   take is queued (google-revocations.ts) before our copy goes.
 *
 * @module services/identity/google-calendar-disconnect
 */

import { readTokensFresh, removeTokens } from './google-calendar-token-store.js';
import { hasGmailSendGrant } from './gmail-send-as-user.js';
import { queueGoogleRevocation, revokeGoogleToken } from './google-revocations.js';
import { createLogger } from '../../utils/safe-logger.js';

export { GOOGLE_REVOKE_URL } from './google-revocations.js';

const log = createLogger({ module: 'GoogleCalendarDisconnect' });

export interface DisconnectResult {
  revoked: boolean;
  /** The revoke was skipped to keep the user's Gmail send grant. */
  keptGmailGrant: boolean;
  /** Google was unreachable and the revoke was queued for later. */
  queued: boolean;
}

/** Revoke the user's Google grant (best effort) and delete the stored tokens. */
export async function disconnectGoogleCalendar(
  userId: string,
  opts: { queueIfUnreachable?: boolean } = {}
): Promise<DisconnectResult> {
  const short = userId.substring(0, 8);
  const tokens = await readTokensFresh(userId);
  // The refresh token ends the whole grant; an access token only itself.
  const token = tokens?.refresh_token || tokens?.access_token;
  const keptGmailGrant = !!token && (await hasGmailSendGrant(userId));
  if (keptGmailGrant) {
    log.info({ userId: short }, 'Gmail send grant exists; calendar disconnected without revoke');
  }
  const outcome = token && !keptGmailGrant ? await revokeGoogleToken(token) : null;
  if (outcome === 'refused' || outcome === 'unreachable') {
    log.warn(
      { userId: short, outcome },
      'Google revoke did not land; removing local tokens anyway'
    );
  }
  const queued = !!token && outcome === 'unreachable' && !!opts.queueIfUnreachable;
  if (queued) await queueGoogleRevocation(token);

  await removeTokens(userId);
  return { revoked: outcome === 'revoked', keptGmailGrant, queued };
}
