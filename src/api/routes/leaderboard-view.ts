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
import type { IncomingMessage, ServerResponse } from 'http';
import { getVerifiedUserId } from '../../servers/api/request-identity.js';
import { isValidGameType } from '../../services/social/game-types.js';
import { sendJSON } from '../helpers.js';

const BOARD_TYPES = ['weekly', 'monthly', 'all-time'] as const;
const PERIODS = ['daily', 'weekly', 'monthly', 'all-time'] as const;
const SCOPES = ['global', 'friends'] as const;

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

/** A game result's game type: one that exists (services/social/game-types); never 'overall'. */
export function isRecordableGame(gameType: unknown): gameType is string {
  return isValidGameType(gameType);
}

/**
 * The Musical You board a query names (type defaults to weekly, gameType to
 * overall, limit to 10, at most 100), or null when type or gameType isn't one.
 */
export function boardFrom(query: URLSearchParams): {
  type: (typeof BOARD_TYPES)[number];
  game: string;
  limit: number;
} | null {
  const type = BOARD_TYPES.find((t) => t === (query.get('type') || 'weekly'));
  const gameType = query.get('gameType') || 'overall';
  if (!type || (gameType !== 'overall' && !isValidGameType(gameType))) return null;
  const limit = parseInt(query.get('limit') || '10', 10) || 10;
  return { type, game: gameType, limit: Math.min(Math.max(limit, 1), 100) };
}

/** 400 for a board that doesn't exist; true, as route handlers return. */
export function unknownBoard(res: ServerResponse): true {
  sendJSON(res, { success: false, error: 'Unknown leaderboard' }, 400);
  return true;
}

/**
 * The social board a query names (period defaults to weekly, gameType to
 * overall, scope to global), or null when any of them isn't one. gameType
 * becomes a Firestore field path, and each combination is cached per instance.
 */
export function socialBoardFrom(query: URLSearchParams): {
  period: (typeof PERIODS)[number];
  gameType: string;
  scope: (typeof SCOPES)[number];
} | null {
  const period = PERIODS.find((p) => p === (query.get('period') || 'weekly'));
  const scope = SCOPES.find((s) => s === (query.get('scope') || 'global'));
  const gameType = query.get('gameType') || 'overall';
  if (!period || !scope || (gameType !== 'overall' && !isValidGameType(gameType))) return null;
  return { period, gameType, scope };
}
