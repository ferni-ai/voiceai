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
 * @module services/outreach/on-behalf-dispatch
 */

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
}

export type OnBehalfDispatchInput = Omit<OnBehalfDispatch, 'type' | 'session_id'>;

export function buildOnBehalfDispatch(input: OnBehalfDispatchInput): OnBehalfDispatch {
  return { type: 'on_behalf_call', session_id: `onbehalf:${input.callId}`, ...input };
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
  const requester = (metadata.requester ?? {}) as Record<string, unknown>;
  const contact = (metadata.contact ?? {}) as Record<string, unknown>;
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
