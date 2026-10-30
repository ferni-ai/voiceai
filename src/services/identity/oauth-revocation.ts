/**
 * Refreshing a user's OAuth token, and recording a revoked link.
 * See user-oauth-store.ts for where needs_reauth is kept.
 *
 * @module services/identity/oauth-revocation
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserOAuthStore } from './user-oauth-store.js';

const log = createLogger({ module: 'OAuthRevocation' });
const idTag = (userId: string): string => userId.substring(0, 8);

/**
 * A refresh the provider refused for good (user revoked access): not retried,
 * the person has to reconnect.
 */
export class TokenPermanentlyInvalidError extends Error {
  constructor(
    message: string,
    readonly errorClass: string
  ) {
    super(message);
    this.name = 'TokenPermanentlyInvalidError';
  }
}

/** The error class when a refresh error body means the grant is gone for good, else null. */
export function permanentGrantErrorClass(errorBody: string): string | null {
  if (errorBody.includes('invalid_grant')) return 'invalid_grant';
  if (errorBody.includes('Token has been expired or revoked')) return 'revoked';
  if (errorBody.includes('unauthorized_client')) return 'unauthorized_client';
  return null;
}

/**
 * Run a refresh. `doRefresh` throws TokenPermanentlyInvalidError for a revoked
 * grant (see permanentGrantErrorClass); that is recorded as needs_reauth, the
 * refresh is blocked for an hour, and null comes back. Any other failure is
 * logged and returns null. Before recording, the link is re-read: if its
 * refresh token is no longer the one that failed, the person reconnected (or
 * another instance rotated it), so the failure is stale and nothing is recorded.
 */
export async function refreshWithRevocation<T extends { refresh_token?: string }, R>(
  store: UserOAuthStore<T>,
  userId: string,
  usedRefreshToken: string,
  doRefresh: () => Promise<R>
): Promise<R | null> {
  const ids = { provider: store.provider, userId: idTag(userId) };
  try {
    return await doRefresh();
  } catch (error) {
    if (!(error instanceof TokenPermanentlyInvalidError)) {
      log.error({ ...ids, error: (error as Error).message }, 'Failed to refresh OAuth tokens');
      return null;
    }
    try {
      const current = await store.readFresh(userId);
      if (current?.refresh_token && current.refresh_token !== usedRefreshToken) {
        store.evict(userId);
        log.info({ ...ids, outcome: 'superseded' }, 'Refresh failed on a replaced grant; ignored');
        return null;
      }
      const recorded = await store.markNeedsReauth(userId, error.errorClass);
      log.warn(
        { ...ids, outcome: 'needs_reauth', errorClass: error.errorClass, recorded },
        'OAuth link revoked - user needs to reconnect'
      );
    } catch (writeError) {
      log.error({ ...ids, error: (writeError as Error).message }, 'Could not record needs_reauth');
    }
    store.blockRefresh(userId);
    return null;
  }
}
