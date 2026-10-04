/**
 * Head-to-head social challenges (score-beat, speed-beat), stored where every
 * API instance sees them (see shared-records). Moved out of
 * multiplayer-games.ts, which re-exports these functions.
 *
 * Bounded: a user may have 50 unanswered challenges out and 50 waiting
 * (open-challenge-slots, checked and taken atomically), and every list reads at
 * most LIST_LIMIT records from the store. State
 * changes are bound to the actor here, not only in the route: only the
 * challengee (or an admin, passed explicitly) may accept, complete or
 * decline, and who did it is recorded.
 *
 * @module services/social/challenges
 */
import { randomUUID, randomInt } from 'node:crypto';
import { getLogger } from '../../utils/safe-logger.js';
import { boundedChallenges, type ChallengeActor } from './open-challenge-slots.js';
import { daysAfter, sharedRecords } from './shared-records.js';
import type { Challenge, ChallengeType } from './multiplayer-games.js';

const log = getLogger();

/** Lists read at most this many records per query. */
const LIST_LIMIT = 100;

/**
 * Deletable (ttlAt) at expiry while pending, 30 days after expiry once accepted
 * (still being played), or 30 days after it finished.
 */
const challenges = sharedRecords<Challenge>('social_challenges', {
  dateFields: ['createdAt', 'expiresAt', 'acceptedAt', 'completedAt'],
  ttlAt: (c, now) => {
    if (c.status === 'pending') return c.expiresAt;
    if (c.status === 'accepted') return daysAfter(c.expiresAt, 30);
    return daysAfter(c.completedAt ?? now, 30);
  },
});

/** Open-challenge caps per sender and recipient, enforced in the create transaction. */
const bounded = boundedChallenges(challenges, 'social_open_challenge_slots');
/** Each user's slots document, for account deletion. */
export const socialChallengeSlots = bounded.slots;

const newest = (a: Challenge, b: Challenge) => b.createdAt.getTime() - a.createdAt.getTime();

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(randomInt(chars.length));
  return code;
}

/** Only the challengee answers (an admin may, explicitly). */
const isChallengee = (c: Challenge, actor: ChallengeActor) =>
  c.challengeeId === actor.userId || actor.isAdmin === true;

/**
 * Create a new challenge. Throws LimitReachedError (from open-challenge-slots)
 * when the challenger has too many open challenges out, or the challengee too
 * many waiting; the check and the write are one transaction.
 */
export async function createChallenge(
  type: ChallengeType,
  gameType: string,
  challengerId: string,
  challengerName: string,
  challengeeId: string,
  options?: { challengerScore?: number; challengerTimeMs?: number }
): Promise<Challenge> {
  const now = new Date();
  const challenge: Challenge = {
    id: `challenge_${randomUUID()}`,
    type,
    gameType,
    challengerId,
    challengerName,
    challengerScore: options?.challengerScore,
    challengerTimeMs: options?.challengerTimeMs,
    challengeeId,
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
    shareCode: generateShareCode(),
  };
  await bounded.create(challenge);
  log.info({ challengeId: challenge.id, type, gameType }, '🎮 Challenge created');
  return challenge;
}

/**
 * Accept a pending challenge. Null unless `actor` is its challengee (or an admin).
 */
export async function acceptChallenge(
  challengeId: string,
  actor: ChallengeActor,
  challengeeName: string
): Promise<Challenge | null> {
  const { written } = await bounded.answer(challengeId, (c) =>
    isChallengee(c, actor) && c.status === 'pending'
      ? {
          ...c,
          status: 'accepted',
          challengeeName,
          acceptedAt: new Date(),
          acceptedBy: actor.userId,
        }
      : null
  );
  if (written) log.info({ challengeId }, '🎮 Challenge accepted');
  return written;
}

/** Who won, for a challenge the challengee just finished. */
function decideWinner(c: Challenge): Pick<Challenge, 'winnerId' | 'tieBreaker'> {
  const { challengeeScore = 0, challengeeTimeMs, challengerTimeMs } = c;
  const fasterWins = () =>
    challengeeTimeMs && challengerTimeMs
      ? challengeeTimeMs < challengerTimeMs
        ? c.challengeeId
        : c.challengerId
      : undefined;
  if (c.type === 'speed-beat') return { winnerId: fasterWins() };
  if (c.type !== 'score-beat') return {};
  if (challengeeScore > (c.challengerScore || 0)) return { winnerId: c.challengeeId };
  if (challengeeScore < (c.challengerScore || 0)) return { winnerId: c.challengerId };
  return { tieBreaker: 'time', winnerId: fasterWins() }; // tie: time decides
}

/**
 * Complete an accepted challenge (submit the challengee's result). Null unless
 * `actor` is its challengee (or an admin) and it is accepted.
 */
export async function completeChallenge(
  challengeId: string,
  actor: ChallengeActor,
  challengeeScore: number,
  challengeeTimeMs?: number
): Promise<Challenge | null> {
  const { written } = await challenges.update(challengeId, (c) => {
    if (!isChallengee(c, actor) || c.status !== 'accepted') return null;
    const done: Challenge = {
      ...c,
      challengeeScore,
      challengeeTimeMs,
      status: 'completed',
      completedAt: new Date(),
      completedBy: actor.userId,
    };
    return { ...done, ...decideWinner(done) };
  });
  if (written) log.info({ challengeId, winnerId: written.winnerId }, '🎮 Challenge completed');
  return written;
}

/**
 * Decline a pending challenge. False unless `actor` is its challengee (or an admin).
 */
export async function declineChallenge(
  challengeId: string,
  actor: ChallengeActor
): Promise<boolean> {
  const { written } = await bounded.answer(challengeId, (c) =>
    isChallengee(c, actor) && c.status === 'pending'
      ? { ...c, status: 'declined', completedAt: new Date(), declinedBy: actor.userId }
      : null
  );
  return written !== null;
}

/**
 * Account deletion: the user's challenges (open ones resolved first, freeing
 * the other party's slot) and their slots document. Resolves to how many
 * challenges were deleted.
 */
export async function eraseSocialChallengesFor(userId: string): Promise<number> {
  return bounded.eraseUser(userId);
}

/**
 * Get challenge by ID
 */
export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  return challenges.get(challengeId);
}

/**
 * Get challenge by share code
 */
export async function getChallengeByShareCode(shareCode: string): Promise<Challenge | null> {
  return (await challenges.query({ shareCode }, 1))[0] ?? null;
}

/**
 * Get pending, unexpired challenges sent to a user, newest first (at most LIST_LIMIT read)
 */
export async function getPendingChallenges(userId: string): Promise<Challenge[]> {
  const now = new Date();
  return (await challenges.query({ challengeeId: userId, status: 'pending' }, LIST_LIMIT))
    .filter((c) => c.expiresAt > now)
    .sort(newest);
}

/**
 * Get a user's sent and received challenges, newest first (at most LIST_LIMIT
 * of each read from the store)
 */
export async function getChallengeHistory(userId: string, limit = 20): Promise<Challenge[]> {
  const [sent, received] = await Promise.all([
    challenges.query({ challengerId: userId }, LIST_LIMIT),
    challenges.query({ challengeeId: userId }, LIST_LIMIT),
  ]);
  return [...sent, ...received.filter((r) => !sent.some((s) => s.id === r.id))]
    .sort(newest)
    .slice(0, limit);
}
