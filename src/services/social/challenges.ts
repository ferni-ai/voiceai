/**
 * Head-to-head social challenges (score-beat, speed-beat), stored where every
 * API instance sees them (see shared-records). Moved out of
 * multiplayer-games.ts, which re-exports these functions.
 *
 * @module services/social/challenges
 */
import { randomUUID, randomInt } from 'node:crypto';
import { getLogger } from '../../utils/safe-logger.js';
import { daysAfter, sharedRecords } from './shared-records.js';
import type { Challenge, ChallengeType } from './multiplayer-games.js';

const log = getLogger();

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

const newest = (a: Challenge, b: Challenge) => b.createdAt.getTime() - a.createdAt.getTime();

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(randomInt(chars.length));
  return code;
}

/**
 * Create a new challenge
 */
export async function createChallenge(
  type: ChallengeType,
  gameType: string,
  challengerId: string,
  challengerName: string,
  challengeeId: string,
  options?: { challengerScore?: number; challengerTimeMs?: number }
): Promise<Challenge> {
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
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    shareCode: generateShareCode(),
  };
  await challenges.put(challenge.id, challenge);
  log.info({ challengeId: challenge.id, type, gameType }, '🎮 Challenge created');
  return challenge;
}

/**
 * Accept a pending challenge as its challengee
 */
export async function acceptChallenge(
  challengeId: string,
  challengeeId: string,
  challengeeName: string
): Promise<Challenge | null> {
  const { written } = await challenges.update(challengeId, (c) =>
    c.challengeeId === challengeeId && c.status === 'pending'
      ? { ...c, status: 'accepted', challengeeName, acceptedAt: new Date() }
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
 * Complete an accepted challenge (submit the challengee's result)
 */
export async function completeChallenge(
  challengeId: string,
  challengeeScore: number,
  challengeeTimeMs?: number
): Promise<Challenge | null> {
  const { written } = await challenges.update(challengeId, (c) => {
    if (c.status !== 'accepted') return null;
    const done: Challenge = {
      ...c,
      challengeeScore,
      challengeeTimeMs,
      status: 'completed',
      completedAt: new Date(),
    };
    return { ...done, ...decideWinner(done) };
  });
  if (written) log.info({ challengeId, winnerId: written.winnerId }, '🎮 Challenge completed');
  return written;
}

/**
 * Decline a pending challenge as its challengee
 */
export async function declineChallenge(
  challengeId: string,
  challengeeId: string
): Promise<boolean> {
  const { written } = await challenges.update(challengeId, (c) =>
    c.challengeeId === challengeeId && c.status === 'pending' ? { ...c, status: 'declined' } : null
  );
  return written !== null;
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
  return (await challenges.where('shareCode', shareCode))[0] ?? null;
}

/**
 * Get pending, unexpired challenges sent to a user, newest first
 */
export async function getPendingChallenges(userId: string): Promise<Challenge[]> {
  const now = new Date();
  return (await challenges.where('challengeeId', userId))
    .filter((c) => c.status === 'pending' && c.expiresAt > now)
    .sort(newest);
}

/**
 * Get a user's sent and received challenges, newest first
 */
export async function getChallengeHistory(userId: string, limit = 20): Promise<Challenge[]> {
  const [sent, received] = await Promise.all([
    challenges.where('challengerId', userId),
    challenges.where('challengeeId', userId),
  ]);
  return [...sent, ...received.filter((r) => !sent.some((s) => s.id === r.id))]
    .sort(newest)
    .slice(0, limit);
}
