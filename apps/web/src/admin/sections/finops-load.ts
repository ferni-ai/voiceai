/**
 * FinOps requests and what the section says when they fail.
 *
 * The section used to throw a bare Error on any non-2xx reply and only log it, so a refused
 * or failing request left "Loading FinOps data..." on screen forever. The FinOps routes take
 * the signed-in admin like every other admin route, so a refusal says whether the browser is
 * signed out (401) or signed in without the admin role (403).
 */

import { adminFetch } from '../admin-fetch.js';

/** A FinOps route answered with a non-2xx status. */
export class FinOpsHttpError extends Error {
  constructor(readonly status: number) {
    super(`FinOps request failed (HTTP ${status})`);
    this.name = 'FinOpsHttpError';
  }
}

/** GET a FinOps route as JSON, throwing FinOpsHttpError on a non-2xx reply. */
export async function finopsGet<T>(path: string): Promise<T> {
  const response = await adminFetch(path);
  if (!response.ok) throw new FinOpsHttpError(response.status);
  return (await response.json()) as T;
}

/** The line the loading state shows in place of "Loading FinOps data..." after a failure. */
export function finopsLoadFailure(error: unknown): string {
  if (!(error instanceof FinOpsHttpError)) return 'Could not reach the FinOps service.';
  if (error.status === 401) return 'Sign in as an admin to see FinOps (HTTP 401).';
  if (error.status === 403) return 'This account is not an admin, so FinOps is hidden (HTTP 403).';
  return `Could not load FinOps data (HTTP ${error.status}).`;
}
