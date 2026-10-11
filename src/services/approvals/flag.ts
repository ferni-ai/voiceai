/** APPROVALS_PAGE: the /a/:id and /p/:id pages and their APIs. Off unless exactly "on". */
export function isApprovalsPageEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.APPROVALS_PAGE === 'on';
}
