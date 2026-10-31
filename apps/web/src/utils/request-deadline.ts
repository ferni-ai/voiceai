/**
 * Time limits for API calls, so a request the server never answers ends in an
 * error the screen can show, not a spinner that never stops.
 *
 * Shared by apiGet/apiPost (utils/api.ts), apiFetch (utils/api-helpers.ts) and
 * fetchWithRetry (utils/fetch-retry.ts).
 */

/** How long one request may wait for the server to answer before it is given up. */
export const API_REQUEST_TIMEOUT_MS = 15_000;

/**
 * For work the server may take minutes over (a full export, erasing an account):
 * the API service's own 300 s Cloud Run request limit, past which it has given up too.
 */
export const LONG_REQUEST_TIMEOUT_MS = 300_000;

/** How long an API call waits for sign-in to start before going on without it. */
export const AUTH_READY_TIMEOUT_MS = 5_000;

/** A request that got no answer within its time limit. */
export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Request timeout after ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

/** `promise`'s value, or `fallback` once `ms` pass first. */
export function valueWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * fetch that gives up after `ms`: it aborts the request and rejects with
 * RequestTimeoutError, even if the fetch itself ignores the abort. The limit
 * covers waiting for the response, not reading its body. A caller's own
 * `signal` still cancels the request.
 */
export async function fetchWithDeadline(
  url: string,
  init: RequestInit = {},
  ms = API_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const cancel = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener('abort', cancel, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new RequestTimeoutError(ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), late]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
  }
}
