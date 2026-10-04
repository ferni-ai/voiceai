/**
 * Leaderboards as the public sees them.
 *
 * GET /api/musical/leaderboard and /api/social/leaderboard(/around) need no
 * credentials, and their entries carried each player's userId, which is their
 * Firebase uid. Anyone could harvest account ids for every ranked player. The
 * public view drops the id; a row is identified by its rank and display name,
 * and `isCurrentUser` tells a signed-in viewer which row is theirs.
 *
 * @module api/routes/leaderboard-view
 */
import type { IncomingMessage } from 'http';
import { getVerifiedUserId } from '../../servers/api/request-identity.js';

export type PublicEntry<T extends { userId: string }> = Omit<T, 'userId'> & {
  isCurrentUser: boolean;
};

/** Entries with the account id removed and the viewer's own row flagged. */
export function publicEntries<T extends { userId: string }>(
  entries: readonly T[],
  req: IncomingMessage
): Array<PublicEntry<T>> {
  const viewer = getVerifiedUserId(req);
  return entries.map(({ userId, ...rest }) => ({
    ...rest,
    isCurrentUser: viewer !== null && userId === viewer,
  }));
}
