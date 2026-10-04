/**
 * Musical You leaderboards, shared by every API instance.
 *
 * Boards lived in a Map in each process, so every Cloud Run instance showed its
 * own leaderboard, and weekly boards "reset" whenever an instance restarted.
 * Each entry is now a shared record (see shared-records), one board per period:
 * musical_leaderboards/<type>_<period>_<gameType>/entries/<uid>, where the
 * period is the week's Monday (UTC) for weekly, YYYY-MM for monthly and "all"
 * for all-time. A board is read as its top 100 by score (one orderBy, served by
 * Firestore's automatic index) and cached for 30 s per instance. A rank is a
 * count aggregation, not a read of everyone above.
 *
 * Only users who recorded a game result have entries; nothing is built from
 * profiles. Weekly and monthly entries get a ttlAt 90 days after their period
 * ends (Firestore TTL deletes them); all-time entries are kept. Each user's
 * boards are listed in musical_leaderboard_members/<uid> so account deletion
 * can remove them all; boards past their ttlAt drop off that list.
 *
 * Moved out of social.ts, which re-exports these functions.
 *
 * @module services/musical-you/leaderboard-store
 */
import { daysAfter, sharedRecords, sharedTransaction } from '../social/shared-records.js';
import type { Leaderboard, LeaderboardEntry } from './types.js';

export type BoardType = 'weekly' | 'monthly' | 'all-time';
type StoredEntry = Omit<LeaderboardEntry, 'rank'> & { updatedAt: Date };

const TOP_READ = 100;
const CACHE_MS = 30_000;
const NO_SCORE = Number.MIN_SAFE_INTEGER;
/** How long a weekly or monthly board is kept after its period ends. */
const KEEP_DAYS_AFTER_PERIOD = 90;

const members = sharedRecords<{ boards: string[] }>('musical_leaderboard_members', {
  dateFields: [],
});
const cache = new Map<string, Leaderboard>();

/**
 * When a board's period ends: a week after its Monday ('2026-09-28'), the
 * first of the next month ('2026-09'), or never ('all').
 */
function periodEnd(period: string): Date | null {
  if (period.length === 10) return daysAfter(new Date(`${period}T00:00:00Z`), 7);
  if (period.length === 7) {
    const [year, month] = period.split('-').map(Number);
    return new Date(Date.UTC(year, month, 1)); // month is 1-based, so this is the next one
  }
  return null;
}

/** When a board's entries may be deleted (null: never). Keys are type_period_game. */
function boardExpiry(key: string): Date | null {
  const end = periodEnd(key.split('_')[1] ?? 'all');
  return end ? daysAfter(end, KEEP_DAYS_AFTER_PERIOD) : null;
}

const boardRecords = (key: string) => {
  const expiry = boardExpiry(key);
  return sharedRecords<StoredEntry>(`musical_leaderboards/${key}/entries`, {
    dateFields: ['updatedAt'],
    ...(expiry ? { ttlAt: () => expiry } : {}),
  });
};

/** The board document key for `type` and `gameType`, in the current period. */
function boardKey(type: BoardType, gameType: string, now = new Date()): string {
  let period = 'all';
  if (type === 'monthly') period = now.toISOString().slice(0, 7);
  if (type === 'weekly') {
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
    period = monday.toISOString().slice(0, 10);
  }
  // Game types are validated by the routes; this keeps a bad one from leaving the path.
  return `${type}_${period}_${gameType.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Rank on a board: 1 + how many entries scored higher. */
async function rankOf(key: string, score: number): Promise<number> {
  return (await boardRecords(key).countAbove('score', score)) + 1;
}

/**
 * Get a leaderboard: its top 100 by score, ranked (cached 30 s per instance)
 */
export async function getLeaderboard(
  type: BoardType,
  gameType: string | 'overall' = 'overall'
): Promise<Leaderboard> {
  const key = boardKey(type, gameType);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_MS) return cached;
  const top = await boardRecords(key).top('score', TOP_READ);
  const leaderboard: Leaderboard = {
    type,
    gameType,
    entries: top.map(({ updatedAt: _u, ...e }, i) => ({ ...e, rank: i + 1 })),
    updatedAt: new Date(),
  };
  cache.set(key, leaderboard);
  return leaderboard;
}

/**
 * Record a result: keeps the user's best score, latest games played, best streak
 */
export async function updateLeaderboardEntry(
  type: BoardType,
  gameType: string | 'overall',
  userId: string,
  displayName: string,
  score: number,
  gamesPlayed: number,
  bestStreak: number,
  avatarUrl?: string
): Promise<LeaderboardEntry> {
  const key = boardKey(type, gameType);
  const board = boardRecords(key);
  const before = await board.get(userId);
  const previousRank = await rankOf(key, before ? before.score : NO_SCORE);

  // Entry and membership in one transaction, so concurrent results both count.
  const written = await sharedTransaction(async (tx) => {
    const current = await tx.get(board, userId);
    const index = (await tx.get(members, userId)) ?? { boards: [] };
    const entry: StoredEntry = {
      userId,
      displayName: displayName || current?.displayName || 'Player',
      avatarUrl: avatarUrl ?? current?.avatarUrl,
      score: Math.max(current?.score ?? score, score), // keep best score
      gamesPlayed,
      bestStreak: Math.max(current?.bestStreak ?? 0, bestStreak),
      change: current?.change ?? 0,
      updatedAt: new Date(),
    };
    tx.set(board, userId, entry);
    if (!index.boards.includes(key)) {
      // Boards past their ttlAt are gone (or going): no need to remember them.
      const now = Date.now();
      const live = index.boards.filter((k) => (boardExpiry(k)?.getTime() ?? Infinity) > now);
      tx.set(members, userId, { boards: [...live, key] });
    }
    return entry;
  });

  const rank = await rankOf(key, written.score);
  const change = previousRank - rank;
  if (change !== written.change) {
    await board.update(userId, (e) => ({ ...e, change }));
  }
  cache.delete(key); // this instance sees its own write at once
  return { ...written, change, rank };
}

/**
 * Get user's entry and rank on a leaderboard (null when they have none)
 */
export async function getUserRank(
  userId: string,
  type: BoardType = 'weekly',
  gameType: string | 'overall' = 'overall'
): Promise<LeaderboardEntry | null> {
  const key = boardKey(type, gameType);
  const stored = await boardRecords(key).get(userId);
  if (!stored) return null;
  const { updatedAt: _u, ...entry } = stored;
  return { ...entry, rank: await rankOf(key, stored.score) };
}

/**
 * Get top N entries from leaderboard
 */
export async function getTopEntries(
  type: BoardType,
  gameType: string | 'overall',
  limit = 10
): Promise<LeaderboardEntry[]> {
  return (await getLeaderboard(type, gameType)).entries.slice(0, limit);
}

/** Account deletion: remove the user from every board they are on. */
export async function deleteMusicalLeaderboardEntries(userId: string): Promise<number> {
  const index = await members.get(userId);
  const boards = index?.boards ?? [];
  await Promise.all(boards.map(async (key) => boardRecords(key).remove(userId)));
  await members.remove(userId);
  for (const key of boards) cache.delete(key);
  return boards.length;
}
