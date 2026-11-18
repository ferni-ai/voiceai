/**
 * FinOps requests and what the section says when they fail.
 *
 * The section used to throw a bare Error on any non-2xx reply and only log it, so a refused
 * or failing request left "Loading FinOps data..." on screen forever. The FinOps routes take
 * only the server's admin key (not the Firebase sign-in), so a signed-in admin with no key
 * saved gets 401 and needs to be told that, not shown a spinner.
 */

import { finopsFetch, getStoredAdminKey } from '../admin-fetch.js';

/** A FinOps route answered with a non-2xx status. */
export class FinOpsHttpError extends Error {
  constructor(readonly status: number) {
    super(`FinOps request failed (HTTP ${status})`);
    this.name = 'FinOpsHttpError';
  }
}

/** GET a FinOps route as JSON, throwing FinOpsHttpError on a non-2xx reply. */
export async function finopsGet<T>(path: string): Promise<T> {
  const response = await finopsFetch(path);
  if (!response.ok) throw new FinOpsHttpError(response.status);
  return (await response.json()) as T;
}

/** The line the loading state shows in place of "Loading FinOps data..." after a failure. */
export function finopsLoadFailure(
  error: unknown,
  hasAdminKey = getStoredAdminKey() !== ''
): string {
  if (!(error instanceof FinOpsHttpError)) return 'Could not reach the FinOps service.';
  if (error.status === 401 || error.status === 403) {
    return hasAdminKey
      ? `The FinOps service refused the admin key saved in this browser (HTTP ${error.status}).`
      : `FinOps needs the server's admin key, and none is saved in this browser (HTTP ${error.status}).`;
  }
  return `Could not load FinOps data (HTTP ${error.status}).`;
}
