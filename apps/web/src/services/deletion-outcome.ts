/**
 * How a delete request ended, as far as this browser can know.
 *
 * The server keeps erasing after the browser stops waiting: neither
 * DELETE /api/export/all (src/api/routes/data.ts) nor DELETE /api/account
 * (src/api/account-routes.ts) stops when the client goes. So only the server's
 * own answer can say what happened, and without one the screen must not claim
 * that nothing was removed.
 *
 * - confirmed: a 2xx.
 * - refused: a 4xx. Both routes check sign-in, rate limit and the confirmation
 *   before they erase anything, so nothing was removed.
 * - unknown: no answer (a timeout, a network error) or a 5xx: Cloud Run's 504 at
 *   its 300 s limit, or an erasure that stopped part-way. Some data may be gone.
 */

export type DeletionOutcome = 'confirmed' | 'refused' | 'unknown';

/** `null`: the request got no answer at all. */
export function deletionOutcome(response: Response | null): DeletionOutcome {
  if (!response) return 'unknown';
  if (response.ok) return 'confirmed';
  return response.status >= 400 && response.status < 500 ? 'refused' : 'unknown';
}

const FAILURE_KEYS = {
  data: {
    refused: 'dataExportService.deleteDataFailed',
    unknown: 'dataExportService.deleteDataUnknown',
  },
  account: {
    refused: 'dataExportService.deleteAccountFailed',
    unknown: 'dataExportService.deleteAccountUnknown',
  },
} as const;

/**
 * The message key for a delete that wasn't confirmed. A refusal for sign-in
 * (401/403) says to sign in again; any other refusal says nothing was removed;
 * an unknown outcome says it couldn't be confirmed and may still be finishing.
 */
export function deletionFailureKey(
  outcome: Exclude<DeletionOutcome, 'confirmed'>,
  status: number | undefined,
  what: keyof typeof FAILURE_KEYS
): string {
  if (outcome === 'refused' && (status === 401 || status === 403)) {
    return 'dataExportService.deleteRefusedSignIn';
  }
  return FAILURE_KEYS[what][outcome];
}
