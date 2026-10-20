/**
 * Notes a turn whose reply carries crisis handling (crisis-call-risk.ts
 * noteCrisisReply) and, the first time for a call, registers the clear with the
 * session cleanup registry, which the entrypoint runs once the call is over
 * (voice-agent-entry runSessionCleanup). An agents-side leaf, so the safety
 * service does not import the session registry.
 *
 * @module agents/safety/crisis-reply-record
 */

import { clearCrisisCall, noteCrisisReply } from '../../services/safety/crisis-call-risk.js';
import { registerCleanup } from '../session/event-cleanup-registry.js';

export function noteCrisisReplyForCall(sessionId: string | undefined, latest: string): void {
  if (!noteCrisisReply(sessionId, latest) || !sessionId) return;
  registerCleanup(sessionId, 'resource', 'crisis reply record (crisis-call-risk.ts)', () =>
    clearCrisisCall(sessionId)
  );
}
