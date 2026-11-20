/**
 * Why careHolds (minor-care.ts) holds a session, the first that applies. PHONE_SAFE_SETTLED_HOLD
 * reads it: a verified owner's tool filter drops the cut when the only reason is a sexual-topic
 * read still running. Memory writes keep careHolds, so they still fail closed on that read.
 *
 * @module utils/minor-care-reason
 */
import { demoCallHeld, minorHeld } from './minor-care.js';
import { sexualTopicConfirmed, sexualTopicHeld } from './sexual-topic-hold.js';
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
