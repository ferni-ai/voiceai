/**
 * One follow-up question per call opener, whoever asks it.
 *
 * Three things can open a call by asking about something from before: the
 * greeting's commitment check-in (COACH_FOLLOW_THROUGH), the greeting's
 * pondered item (PONDERING), and the first recall note's open-thread line
 * (OPENER_FOLLOW_UP). Each was written to ask at most one thing, but not
 * knowing about the others, a caller could hear "How did the running go?"
 * from the greeting and then, after their hello, "And how's Biscuit's knee?".
 * A friend asks one thing.
 *
 * The rule: the first to ask wins the call. The greeting speaks before the
 * caller does, so a follow-up the greeting actually asked claims the opener,
 * and the recall note's thread line is left out. (Within the greeting, a
 * check-in already beats a pondered item.) The recall note takes the claim
 * with its first note, so one call's claim never reaches the next; a claim
 * also lapses after CLAIM_MS. Claims live in the agent process, where both
 * the greeting and recall run for a call.
 *
 * @module memory/recall/opener-claim
 */

/** Longer than any greeting-to-first-turn gap; short enough that a stray claim can't linger. */
export const CLAIM_MS = 10 * 60_000;

/** 'greeting-date': the hello raised a date the caller told about (DATES_IN_HELLO, greeting-date.ts). */
export type OpenerAsker = 'greeting' | 'greeting-date' | 'recall-thread';

const claims = new Map<string, { by: OpenerAsker; at: number }>();

/** The greeting asked a follow-up for this caller's call. */
export function claimOpenerFollowUp(userId: string, by: OpenerAsker, now = Date.now()): void {
  claims.set(userId, { by, at: now });
}

/**
 * Who already asked a follow-up on this call, if anyone, and clears it: the
 * recall hook calls this once, with the call's first note.
 */
export function takeOpenerClaim(userId: string, now = Date.now()): OpenerAsker | undefined {
  const claim = claims.get(userId);
  claims.delete(userId);
  return claim && now - claim.at < CLAIM_MS ? claim.by : undefined;
}

/** For tests. */
export function clearOpenerClaims(): void {
  claims.clear();
}
