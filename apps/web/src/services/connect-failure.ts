/**
 * Connect Failure
 *
 * Classifies why a call couldn't start, and maps each reason to ONE short,
 * human message plus the action the user can take. The app shows exactly one
 * of these per failed attempt, so "Reconnecting..." and "Couldn't connect"
 * never compete on screen.
 */

export type ConnectFailureKind =
  | 'unauthorized' // 401 from /token: sign-in expired or missing
  | 'forbidden' // 403 from /token: identity mismatch
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
  | 'unknown';

export type ConnectFailureAction = 'retry' | 'sign-in' | 'mic-help' | 'none';

export interface ConnectFailure {
  readonly kind: ConnectFailureKind;
  readonly message: string;
  readonly action: ConnectFailureAction;
}

/** /token answered with a non-OK status. */
export class TokenRequestError extends Error {
  constructor(
    readonly status: number,
    detail: string
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

const COPY: Record<ConnectFailureKind, Omit<ConnectFailure, 'kind'>> = {
  unauthorized: { message: 'Your sign-in expired. Sign in and try again?', action: 'sign-in' },
  forbidden: { message: "That account doesn't match. Sign in again?", action: 'sign-in' },
  rate_limited: { message: 'Too many tries just now. Give it a minute?', action: 'retry' },
  unavailable: { message: "Ferni's taking a breather. Try again shortly?", action: 'retry' },
  server_error: { message: 'Something went wrong on our end. Try again?', action: 'retry' },
  mic_denied: {
    message: 'I need your microphone to hear you. Allow it, then try again.',
    action: 'mic-help',
  },
  agent_unavailable: { message: "Ferni couldn't join this time. Try again?", action: 'retry' },
  agent_timeout: { message: "Ferni didn't join in time. Try again?", action: 'retry' },
  timeout: { message: 'That took too long. Check your connection and retry?', action: 'retry' },
  network: { message: "Couldn't reach Ferni. Check your internet and retry?", action: 'retry' },
  cancelled: { message: '', action: 'none' },
  dropped: { message: 'Lost the connection. Reconnect?', action: 'retry' },
  unknown: { message: "Couldn't connect. Try again?", action: 'retry' },
};

/** Build the failure record for a known kind. */
export function connectFailure(kind: ConnectFailureKind): ConnectFailure {
  return { kind, ...COPY[kind] };
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
  if (error instanceof TokenRequestError) return connectFailure(kindForStatus(error.status));
  if (isMicPermissionError(error)) return connectFailure('mic_denied');
  const message = error instanceof Error ? error.message : String(error);
  if (/network|failed to fetch|websocket|could not establish/i.test(message)) {
    return connectFailure('network');
  }
  return connectFailure('unknown');
}
