/**
 * What may be said about a failed call to LiveKit: the method, the HTTP status, the Twirp
 * `code`, the underlying error's name and whether it timed out. Never LiveKit's `msg`, an SDK
 * error's message or a response body: those can quote the request or a credential, and they
 * would reach the logs.
 *
 * @module config/agent-flags/domain/dev-agent-error
 */

export interface DevAgentFailure {
  /** e.g. `CloudAgent.ListAgentSecrets`, `RoomService.ListRooms` */
  method?: string;
  status?: number;
  /** The Twirp error code, e.g. `internal`, `malformed` */
  code?: string;
  /** The name of the error that was caught, e.g. `TimeoutError`, `TypeError` */
  causeName?: string;
  timedOut?: boolean;
}

/** A short identifier (a Twirp code or an error name), or undefined for anything else. */
export function safeWord(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z_]{1,40}$/.test(value) ? value : undefined;
}

function describe(what: string, f: DevAgentFailure): string {
  const head = [f.method, what].filter(Boolean).join(' ');
  const parts = [
    f.status !== undefined && `HTTP ${f.status}`,
    f.code,
    f.causeName,
    f.timedOut && '(timed out)',
  ].filter(Boolean);
  return parts.length > 0 ? `${head}: ${parts.join(' ')}` : head;
}

/**
 * An error from the dev agent adapter that is safe to log whole. `what` is fixed text from
 * the adapter; no `cause` is kept, since the cause carries the text this error leaves out.
 */
export class DevAgentError extends Error {
  readonly failure: DevAgentFailure;

  constructor(what: string, failure: DevAgentFailure = {}) {
    super(describe(what, failure));
    this.name = 'DevAgentError';
    this.failure = failure;
  }
}

/** Wraps an error thrown by fetch or the room service, keeping only what DevAgentFailure allows. */
export function callFailed(method: string, error: unknown): DevAgentError {
  const e = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const causeName = safeWord(e.name);
  return new DevAgentError('failed', {
    method,
    ...(typeof e.status === 'number' && { status: e.status }),
    ...(safeWord(e.code) && { code: safeWord(e.code) }),
    ...(causeName && { causeName }),
    timedOut: causeName === 'TimeoutError',
  });
}

/**
 * The Twirp code when LiveKit answered with an error response (not 2xx, with a code): it
 * handled the request and changed nothing. Undefined for a timeout, a network error or an
 * unconfirmed answer, after which the update may have applied.
 */
export function refusalCode(error: unknown): string | undefined {
  if (!(error instanceof DevAgentError)) return undefined;
  const { status, code } = error.failure;
  return status !== undefined && (status < 200 || status >= 300) ? code : undefined;
}

/** What to log about an error from a DevAgent: a DevAgentError's message and fields, else its name. */
export function loggableError(error: unknown): Record<string, unknown> {
  if (error instanceof DevAgentError) return { message: error.message, ...error.failure };
  const name = error instanceof Error ? safeWord(error.name) : undefined;
  return { name: name ?? typeof error };
}
