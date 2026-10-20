/**
 * Notes a turn whose reply carries crisis handling (crisis-call-risk.ts
 * noteCrisisReply) and, the first time for a call, registers the clear of that
 * record (never the call's noted risk) with the session cleanup registry, which
 * the entrypoint runs once the call is over (voice-agent-entry runSessionCleanup)
 * and whose orphan sweep may run it after 2 hours: then the adjudicator only
 * asks the model again, with no effect on the reply. An agents-side leaf, so the safety
 * service does not import the session registry.
 *
 * @module agents/safety/crisis-reply-record
 */

import { clearCrisisReplies, noteCrisisReply } from '../../services/safety/crisis-call-risk.js';
import { registerCleanup, touchSessionRegistry } from '../session/event-cleanup-registry.js';

export function noteCrisisReplyForCall(sessionId: string | undefined, latest: string): void {
  const first = noteCrisisReply(sessionId, latest);
  if (!sessionId) return;
  if (!first) {
    // An active crisis call never looks orphaned to the registry's sweep.
    touchSessionRegistry(sessionId);
    return;
  }
  registerCleanup(sessionId, 'resource', 'crisis reply record (crisis-call-risk.ts)', () =>
    clearCrisisReplies(sessionId)
  );
}
