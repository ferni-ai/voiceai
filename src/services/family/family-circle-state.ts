/**
 * Who on this call is in the owner's family circle, per session. Only the
 * family circle decision (agents/voice-agent-entry/family-circle.ts) writes it,
 * after every proof held, and the session's cleanup forgets it. Its reader lands
 * with its first caller; a missing entry is the public circle. In services so
 * tools, services and agents can all reach it.
 *
 * @module services/family/family-circle-state
 */

export interface FamilyCircleMember {
  sponsoredIdentityId: string;
  familyUserId: string;
  displayName: string;
}

const bySession = new Map<string, FamilyCircleMember>();
/** A session that ends without forgetting its entry is dropped, oldest first. */
const MAX_SESSIONS = 500;

export function rememberFamilyCircle(sessionId: string, member: FamilyCircleMember): void {
  bySession.delete(sessionId);
  bySession.set(sessionId, member);
  if (bySession.size > MAX_SESSIONS) bySession.delete(bySession.keys().next().value as string);
}

export function forgetFamilyCircle(sessionId: string): void {
  bySession.delete(sessionId);
}
