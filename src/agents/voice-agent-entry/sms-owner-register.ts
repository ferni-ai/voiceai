/**
 * Tells the SMS reading tools (tools/domains/simple-utilities/sms-reading-tools.ts)
 * which sessions may read their own texts with Ferni: the account's owner on a
 * signed-in app call (an authenticated dispatch), never a caller matched only
 * by caller ID, and never a call Ferni placed to someone else. Until this
 * registers, the tools refuse every read. Imported for its side effect by
 * gce/job-executor.ts.
 *
 * @module agents/voice-agent-entry/sms-owner-register
 */
import { registerSmsOwnerSessionCheck } from '../../tools/domains/simple-utilities/sms-reading-tools.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { phoneOnlyIdentity, sessionIsVerifiedOwner } from './caller-recognition.js';

export function signedInOwnerSession(sessionId: string): boolean {
  return (
    sessionIsVerifiedOwner(sessionId) &&
    !phoneOnlyIdentity(sessionId) &&
    !outboundPartiesFor(sessionId)
  );
}

registerSmsOwnerSessionCheck(signedInOwnerSession);
