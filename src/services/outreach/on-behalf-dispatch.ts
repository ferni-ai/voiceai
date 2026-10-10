/**
 * The agent-dispatch payload for an on-behalf call, built by whoever places the
 * call and parsed by the agent job that talks on the phone.
 *
 * An on-behalf call has two parties: the requester (our user, who asked for the
 * call) and the person on the line. The requester is kept under `requester` and
 * never as the top-level `userId`/`userName`, because those keys decide the
 * agent session's identity. Putting the requester there made the agent treat
 * the person on the line as our user: their words were saved to the user's
 * memory and the user's profile was loaded into someone else's call.
 *
 * The agent only reports a call back to the requester when the payload carries
 * a valid `requesterSignature`. Dispatch metadata can reach the agent from
 * paths a caller controls (e.g. the Twilio media-stream bridge), and a forged
 * payload must not be able to push "call results" to someone else's phone.
 *
 * @module services/outreach/on-behalf-dispatch
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CallObjective, CallType } from '../../tools/domains/telephony/types.js';

export interface OnBehalfDispatch {
  type: 'on_behalf_call';
  callId: string;
  /** Gives the agent session its own identity for the call (see module doc). */
  session_id: string;
  requester: {
    userId: string;
    name: string;
    timezone: string;
    originalSessionId: string;
  };
  contact: { name: string; phone: string; relationship?: string };
  purpose: string;
  objective: CallObjective;
  callType: CallType;
  script?: string;
  userPreferences?: unknown;
  /** HMAC from a trusted dispatcher; see signOnBehalfDispatch. */
  requesterSignature?: string;
}

export type OnBehalfDispatchInput = Omit<OnBehalfDispatch, 'type' | 'session_id'>;

export function buildOnBehalfDispatch(input: OnBehalfDispatchInput): OnBehalfDispatch {
  return { type: 'on_behalf_call', session_id: `onbehalf:${input.callId}`, ...input };
}

function signatureFor(d: OnBehalfDispatch, secret: string): string {
  // Binds who hears the result to the call that was placed
  const signed = JSON.stringify([d.callId, d.requester.userId, d.contact.phone, d.purpose]);
  return createHmac('sha256', secret).update(signed).digest('base64url');
}

/** Sign a dispatch the server itself created. Use the LiveKit API secret. */
export function signOnBehalfDispatch(d: OnBehalfDispatch, secret: string): OnBehalfDispatch {
  return { ...d, requesterSignature: signatureFor(d, secret) };
}

/** True only for a payload signed by a trusted dispatcher with this secret. */
export function isTrustedOnBehalfDispatch(
  d: OnBehalfDispatch,
  secret: string | undefined
): boolean {
  if (!secret || !d.requesterSignature) return false;
  const expected = Buffer.from(signatureFor(d, secret));
  const given = Buffer.from(d.requesterSignature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Read a dispatch payload. Returns null when it can't be reported back to a
 * requester. Also accepts the older shape with a top-level userId/userName, so
 * calls dispatched before a deploy still report back.
 */
export function parseOnBehalfDispatch(metadata: Record<string, unknown>): OnBehalfDispatch | null {
  const requester = (metadata.requester ?? {}) as Record<string, unknown>;
  const contact = (metadata.contact ?? {}) as Record<string, unknown>;
  const callId = str(metadata.callId);
  const userId = str(requester.userId) || str(metadata.userId);
  if (!callId || !userId || userId === 'unknown') return null;

  const dispatch = buildOnBehalfDispatch({
    callId,
    requester: {
      userId,
      name: str(requester.name) || str(metadata.userName) || 'your person',
      timezone: str(requester.timezone) || 'UTC',
      originalSessionId: str(requester.originalSessionId) || str(metadata.originalSessionId),
    },
    contact: {
      name: str(contact.name) || 'them',
      phone: str(contact.phone),
      relationship: str(contact.relationship) || undefined,
    },
    purpose: str(metadata.purpose) || 'a quick call',
    objective: (str(metadata.objective) || 'general') as CallObjective,
    callType: (str(metadata.callType) || 'personal') as CallType,
    script: str(metadata.script) || undefined,
  });
  const signature = str(metadata.requesterSignature);
  return signature ? { ...dispatch, requesterSignature: signature } : dispatch;
}
