/**
 * Your People nudges
 *
 * GET /api/contacts/nudges answers `{ nudges, summary, upcomingDates, ... }`
 * (src/api/contacts-routes.ts), where each nudge explains itself in `reason`.
 */

export interface Nudge {
  id?: string;
  contactId: string;
  contactName: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

/** Pull the nudge list out of the nudges response; anything else yields no nudges. */
export function parseNudgesResponse(body: unknown): Nudge[] {
  const list = Array.isArray(body) ? body : (body as { nudges?: unknown } | null)?.nudges;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (n): n is Nudge =>
      typeof n === 'object' &&
      n !== null &&
      typeof (n as Nudge).contactName === 'string' &&
      typeof (n as Nudge).reason === 'string'
  );
}
