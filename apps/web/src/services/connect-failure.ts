/**
 * Connect Failure
 *
 * Classifies why a call couldn't start, and maps each reason to ONE short,
 * human message plus the action the user can take. The app shows exactly one
 * of these per failed attempt, so "Reconnecting..." and "Couldn't connect"
 * never compete on screen.
 */

import { t } from '../i18n/index.js';
import type { WaitlistStatus } from './waitlist-status.js';

export type ConnectFailureKind =
  | 'unauthorized' // 401 from /token: sign-in expired or missing
  | 'forbidden' // 403 from /token: identity mismatch
  | 'waitlisted' // 403 WAITLISTED from /token: signed in, not admitted yet
  | 'rate_limited' // 429 from /token
  | 'unavailable' // 503 from /token: auth/backend temporarily down
  | 'server_error' // other non-OK /token responses
  | 'mic_denied' // browser blocked the microphone
  | 'agent_unavailable' // server could not dispatch the voice agent
  | 'agent_timeout' // room joined but no agent arrived in time
  | 'timeout' // the whole attempt took too long and was cancelled
  | 'network' // fetch / websocket could not reach the server
  | 'cancelled' // superseded by a hang-up or a newer attempt; show nothing
  | 'dropped' // an established call lost its connection
  | 'agent_left' // Ferni's side of the call ended while the caller was still in it
  | 'unknown';

export type ConnectFailureAction = 'retry' | 'sign-in' | 'mic-help' | 'none';

export interface ConnectFailure {
  readonly kind: ConnectFailureKind;
  readonly message: string;
  readonly action: ConnectFailureAction;
  /** Where they stand in line, for the waiting screen ('waitlisted' only) */
  readonly waitlist?: WaitlistStatus;
}

/** /token answered with a non-OK status. */
export class TokenRequestError extends Error {
  constructor(
    readonly status: number,
    detail: string,
    /** Set when the refusal is the waitlist (403 WAITLISTED) */
    readonly waitlist?: WaitlistStatus
  ) {
    super(`Token request failed: ${status} - ${detail}`);
    this.name = 'TokenRequestError';
  }
}

/** A connect step failed for a reason we already know how to describe. */
export class ConnectStepError extends Error {
  constructor(
    readonly kind: ConnectFailureKind,
    detail?: string
  ) {
    super(detail ?? kind);
    this.name = 'ConnectStepError';
  }
}

interface FailureCopy {
  messageKey: string | null;
  action: ConnectFailureAction;
}

const COPY: Record<ConnectFailureKind, FailureCopy> = {
  unauthorized: { messageKey: 'connectFailure.unauthorized', action: 'sign-in' },
  forbidden: { messageKey: 'connectFailure.forbidden', action: 'sign-in' },
  waitlisted: { messageKey: 'connectFailure.waitlisted', action: 'none' },
  rate_limited: { messageKey: 'connectFailure.rateLimited', action: 'retry' },
  unavailable: { messageKey: 'connectFailure.unavailable', action: 'retry' },
  server_error: { messageKey: 'connectFailure.serverError', action: 'retry' },
  mic_denied: { messageKey: 'connectFailure.micDenied', action: 'mic-help' },
  agent_unavailable: { messageKey: 'connectFailure.agentUnavailable', action: 'retry' },
  agent_timeout: { messageKey: 'connectFailure.agentTimeout', action: 'retry' },
  timeout: { messageKey: 'connectFailure.timeout', action: 'retry' },
  network: { messageKey: 'connectFailure.network', action: 'retry' },
  cancelled: { messageKey: null, action: 'none' },
  dropped: { messageKey: 'connectFailure.dropped', action: 'retry' },
  agent_left: { messageKey: 'connectFailure.agentLeft', action: 'retry' },
  unknown: { messageKey: 'connectFailure.unknown', action: 'retry' },
};

/** Build the failure record for a known kind. */
export function connectFailure(kind: ConnectFailureKind): ConnectFailure {
  const { messageKey, action } = COPY[kind];
  return { kind, message: messageKey ? t(messageKey) : '', action };
}

function kindForStatus(status: number): ConnectFailureKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'server_error';
}

function isMicPermissionError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'PermissionDeniedError';
}

/** Turn whatever a connect step threw into a single user-facing failure. */
export function classifyConnectError(error: unknown): ConnectFailure {
  if (error instanceof ConnectStepError) return connectFailure(error.kind);
  if (error instanceof TokenRequestError && error.waitlist) {
    return { ...connectFailure('waitlisted'), waitlist: error.waitlist };
  }
  if (error instanceof TokenRequestError) return connectFailure(kindForStatus(error.status));
  if (isMicPermissionError(error)) return connectFailure('mic_denied');
  const message = error instanceof Error ? error.message : String(error);
  if (/network|failed to fetch|websocket|could not establish/i.test(message)) {
    return connectFailure('network');
  }
  return connectFailure('unknown');
}
