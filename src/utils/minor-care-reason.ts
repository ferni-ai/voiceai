/**
 * Why careHolds (minor-care.ts) holds a session, the first that applies, and whether a sexual-topic
 * read still running is the only hold on the call (onlyReadRunning). PHONE_SAFE_SETTLED_HOLD: a
 * verified owner's tool filter drops the cut only then. Memory writes keep careHolds, so they
 * still fail closed on that read.
 *
 * @module utils/minor-care-reason
 */
import { demoCallHeld, minorHeld, userAgeHeld } from './minor-care.js';
import {
  sexualTopicConfirmed,
  sexualTopicHeld,
  sexualTopicUserHeldBesides,
} from './sexual-topic-hold.js';
import { isAnonymousDemoUser } from './synthetic-user.js';

export type CareHoldReason = 'try-first' | 'minor-care' | 'sexual-topic' | 'sexual-read-running';

/** The order is careHolds' plus heldAfter's anonymous-visitor check; undefined when none applies. */
export function careHoldReason(
  sessionId: string | undefined,
  userId: string | undefined,
  env: Record<string, string | undefined> = process.env
): CareHoldReason | undefined {
  if (demoCallHeld(sessionId) || isAnonymousDemoUser(userId)) return 'try-first';
  if (minorHeld(sessionId, env)) return 'minor-care';
  if (sexualTopicConfirmed(sessionId, env)) return 'sexual-topic';
  if (sexualTopicHeld(sessionId, env)) return 'sexual-read-running';
  return undefined;
}

/**
 * The call's only hold is this session's sexual-topic read still running: careHoldReason says so,
 * and no user-level hold applies (userHeld, minor-care.ts, but for this session's own running read:
 * the user's age read on another session, or a sexual-topic hold or read on another).
 */
export function onlyReadRunning(
  sessionId: string | undefined,
  userId: string | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    careHoldReason(sessionId, userId, env) === 'sexual-read-running' &&
    !userAgeHeld(userId, env) &&
    !sexualTopicUserHeldBesides(userId, sessionId, env)
  );
}
