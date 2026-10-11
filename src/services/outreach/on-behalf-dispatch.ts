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
 * The agent only reports a call back to the requester when the dispatch it
 * received carries a valid `requesterSignature` over the whole payload. Dispatch metadata can reach the agent from
 * paths a caller controls (e.g. the Twilio media-stream bridge), and a forged
 * payload must not be able to push "call results" to someone else's phone.
 *
 * @module services/outreach/on-behalf-dispatch
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CallObjective,
  CallType,
  OnBehalfCallRequest,
} from '../../tools/domains/telephony/types.js';

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

/** JSON with sorted keys and undefined dropped, so signer and receiver hash the same bytes. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function signatureFor(payload: Record<string, unknown>, secret: string): string {
  const { requesterSignature: _omit, ...signed } = payload;
  return createHmac('sha256', secret).update(canonical(signed)).digest('base64url');
}

/**
 * Sign a dispatch the server itself created, over every field, so no part of a
 * signed payload (who hears the result, which room it goes to, what was said
 * about the call) can be changed. Use the LiveKit API secret. Any outbound
 * call the server places is signed this way (on-behalf and family check-in).
 */
export function signDispatch<T extends object>(
  d: T,
  secret: string
): T & { requesterSignature: string } {
  return { ...d, requesterSignature: signatureFor({ ...d } as Record<string, unknown>, secret) };
}

export function signOnBehalfDispatch(d: OnBehalfDispatch, secret: string): OnBehalfDispatch {
  return signDispatch(d, secret);
}

/**
 * True only when the job metadata exactly as dispatched (the raw JSON string)
 * carries a valid signature from a trusted dispatcher using this secret. The
 * one gate for every server-placed outbound call: on-behalf and family check-in.
 */
export function verifyOnBehalfDispatch(
  rawJobMetadata: string | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !rawJobMetadata) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(rawJobMetadata);
  } catch {
    return false;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const given = (payload as Record<string, unknown>).requesterSignature;
  if (typeof given !== 'string' || !given) return false;
  const expected = Buffer.from(signatureFor(payload as Record<string, unknown>, secret));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The dispatch for a call the orchestrator places from an on-behalf request. */
export function onBehalfDispatchFor(
  callId: string,
  request: OnBehalfCallRequest,
  script?: string
): OnBehalfDispatch {
  return buildOnBehalfDispatch({
    callId,
    requester: {
      userId: request.userId,
      name: request.userName,
      timezone: request.userTimezone,
      originalSessionId: request.originalSessionId,
    },
    contact: {
      name: request.resolvedContact?.name ?? request.contactQuery,
      phone: request.resolvedContact?.phone ?? '',
      relationship: request.resolvedContact?.relationship,
    },
    purpose: request.purpose,
    objective: request.objective,
    callType: request.callType,
    script,
    userPreferences: request.userPreferences,
  });
}

/** The dispatch for a call bridged in from a Twilio media stream's parameters. */
export function onBehalfDispatchFromStream(
  params: Record<string, string | undefined>,
  roomName: string
): OnBehalfDispatch {
  return buildOnBehalfDispatch({
    callId: params.callId || roomName,
    requester: {
      userId: params.userId || 'unknown',
      name: params.userName || 'User',
      timezone: 'UTC',
      originalSessionId: params.sessionId || roomName,
    },
    contact: {
      name: params.recipientName || 'Friend',
      phone: params.phone ?? '',
      relationship: params.relationship || 'contact',
    },
    purpose: params.purpose || 'Check in',
    objective: oneOf(params.objective, OBJECTIVES, 'general'),
    callType: oneOf(params.callType, CALL_TYPES, 'personal'),
  });
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const OBJECTIVES: readonly CallObjective[] = [
  'reschedule',
  'cancel',
  'new_appointment',
  'inquiry',
  'reservation',
  'check_in',
  'deliver_message',
  'general',
];
const CALL_TYPES: readonly CallType[] = ['business', 'personal', 'emergency'];

/** Only a known value reaches the call; anything else gets the default. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Read a dispatch payload. Returns null when it can't be reported back to a
 * requester. Also accepts the older shape with a top-level userId/userName, so
 * calls dispatched before a deploy still report back.
 */
export function parseOnBehalfDispatch(metadata: Record<string, unknown>): OnBehalfDispatch | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const requester = asObject(metadata.requester);
  const contact = asObject(metadata.contact);
  const callId = str(metadata.callId);
  const userId = str(requester.userId) || str(metadata.userId);
  if (!callId || !userId || userId === 'unknown') return null;

  return buildOnBehalfDispatch({
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
    objective: oneOf(metadata.objective, OBJECTIVES, 'general'),
    callType: oneOf(metadata.callType, CALL_TYPES, 'personal'),
    script: str(metadata.script) || undefined,
  });
}
