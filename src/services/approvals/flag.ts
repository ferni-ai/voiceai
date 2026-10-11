/**
 * APPROVALS_PAGE: the signed-in approvals and sources pages (/a/:id, /p/:id)
 * and their APIs. Off unless exactly "on".
 *
 * @module services/approvals/flag
 */
export function isApprovalsPageEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.APPROVALS_PAGE === 'on';
}
