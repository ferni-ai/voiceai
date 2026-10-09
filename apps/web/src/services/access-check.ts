/**
 * Can this signed-in user use the app? Asks GET /api/waitlist/check and turns
 * the answer into what the sign-in gate should show.
 *
 * A failed check is not a "no": rate limits, server errors and dropped
 * connections used to fall through to the waitlist screen, telling approved
 * users they were still waiting. Those now retry, then surface as
 * 'unavailable' so the gate can offer Retry instead.
 */

import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AccessCheck');

/** What the server answers (src/api/waitlist-routes.ts) */
interface AccessCheckResponse {
  approved: boolean;
  status: 'approved' | 'pending' | 'no_email' | 'unverified_email' | 'not_found';
  email?: string;
}

export type AccessOutcome =
  | { kind: 'approved' }
  | { kind: 'waitlisted'; email?: string }
  | { kind: 'verify-email' }
  | { kind: 'no-email' }
  /** The check itself failed (network, server error, still rate limited) */
  | { kind: 'unavailable' };

export interface AccessCheckOptions {
  attempts?: number;
  /** Delay before retry n (1-based) after a rate limit or server error */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function outcomeOf(response: AccessCheckResponse): AccessOutcome {
  if (response.approved) return { kind: 'approved' };
  switch (response.status) {
    case 'unverified_email':
      return { kind: 'verify-email' };
    case 'no_email':
      return { kind: 'no-email' };
    case 'pending':
      return { kind: 'waitlisted', email: response.email };
    default:
      return { kind: 'unavailable' };
  }
}

export async function checkAccess({
  attempts = 3,
  backoffMs = (attempt) => 2_000 * attempt,
  sleep = wait,
}: AccessCheckOptions = {}): Promise<AccessOutcome> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Our own backoff below; the generic quick retries would just spend the rate limit.
    const response = await apiGet<AccessCheckResponse>('/api/waitlist/check', undefined, { maxRetries: 0 });
    if (response.ok && response.data) return outcomeOf(response.data);

    const retriable = response.status === 0 || response.status === 429 || response.status >= 500;
    log.warn('Access check failed', { status: response.status, attempt, retriable });
    if (!retriable || attempt === attempts) break;
    await sleep(backoffMs(attempt));
  }
  return { kind: 'unavailable' };
}
